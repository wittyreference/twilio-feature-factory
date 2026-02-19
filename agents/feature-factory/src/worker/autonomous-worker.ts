// ABOUTME: Main autonomous worker loop connecting work sources to the orchestrator.
// ABOUTME: Polls for work, applies approval policy, and executes workflows.

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import type { DiscoveredWork, SuggestedWorkflow } from '../discovery/work-discovery.js';
import type { WorkflowType } from '../types.js';
import { PersistentQueue, type QueueStats } from './persistent-queue.js';
import { evaluateApproval, createDefaultPolicy, type ApprovalPolicy } from './approval-policy.js';
import { saveWorkerStatus, type WorkerStatus } from './worker-status.js';
import type { WorkSourceProvider } from './work-sources.js';

const FF_DIR = '.feature-factory';
const LOCK_FILE = 'worker.lock';
const STOP_SIGNAL_FILE = 'worker-stop-signal';

/**
 * Configuration for the autonomous worker.
 */
export interface AutonomousWorkerConfig {
  /** Working directory for file persistence. */
  workingDirectory: string;
  /** Poll interval in milliseconds. Default: 60000 (1 minute). */
  pollIntervalMs?: number;
  /** Total budget cap in USD. Default: 50. */
  maxBudgetUsd?: number;
  /** Per-item budget cap in USD. Default: 10. */
  maxItemBudgetUsd?: number;
  /** Approval policy overrides. */
  approvalPolicy?: Partial<ApprovalPolicy>;
  /** Enable verbose logging. Default: false. */
  verbose?: boolean;
  /** Enable sandbox for each workflow run. Default: true. */
  enableSandbox?: boolean;
  /** Callback for tier 3 confirmation requests. If absent, tier 3 is escalated. */
  onConfirmationRequired?: (work: DiscoveredWork) => Promise<boolean>;
  /** Callback to execute a workflow. If absent, work is only queued (no execution). */
  onExecuteWorkflow?: (workflowType: WorkflowType, description: string, budgetUsd: number) => Promise<WorkflowResult>;
}

/**
 * Result from executing a workflow.
 */
export interface WorkflowResult {
  success: boolean;
  costUsd: number;
  resolution?: string;
  error?: string;
}

/**
 * Worker event types.
 */
export interface AutonomousWorkerEvents {
  'worker-started': [];
  'worker-stopped': [];
  'work-picked-up': [work: DiscoveredWork];
  'work-completed': [work: DiscoveredWork, result: WorkflowResult];
  'work-failed': [work: DiscoveredWork, error: Error];
  'work-escalated': [work: DiscoveredWork, reason: string];
  'work-confirmed': [work: DiscoveredWork];
  'error': [error: Error];
}

/**
 * Autonomous worker that connects work sources to the orchestrator.
 *
 * Lifecycle:
 * 1. Register work sources via registerSource()
 * 2. start() — creates lock file, begins poll loop
 * 3. Each poll: check stop signal, poll sources, add to queue, process next
 * 4. stop() — finishes current work, clears timer, removes lock file
 */
export class AutonomousWorker extends EventEmitter {
  private readonly config: Required<Pick<AutonomousWorkerConfig,
    'workingDirectory' | 'pollIntervalMs' | 'maxBudgetUsd' | 'maxItemBudgetUsd' | 'verbose' | 'enableSandbox'
  >> & AutonomousWorkerConfig;

  private readonly queue: PersistentQueue;
  private readonly policy: ApprovalPolicy;
  private readonly sources: WorkSourceProvider[] = [];
  private readonly ffDir: string;

  private pollTimer?: NodeJS.Timeout;
  private isRunning = false;
  private isProcessing = false;
  private totalSpentUsd = 0;
  private completedCount = 0;
  private escalatedCount = 0;
  private failedCount = 0;
  private startedAt?: Date;

  constructor(config: AutonomousWorkerConfig) {
    super();
    this.config = {
      pollIntervalMs: 60000,
      maxBudgetUsd: 50,
      maxItemBudgetUsd: 10,
      verbose: false,
      enableSandbox: true,
      ...config,
    };

    this.ffDir = path.join(this.config.workingDirectory, FF_DIR);
    this.queue = new PersistentQueue(this.config.workingDirectory);
    this.policy = {
      ...createDefaultPolicy(),
      ...config.approvalPolicy,
    };
  }

  /**
   * Register a work source provider.
   */
  registerSource(source: WorkSourceProvider): void {
    this.sources.push(source);
  }

  /**
   * Start the worker loop.
   * Creates a lock file and begins polling registered sources.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Worker is already running');
    }

    // Check for existing lock
    if (this.isLocked()) {
      throw new Error('Another worker is already running (lock file exists)');
    }

    // Create lock file
    this.acquireLock();
    this.isRunning = true;
    this.startedAt = new Date();

    // Clear any stale stop signal
    this.clearStopSignal();

    // Save initial status
    this.saveStatus();

    this.emit('worker-started');

    if (this.config.verbose) {
      console.log('[worker] Started, polling every', this.config.pollIntervalMs, 'ms');
    }

    // Start poll loop
    this.pollTimer = setInterval(() => {
      this.pollOnce().catch((err: unknown) => {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      });
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the worker gracefully.
   * Waits for current work to complete, then cleans up.
   */
  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    this.isRunning = false;
    this.releaseLock();
    this.clearStopSignal();
    this.saveStatus();
    this.emit('worker-stopped');

    if (this.config.verbose) {
      console.log('[worker] Stopped');
    }
  }

  /**
   * Run a single poll cycle. Public for testing.
   */
  async pollOnce(): Promise<void> {
    // Check stop signal
    if (await this.checkStopSignal()) {
      await this.stop();
      return;
    }

    // Don't start new work if already processing
    if (this.isProcessing) {
      return;
    }

    // Poll all sources for new work
    for (const source of this.sources) {
      if (!source.enabled) continue;

      try {
        const items = await source.poll();
        for (const item of items) {
          try {
            this.queue.add(item);
            if (this.config.verbose) {
              console.log(`[worker] Discovered: ${item.summary} (${item.priority}, tier ${item.tier})`);
            }
          } catch {
            // Duplicate ID — skip silently
          }
        }
      } catch (err) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    }

    // Pick next work from queue
    const next = this.queue.getNextWork();
    if (!next) {
      this.saveStatus();
      return;
    }

    // Process the work item
    await this.processWork(next);
    this.saveStatus();
  }

  /**
   * Process a single work item through the approval policy and workflow execution.
   */
  private async processWork(work: DiscoveredWork): Promise<void> {
    // Check budget before processing
    if (this.isBudgetExhausted()) {
      if (this.config.verbose) {
        console.log('[worker] Budget exhausted, skipping work');
      }
      return;
    }

    // Evaluate approval policy
    const approval = evaluateApproval(work, this.policy, {
      estimatedCostUsd: this.config.maxItemBudgetUsd,
    });

    // Map workflow
    const workflowType = this.mapWorkToWorkflow(work.suggestedWorkflow);

    // Handle based on approval decision
    switch (approval.decision) {
      case 'escalate': {
        this.queue.update(work.id, { status: 'escalated', resolution: `Escalated: ${approval.reason}` });
        this.escalatedCount++;
        this.emit('work-escalated', work, approval.reason);
        if (this.config.verbose) {
          console.log(`[worker] Escalated: ${work.summary} — ${approval.reason}`);
        }
        return;
      }

      case 'confirm': {
        if (!this.config.onConfirmationRequired) {
          // No confirmation callback — escalate instead
          this.queue.update(work.id, { status: 'escalated', resolution: 'Escalated: no confirmation handler' });
          this.escalatedCount++;
          this.emit('work-escalated', work, 'No confirmation handler available');
          return;
        }

        const confirmed = await this.config.onConfirmationRequired(work);
        if (!confirmed) {
          this.queue.update(work.id, { status: 'escalated', resolution: 'Escalated: confirmation rejected' });
          this.escalatedCount++;
          this.emit('work-escalated', work, 'Confirmation rejected');
          return;
        }

        this.emit('work-confirmed', work);
        break; // Fall through to execution
      }

      case 'auto-execute': {
        // Proceed to execution
        break;
      }
    }

    // Check that workflow can be mapped
    if (!workflowType) {
      this.queue.update(work.id, { status: 'escalated', resolution: 'No executable workflow for manual-review' });
      this.escalatedCount++;
      this.emit('work-escalated', work, 'manual-review cannot be auto-executed');
      return;
    }

    // Execute the workflow
    await this.executeWork(work, workflowType);
  }

  /**
   * Execute a work item via the configured workflow executor.
   */
  private async executeWork(work: DiscoveredWork, workflowType: WorkflowType): Promise<void> {
    if (!this.config.onExecuteWorkflow) {
      // No executor — mark as picked up but don't execute
      this.queue.update(work.id, { status: 'in-progress', startedAt: new Date(), assignedTo: 'autonomous-worker' });
      this.emit('work-picked-up', work);
      if (this.config.verbose) {
        console.log(`[worker] No executor configured, work queued: ${work.summary}`);
      }
      return;
    }

    this.isProcessing = true;
    this.queue.update(work.id, { status: 'in-progress', startedAt: new Date(), assignedTo: 'autonomous-worker' });
    this.emit('work-picked-up', work);

    try {
      const result = await this.config.onExecuteWorkflow(
        workflowType,
        work.description,
        this.config.maxItemBudgetUsd
      );

      this.totalSpentUsd += result.costUsd;

      if (result.success) {
        this.queue.update(work.id, {
          status: 'completed',
          completedAt: new Date(),
          resolution: result.resolution || 'Completed successfully',
        });
        this.completedCount++;
        this.emit('work-completed', work, result);
      } else {
        this.queue.update(work.id, {
          status: 'escalated',
          resolution: `Failed: ${result.error || 'Unknown error'}`,
        });
        this.failedCount++;
        this.emit('work-failed', work, new Error(result.error || 'Workflow failed'));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.queue.update(work.id, {
        status: 'escalated',
        resolution: `Error: ${error.message}`,
      });
      this.failedCount++;
      this.emit('work-failed', work, error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Map a SuggestedWorkflow to a WorkflowType.
   * Returns null for manual-review (cannot be auto-executed).
   */
  mapWorkToWorkflow(suggested: SuggestedWorkflow): WorkflowType | null {
    switch (suggested) {
      case 'bug-fix': return 'bug-fix';
      case 'refactor': return 'refactor';
      case 'new-feature': return 'new-feature';
      case 'investigation': return 'bug-fix'; // Investigation framed as bug-fix
      case 'manual-review': return null;
      default: return 'bug-fix';
    }
  }

  /**
   * Check if the stop signal file exists.
   */
  async checkStopSignal(): Promise<boolean> {
    const signalPath = path.join(this.ffDir, STOP_SIGNAL_FILE);
    return fs.existsSync(signalPath);
  }

  /**
   * Check if the total budget has been exhausted.
   */
  isBudgetExhausted(): boolean {
    return this.totalSpentUsd >= this.config.maxBudgetUsd;
  }

  /**
   * Add spent budget (for tracking).
   */
  addSpentBudget(amount: number): void {
    this.totalSpentUsd += amount;
  }

  /**
   * Add a work item directly to the queue.
   */
  addToQueue(work: DiscoveredWork): void {
    this.queue.add(work);
  }

  /**
   * Remove a work item from the queue.
   */
  removeFromQueue(workId: string): boolean {
    return this.queue.remove(workId);
  }

  /**
   * Get all items in the queue.
   */
  getQueueItems(): DiscoveredWork[] {
    return this.queue.getAll();
  }

  /**
   * Get queue statistics.
   */
  getQueueStats(): QueueStats {
    return this.queue.getStats();
  }

  // ---- Private helpers ----

  private isLocked(): boolean {
    const lockPath = path.join(this.ffDir, LOCK_FILE);
    return fs.existsSync(lockPath);
  }

  private acquireLock(): void {
    if (!fs.existsSync(this.ffDir)) {
      fs.mkdirSync(this.ffDir, { recursive: true });
    }
    const lockPath = path.join(this.ffDir, LOCK_FILE);
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      startedAt: new Date().toISOString(),
    }), 'utf-8');
  }

  private releaseLock(): void {
    const lockPath = path.join(this.ffDir, LOCK_FILE);
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  }

  private clearStopSignal(): void {
    const signalPath = path.join(this.ffDir, STOP_SIGNAL_FILE);
    if (fs.existsSync(signalPath)) {
      fs.unlinkSync(signalPath);
    }
  }

  private saveStatus(): void {
    const queueStats = this.queue.getStats();
    const status: WorkerStatus = {
      status: this.isRunning ? (this.isProcessing ? 'processing' : 'running') : 'stopped',
      startedAt: this.startedAt || new Date(),
      lastPollAt: new Date(),
      currentWork: null, // Updated during processing
      stats: {
        completed: this.completedCount,
        escalated: this.escalatedCount,
        failed: this.failedCount,
        totalCostUsd: this.totalSpentUsd,
      },
      queueStats: {
        pending: queueStats.pendingCount,
        inProgress: queueStats.inProgressCount,
        total: queueStats.totalItems,
      },
    };

    saveWorkerStatus(status, this.config.workingDirectory);
  }
}
