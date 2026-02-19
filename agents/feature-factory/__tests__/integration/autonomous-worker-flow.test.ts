// ABOUTME: Integration test for the autonomous worker flow.
// ABOUTME: Tests end-to-end: source → queue → worker → orchestrator (mocked).

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  AutonomousWorker,
  type AutonomousWorkerConfig,
  type WorkflowResult,
} from '../../src/worker/autonomous-worker.js';
import { PersistentQueue } from '../../src/worker/persistent-queue.js';
import { createFileQueueSource, type WorkSourceProvider } from '../../src/worker/work-sources.js';
import { loadWorkerStatus } from '../../src/worker/worker-status.js';
import type { DiscoveredWork, AutomationTier, WorkPriority } from '../../src/discovery/work-discovery.js';
import type { WorkflowType } from '../../src/types.js';

function createWork(overrides: Partial<DiscoveredWork> = {}): DiscoveredWork {
  return {
    id: `work-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    discoveredAt: new Date(),
    source: 'validation-failure',
    priority: 'medium',
    tier: 2 as AutomationTier,
    suggestedWorkflow: 'bug-fix',
    summary: 'Test work item',
    description: 'A test work item',
    status: 'pending',
    ...overrides,
  };
}

function createConfig(tempDir: string, overrides: Partial<AutonomousWorkerConfig> = {}): AutonomousWorkerConfig {
  return {
    workingDirectory: tempDir,
    pollIntervalMs: 50,
    maxBudgetUsd: 100,
    maxItemBudgetUsd: 10,
    verbose: false,
    enableSandbox: false,
    ...overrides,
  };
}

describe('Autonomous Worker Flow (Integration)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-worker-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('full flow: source → queue → worker → orchestrator', () => {
    it('should discover work from source, queue it, and execute', async () => {
      const executed: { type: WorkflowType; description: string }[] = [];

      const worker = new AutonomousWorker(createConfig(tempDir, {
        onExecuteWorkflow: async (type, description, _budget) => {
          executed.push({ type, description });
          return { success: true, costUsd: 0.50, resolution: 'Fixed' };
        },
      }));

      // Create a mock source with one work item
      const work = createWork({
        id: 'integration-1',
        summary: 'Fix validation timeout',
        suggestedWorkflow: 'bug-fix',
        tier: 1 as AutomationTier,
      });

      worker.registerSource({
        name: 'test-source',
        source: 'validation-failure',
        enabled: true,
        poll: async () => [work],
      });

      // Run one poll cycle
      const completed: DiscoveredWork[] = [];
      worker.on('work-completed', (w: DiscoveredWork) => completed.push(w));

      await worker.pollOnce();

      expect(executed).toHaveLength(1);
      expect(executed[0].type).toBe('bug-fix');
      expect(completed).toHaveLength(1);
    });
  });

  describe('queue persistence across restart', () => {
    it('should preserve queue across worker instances', async () => {
      // First worker adds items to queue
      const worker1 = new AutonomousWorker(createConfig(tempDir));
      worker1.addToQueue(createWork({ id: 'persist-1', summary: 'Item 1' }));
      worker1.addToQueue(createWork({ id: 'persist-2', summary: 'Item 2' }));

      // Second worker should see the same items
      const worker2 = new AutonomousWorker(createConfig(tempDir));
      const items = worker2.getQueueItems();
      expect(items).toHaveLength(2);
      expect(items.map(w => w.id)).toContain('persist-1');
      expect(items.map(w => w.id)).toContain('persist-2');
    });
  });

  describe('multi-item queue processing with priority ordering', () => {
    it('should process items in priority order', async () => {
      const executionOrder: string[] = [];

      const worker = new AutonomousWorker(createConfig(tempDir, {
        onExecuteWorkflow: async (_type, description) => {
          executionOrder.push(description);
          return { success: true, costUsd: 0.10 };
        },
      }));

      // Add items in non-priority order
      worker.addToQueue(createWork({
        id: 'low-pri',
        priority: 'low' as WorkPriority,
        tier: 1 as AutomationTier,
        description: 'low-priority',
      }));
      worker.addToQueue(createWork({
        id: 'critical-pri',
        priority: 'critical' as WorkPriority,
        tier: 1 as AutomationTier,
        description: 'critical-priority',
      }));
      worker.addToQueue(createWork({
        id: 'high-pri',
        priority: 'high' as WorkPriority,
        tier: 1 as AutomationTier,
        description: 'high-priority',
      }));

      // Process one at a time (pollOnce picks next from queue)
      await worker.pollOnce();
      await worker.pollOnce();
      await worker.pollOnce();

      // Should process in priority order: critical, high, low
      expect(executionOrder).toEqual([
        'critical-priority',
        'high-priority',
        'low-priority',
      ]);
    });
  });

  describe('budget exhaustion stops processing', () => {
    it('should stop processing when budget is exhausted', async () => {
      let executionCount = 0;

      const worker = new AutonomousWorker(createConfig(tempDir, {
        maxBudgetUsd: 1.00,
        onExecuteWorkflow: async () => {
          executionCount++;
          return { success: true, costUsd: 0.60 };
        },
      }));

      // Add 3 items
      worker.addToQueue(createWork({ id: 'b1', tier: 1 as AutomationTier }));
      worker.addToQueue(createWork({ id: 'b2', tier: 1 as AutomationTier }));
      worker.addToQueue(createWork({ id: 'b3', tier: 1 as AutomationTier }));

      // Process all — budget should run out after 2
      await worker.pollOnce(); // Costs $0.60
      await worker.pollOnce(); // Costs $0.60, total $1.20 > $1.00
      await worker.pollOnce(); // Should skip (budget exhausted)

      // The second execution already exceeds budget, but the third should be blocked
      expect(executionCount).toBeLessThanOrEqual(2);
      expect(worker.isBudgetExhausted()).toBe(true);
    });
  });

  describe('file queue source integration', () => {
    it('should read from manual-queue.json and process work', async () => {
      // Write manual queue items
      const queueDir = path.join(tempDir, '.feature-factory');
      fs.mkdirSync(queueDir, { recursive: true });
      fs.writeFileSync(path.join(queueDir, 'manual-queue.json'), JSON.stringify({
        items: [
          { id: 'fq-1', description: 'Fix timeout in verification', priority: 'high', workflow: 'bug-fix', consumed: false },
        ],
      }, null, 2));

      const executed: string[] = [];
      const worker = new AutonomousWorker(createConfig(tempDir, {
        onExecuteWorkflow: async (_type, description) => {
          executed.push(description);
          return { success: true, costUsd: 0.25 };
        },
      }));

      worker.registerSource(createFileQueueSource(tempDir));

      await worker.pollOnce();

      expect(executed).toHaveLength(1);
      expect(executed[0]).toContain('Fix timeout in verification');
    });
  });

  describe('worker status persistence', () => {
    it('should save status after processing', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir, {
        onExecuteWorkflow: async () => ({ success: true, costUsd: 0.30 }),
      }));

      worker.addToQueue(createWork({ id: 'status-test', tier: 1 as AutomationTier }));
      await worker.pollOnce();

      const status = loadWorkerStatus(tempDir);
      expect(status).not.toBeNull();
      expect(status!.stats.completed).toBe(1);
      expect(status!.stats.totalCostUsd).toBeCloseTo(0.30, 2);
    });
  });

  describe('escalation flow', () => {
    it('should escalate tier 4 work and track in stats', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));

      worker.addToQueue(createWork({
        id: 'escalate-flow',
        tier: 4 as AutomationTier,
        suggestedWorkflow: 'manual-review',
      }));

      const escalated: string[] = [];
      worker.on('work-escalated', (_w: DiscoveredWork, reason: string) => {
        escalated.push(reason);
      });

      await worker.pollOnce();

      expect(escalated).toHaveLength(1);

      const status = loadWorkerStatus(tempDir);
      expect(status!.stats.escalated).toBe(1);
    });
  });

  describe('failed workflow handling', () => {
    it('should track failed workflows in stats', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir, {
        onExecuteWorkflow: async () => ({
          success: false,
          costUsd: 0.10,
          error: 'Tests failed',
        }),
      }));

      worker.addToQueue(createWork({ id: 'fail-test', tier: 1 as AutomationTier }));

      await worker.pollOnce();

      const status = loadWorkerStatus(tempDir);
      expect(status!.stats.failed).toBe(1);
    });
  });
});
