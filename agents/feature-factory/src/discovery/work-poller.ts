// ABOUTME: Simple polling loop for work discovery in autonomous agent mode.
// ABOUTME: Listens to DeepValidator events and queues work for processing.

import { EventEmitter } from 'events';
import {
  type Diagnosis,
  type DiscoveredWork,
  type WorkDiscoveryConfig,
  type WorkPriority,
  type AutomationTier,
  createWorkFromValidation,
} from './work-discovery.js';

/**
 * Validation failure event structure (mirrors DeepValidator event).
 * Defined locally to avoid cross-package TypeScript compilation issues.
 */
export interface ValidationFailureEvent {
  type: string;
  result: {
    success: boolean;
    resourceSid?: string;
    errors?: string[];
    [key: string]: unknown;
  };
  diagnosis?: Diagnosis;
  timestamp: Date;
}

/**
 * Interface for DeepValidator-compatible emitters.
 * Allows any EventEmitter that emits 'validation-failure' events.
 */
export interface ValidationEventEmitter extends EventEmitter {
  on(event: 'validation-failure', listener: (event: ValidationFailureEvent) => void): this;
  off(event: 'validation-failure', listener: (event: ValidationFailureEvent) => void): this;
}

/**
 * Interface for DiagnosticBridge-compatible analyzers.
 */
export interface DiagnosisAnalyzer {
  analyze(result: { success: boolean; resourceSid?: string; [key: string]: unknown }): Promise<Diagnosis>;
}

/**
 * Work poller events.
 */
export interface WorkPollerEvents {
  'work-discovered': [work: DiscoveredWork];
  'work-started': [work: DiscoveredWork];
  'work-completed': [work: DiscoveredWork];
  'work-escalated': [work: DiscoveredWork];
  'error': [error: Error];
}

/**
 * Simple polling loop for autonomous work discovery.
 * Connects to DeepValidator events and queues work items.
 */
export class WorkPoller extends EventEmitter {
  private config: Required<WorkDiscoveryConfig>;
  private workQueue: DiscoveredWork[] = [];
  private validators: Map<ValidationEventEmitter, (event: ValidationFailureEvent) => void> = new Map();
  private diagnosticBridge?: DiagnosisAnalyzer;
  private isRunning = false;
  private pollTimer?: NodeJS.Timeout;

  constructor(config: WorkDiscoveryConfig = {}) {
    super();
    this.config = {
      enabled: config.enabled ?? true,
      pollInterval: config.pollInterval ?? 60000,
      maxQueueSize: config.maxQueueSize ?? 100,
      autoHandleLowTier: config.autoHandleLowTier ?? false,
      enabledSources: config.enabledSources ?? [
        'validation-failure',
        'debugger-alert',
        'user-request',
        'scheduled',
        'webhook-error',
      ],
      minPriority: config.minPriority ?? 'low',
    };
  }

  /**
   * Registers a validator (DeepValidator or any compatible EventEmitter) to listen for validation failures.
   */
  registerValidator(validator: ValidationEventEmitter): void {
    const handler = this.handleValidationFailure.bind(this);
    validator.on('validation-failure', handler);
    this.validators.set(validator, handler);
  }

  /**
   * Unregisters a validator.
   */
  unregisterValidator(validator: ValidationEventEmitter): void {
    const handler = this.validators.get(validator);
    if (handler) {
      validator.off('validation-failure', handler);
      this.validators.delete(validator);
    }
  }

  /**
   * Sets the DiagnosticBridge (or compatible analyzer) for enhanced diagnosis.
   */
  setDiagnosticBridge(bridge: DiagnosisAnalyzer): void {
    this.diagnosticBridge = bridge;
  }

  /**
   * Handles a validation failure event.
   */
  private async handleValidationFailure(event: ValidationFailureEvent): Promise<void> {
    if (!this.config.enabled || !this.config.enabledSources.includes('validation-failure')) {
      return;
    }

    try {
      // Get or create diagnosis
      let diagnosis = event.diagnosis;

      if (!diagnosis && this.diagnosticBridge && 'resourceSid' in event.result) {
        // Generate diagnosis if not provided
        diagnosis = await this.diagnosticBridge.analyze(
          event.result as Parameters<DiagnosisAnalyzer['analyze']>[0]
        );
      }

      if (!diagnosis) {
        // Create minimal diagnosis from event
        diagnosis = this.createMinimalDiagnosis(event);
      }

      // Create work item
      const work = createWorkFromValidation(diagnosis, 'validation-failure');

      // Check priority filter
      if (!this.meetsPriorityThreshold(work.priority)) {
        return;
      }

      // Add to queue
      this.enqueueWork(work);
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Creates a minimal diagnosis from a validation failure event.
   */
  private createMinimalDiagnosis(event: ValidationFailureEvent): Diagnosis {
    const hasResult = 'resourceSid' in event.result;
    const resourceSid = hasResult ? (event.result as { resourceSid?: string }).resourceSid || 'unknown' : 'unknown';
    const errors = 'errors' in event.result ? (event.result as { errors?: string[] }).errors || [] : [];

    return {
      patternId: `PAT-${event.type}-${Date.now().toString(16)}`,
      summary: `${event.type} validation failure for ${resourceSid}`,
      rootCause: {
        category: 'unknown',
        description: errors[0] || 'Validation failed with no specific error',
        confidence: 0.3,
      },
      evidence: [
        {
          source: event.type,
          data: event.result,
          relevance: 'primary',
        },
      ],
      suggestedFixes: [],
      isKnownPattern: false,
      previousOccurrences: 0,
      validationResult: hasResult
        ? (event.result as Diagnosis['validationResult'])
        : {
            success: false,
            resourceSid,
            resourceType: 'message',
            primaryStatus: 'unknown',
            checks: {
              resourceStatus: { passed: false, message: 'Unknown' },
              debuggerAlerts: { passed: true, message: 'Not checked' },
            },
            errors,
            warnings: [],
            duration: 0,
          },
      timestamp: event.timestamp,
    };
  }

  /**
   * Checks if priority meets the configured threshold.
   */
  private meetsPriorityThreshold(priority: WorkPriority): boolean {
    const levels: WorkPriority[] = ['critical', 'high', 'medium', 'low'];
    const minIndex = levels.indexOf(this.config.minPriority);
    const actualIndex = levels.indexOf(priority);
    return actualIndex <= minIndex;
  }

  /**
   * Adds work to the queue.
   */
  private enqueueWork(work: DiscoveredWork): void {
    // Check queue size limit
    if (this.workQueue.length >= this.config.maxQueueSize) {
      // Remove lowest priority items to make room
      this.workQueue.sort((a, b) => this.comparePriority(a.priority, b.priority));
      this.workQueue.pop();
    }

    this.workQueue.push(work);
    this.emit('work-discovered', work);

    // Auto-handle low-tier work if enabled
    if (this.config.autoHandleLowTier && (work.tier === 1 || work.tier === 2)) {
      this.startWork(work);
    }
  }

  /**
   * Compares priorities (lower index = higher priority).
   */
  private comparePriority(a: WorkPriority, b: WorkPriority): number {
    const levels: WorkPriority[] = ['critical', 'high', 'medium', 'low'];
    return levels.indexOf(a) - levels.indexOf(b);
  }

  /**
   * Starts processing a work item.
   */
  startWork(work: DiscoveredWork): void {
    work.status = 'in-progress';
    work.startedAt = new Date();
    this.emit('work-started', work);
  }

  /**
   * Completes a work item.
   */
  completeWork(work: DiscoveredWork, resolution: string): void {
    work.status = 'completed';
    work.completedAt = new Date();
    work.resolution = resolution;
    this.removeFromQueue(work);
    this.emit('work-completed', work);
  }

  /**
   * Escalates a work item to human review.
   */
  escalateWork(work: DiscoveredWork, reason: string): void {
    work.status = 'escalated';
    work.resolution = `Escalated: ${reason}`;
    this.emit('work-escalated', work);
  }

  /**
   * Removes a work item from the queue.
   */
  private removeFromQueue(work: DiscoveredWork): void {
    this.workQueue = this.workQueue.filter((w) => w.id !== work.id);
  }

  /**
   * Returns the current work queue.
   */
  getQueue(): DiscoveredWork[] {
    return [...this.workQueue];
  }

  /**
   * Returns pending work items by tier.
   */
  getPendingByTier(tier: AutomationTier): DiscoveredWork[] {
    return this.workQueue.filter((w) => w.tier === tier && w.status === 'pending');
  }

  /**
   * Returns the next work item to process.
   * Prioritizes by: 1) priority, 2) tier, 3) discovery time
   */
  getNextWork(): DiscoveredWork | undefined {
    const pending = this.workQueue.filter((w) => w.status === 'pending');
    if (pending.length === 0) return undefined;

    pending.sort((a, b) => {
      // First by priority (critical first)
      const priorityDiff = this.comparePriority(a.priority, b.priority);
      if (priorityDiff !== 0) return priorityDiff;

      // Then by tier (lower tier = easier to automate)
      if (a.tier !== b.tier) return a.tier - b.tier;

      // Then by discovery time (older first)
      return a.discoveredAt.getTime() - b.discoveredAt.getTime();
    });

    return pending[0];
  }

  /**
   * Manually adds work to the queue.
   */
  addWork(work: DiscoveredWork): void {
    this.enqueueWork(work);
  }

  /**
   * Starts the polling loop.
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.pollTimer = setInterval(() => {
      this.poll();
    }, this.config.pollInterval);

    // Initial poll
    this.poll();
  }

  /**
   * Stops the polling loop.
   */
  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Performs a single poll cycle.
   * Can be extended to check additional sources.
   */
  private poll(): void {
    // Currently, work is discovered via events
    // This method can be extended to poll external sources
    // like Twilio Debugger logs, scheduled checks, etc.
  }

  /**
   * Returns poller statistics.
   */
  getStats(): {
    queueSize: number;
    pendingCount: number;
    inProgressCount: number;
    byPriority: Record<WorkPriority, number>;
    byTier: Record<AutomationTier, number>;
  } {
    const byPriority: Record<WorkPriority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    const byTier: Record<AutomationTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

    let pendingCount = 0;
    let inProgressCount = 0;

    for (const work of this.workQueue) {
      byPriority[work.priority]++;
      byTier[work.tier]++;
      if (work.status === 'pending') pendingCount++;
      if (work.status === 'in-progress') inProgressCount++;
    }

    return {
      queueSize: this.workQueue.length,
      pendingCount,
      inProgressCount,
      byPriority,
      byTier,
    };
  }
}

/**
 * Creates a new WorkPoller instance.
 */
export function createWorkPoller(config?: WorkDiscoveryConfig): WorkPoller {
  return new WorkPoller(config);
}
