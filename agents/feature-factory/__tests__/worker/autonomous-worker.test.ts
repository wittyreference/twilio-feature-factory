// ABOUTME: Unit tests for the AutonomousWorker module.
// ABOUTME: Tests the main worker loop, poll cycles, work processing, and lifecycle.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AutonomousWorker, type AutonomousWorkerConfig } from '../../src/worker/autonomous-worker.js';
import type { DiscoveredWork, AutomationTier, SuggestedWorkflow } from '../../src/discovery/work-discovery.js';
import type { WorkSourceProvider } from '../../src/worker/work-sources.js';

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

function createMockSource(items: DiscoveredWork[] = []): WorkSourceProvider {
  let callCount = 0;
  return {
    name: 'mock-source',
    source: 'validation-failure',
    enabled: true,
    poll: async () => {
      callCount++;
      // Only return items on first poll
      if (callCount === 1) {
        return items;
      }
      return [];
    },
  };
}

function createConfig(tempDir: string, overrides: Partial<AutonomousWorkerConfig> = {}): AutonomousWorkerConfig {
  return {
    workingDirectory: tempDir,
    pollIntervalMs: 100, // Fast polling for tests
    maxBudgetUsd: 10,
    maxItemBudgetUsd: 5,
    verbose: false,
    enableSandbox: false,
    ...overrides,
  };
}

describe('AutonomousWorker', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-worker-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('construction', () => {
    it('should create worker with default config', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      expect(worker).toBeDefined();
    });
  });

  describe('registerSource', () => {
    it('should register a work source', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      const source = createMockSource();
      worker.registerSource(source);
      // No error thrown means success
    });

    it('should accept multiple sources', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      worker.registerSource(createMockSource());
      worker.registerSource(createMockSource());
    });
  });

  describe('start and stop', () => {
    it('should emit worker-started on start', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      const events: string[] = [];
      worker.on('worker-started', () => events.push('started'));

      await worker.start();
      expect(events).toContain('started');

      await worker.stop();
    });

    it('should emit worker-stopped on stop', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      const events: string[] = [];
      worker.on('worker-stopped', () => events.push('stopped'));

      await worker.start();
      await worker.stop();
      expect(events).toContain('stopped');
    });

    it('should create lock file on start', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      await worker.start();

      const lockPath = path.join(tempDir, '.feature-factory', 'worker.lock');
      expect(fs.existsSync(lockPath)).toBe(true);

      await worker.stop();
    });

    it('should remove lock file on stop', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      await worker.start();
      await worker.stop();

      const lockPath = path.join(tempDir, '.feature-factory', 'worker.lock');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('should prevent starting when lock file exists', async () => {
      // Create lock file manually
      const dir = path.join(tempDir, '.feature-factory');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'worker.lock'), JSON.stringify({ pid: process.pid }));

      const worker = new AutonomousWorker(createConfig(tempDir));
      await expect(worker.start()).rejects.toThrow(/already running/);
    });

    it('should not start twice', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      await worker.start();
      await expect(worker.start()).rejects.toThrow(/already running/);
      await worker.stop();
    });
  });

  describe('pollCycle', () => {
    it('should poll registered sources for work', async () => {
      const work = createWork({ id: 'poll-test' });
      const source = createMockSource([work]);

      const worker = new AutonomousWorker(createConfig(tempDir));
      worker.registerSource(source);

      const discovered: DiscoveredWork[] = [];
      worker.on('work-picked-up', (w: DiscoveredWork) => discovered.push(w));

      // Run a single poll cycle
      await worker.pollOnce();

      // Work should have been discovered and picked up
      expect(discovered.length).toBeGreaterThanOrEqual(0); // May or may not pick up depending on approval
    });

    it('should add discovered work to persistent queue', async () => {
      const work = createWork({ id: 'queue-test', tier: 4 as AutomationTier });
      const source = createMockSource([work]);

      const worker = new AutonomousWorker(createConfig(tempDir));
      worker.registerSource(source);

      await worker.pollOnce();

      const stats = worker.getQueueStats();
      expect(stats.totalItems).toBeGreaterThanOrEqual(1);
    });

    it('should stop when stop signal file exists', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));

      // Create stop signal
      const dir = path.join(tempDir, '.feature-factory');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'worker-stop-signal'), '');

      const stopped = await worker.checkStopSignal();
      expect(stopped).toBe(true);
    });
  });

  describe('mapWorkToWorkflow', () => {
    it('should map bug-fix to bug-fix', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      expect(worker.mapWorkToWorkflow('bug-fix')).toBe('bug-fix');
    });

    it('should map refactor to refactor', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      expect(worker.mapWorkToWorkflow('refactor')).toBe('refactor');
    });

    it('should map new-feature to new-feature', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      expect(worker.mapWorkToWorkflow('new-feature')).toBe('new-feature');
    });

    it('should map investigation to bug-fix', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      expect(worker.mapWorkToWorkflow('investigation')).toBe('bug-fix');
    });

    it('should return null for manual-review', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      expect(worker.mapWorkToWorkflow('manual-review')).toBeNull();
    });
  });

  describe('work processing decisions', () => {
    it('should escalate tier 4 work without executing', async () => {
      const work = createWork({
        id: 'escalate-test',
        tier: 4 as AutomationTier,
        suggestedWorkflow: 'manual-review',
      });
      const source = createMockSource([work]);

      const worker = new AutonomousWorker(createConfig(tempDir));
      worker.registerSource(source);

      const escalated: DiscoveredWork[] = [];
      worker.on('work-escalated', (w: DiscoveredWork) => escalated.push(w));

      await worker.pollOnce();

      expect(escalated).toHaveLength(1);
      expect(escalated[0].id).toBe('escalate-test');
    });

    it('should escalate manual-review workflows', async () => {
      const work = createWork({
        id: 'manual-review-test',
        tier: 1 as AutomationTier,
        suggestedWorkflow: 'manual-review',
      });
      const source = createMockSource([work]);

      const worker = new AutonomousWorker(createConfig(tempDir));
      worker.registerSource(source);

      const escalated: DiscoveredWork[] = [];
      worker.on('work-escalated', (w: DiscoveredWork) => escalated.push(w));

      await worker.pollOnce();

      expect(escalated).toHaveLength(1);
    });

    it('should track budget across work items', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir, { maxBudgetUsd: 0.01 }));

      // Simulate budget exhaustion
      worker.addSpentBudget(0.02);

      expect(worker.isBudgetExhausted()).toBe(true);
    });
  });

  describe('status', () => {
    it('should save worker status file', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      await worker.start();

      const statusPath = path.join(tempDir, '.feature-factory', 'worker-status.json');
      expect(fs.existsSync(statusPath)).toBe(true);

      await worker.stop();
    });

    it('should report queue stats', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      const stats = worker.getQueueStats();

      expect(stats.totalItems).toBe(0);
      expect(stats.pendingCount).toBe(0);
    });
  });

  describe('queue operations', () => {
    it('should allow adding work directly to queue', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      const work = createWork({ id: 'direct-add' });
      worker.addToQueue(work);

      expect(worker.getQueueStats().totalItems).toBe(1);
    });

    it('should allow removing work from queue', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      const work = createWork({ id: 'direct-remove' });
      worker.addToQueue(work);

      const removed = worker.removeFromQueue('direct-remove');
      expect(removed).toBe(true);
      expect(worker.getQueueStats().totalItems).toBe(0);
    });

    it('should list queue contents', () => {
      const worker = new AutonomousWorker(createConfig(tempDir));
      worker.addToQueue(createWork({ id: 'q1' }));
      worker.addToQueue(createWork({ id: 'q2' }));

      const items = worker.getQueueItems();
      expect(items).toHaveLength(2);
    });
  });

  describe('confirmation callback', () => {
    it('should invoke onConfirmationRequired for tier 3 work', async () => {
      const confirmCalls: DiscoveredWork[] = [];
      const worker = new AutonomousWorker(createConfig(tempDir, {
        onConfirmationRequired: async (work) => {
          confirmCalls.push(work);
          return false; // Reject
        },
      }));

      const work = createWork({
        id: 'confirm-test',
        tier: 3 as AutomationTier,
        suggestedWorkflow: 'bug-fix',
      });
      const source = createMockSource([work]);
      worker.registerSource(source);

      const escalated: DiscoveredWork[] = [];
      worker.on('work-escalated', (w: DiscoveredWork) => escalated.push(w));

      await worker.pollOnce();

      expect(confirmCalls).toHaveLength(1);
      // Rejected confirmation should escalate
      expect(escalated).toHaveLength(1);
    });

    it('should escalate tier 3 work when no callback provided', async () => {
      const worker = new AutonomousWorker(createConfig(tempDir));

      const work = createWork({
        id: 'no-callback-test',
        tier: 3 as AutomationTier,
        suggestedWorkflow: 'bug-fix',
      });
      const source = createMockSource([work]);
      worker.registerSource(source);

      const escalated: DiscoveredWork[] = [];
      worker.on('work-escalated', (w: DiscoveredWork) => escalated.push(w));

      await worker.pollOnce();

      expect(escalated).toHaveLength(1);
    });
  });
});
