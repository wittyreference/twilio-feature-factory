// ABOUTME: Unit tests for PersistentQueue module.
// ABOUTME: Tests file-based queue persistence, priority sorting, and eviction.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PersistentQueue } from '../../src/worker/persistent-queue.js';
import type { DiscoveredWork, WorkPriority, AutomationTier } from '../../src/discovery/work-discovery.js';

function createWork(overrides: Partial<DiscoveredWork> = {}): DiscoveredWork {
  return {
    id: `work-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    discoveredAt: new Date(),
    source: 'validation-failure',
    priority: 'medium',
    tier: 2 as AutomationTier,
    suggestedWorkflow: 'bug-fix',
    summary: 'Test work item',
    description: 'A test work item for queue testing',
    status: 'pending',
    ...overrides,
  };
}

describe('PersistentQueue', () => {
  let tempDir: string;
  let queuePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-queue-test-'));
    queuePath = path.join(tempDir, '.feature-factory');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('construction', () => {
    it('should create queue directory if it does not exist', () => {
      const queue = new PersistentQueue(tempDir);
      expect(fs.existsSync(queuePath)).toBe(true);
      expect(queue.getAll()).toEqual([]);
    });

    it('should load existing queue from disk', () => {
      // Create a queue and add items
      const queue1 = new PersistentQueue(tempDir);
      const work = createWork({ id: 'work-load-test' });
      queue1.add(work);

      // Create a second queue instance that should load from disk
      const queue2 = new PersistentQueue(tempDir);
      expect(queue2.getAll()).toHaveLength(1);
      expect(queue2.getAll()[0].id).toBe('work-load-test');
    });

    it('should handle corrupted queue file gracefully', () => {
      fs.mkdirSync(queuePath, { recursive: true });
      fs.writeFileSync(path.join(queuePath, 'work-queue.json'), 'not valid json');

      const queue = new PersistentQueue(tempDir);
      expect(queue.getAll()).toEqual([]);
    });

    it('should rehydrate Date fields from JSON', () => {
      const queue1 = new PersistentQueue(tempDir);
      const now = new Date('2026-02-18T10:00:00Z');
      const work = createWork({
        id: 'work-date-test',
        discoveredAt: now,
        startedAt: new Date('2026-02-18T10:05:00Z'),
      });
      queue1.add(work);

      const queue2 = new PersistentQueue(tempDir);
      const loaded = queue2.getAll()[0];
      expect(loaded.discoveredAt).toBeInstanceOf(Date);
      expect(loaded.discoveredAt.toISOString()).toBe('2026-02-18T10:00:00.000Z');
      expect(loaded.startedAt).toBeInstanceOf(Date);
      expect(loaded.startedAt!.toISOString()).toBe('2026-02-18T10:05:00.000Z');
    });
  });

  describe('add', () => {
    it('should add work items to the queue', () => {
      const queue = new PersistentQueue(tempDir);
      const work = createWork();
      queue.add(work);

      expect(queue.getAll()).toHaveLength(1);
      expect(queue.getAll()[0].id).toBe(work.id);
    });

    it('should persist to disk on add', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork());

      const fileContent = fs.readFileSync(
        path.join(queuePath, 'work-queue.json'),
        'utf-8'
      );
      const parsed = JSON.parse(fileContent);
      expect(parsed.items).toHaveLength(1);
    });

    it('should reject duplicate IDs', () => {
      const queue = new PersistentQueue(tempDir);
      const work = createWork({ id: 'duplicate-id' });
      queue.add(work);

      expect(() => queue.add(createWork({ id: 'duplicate-id' }))).toThrow(
        /already exists/
      );
    });

    it('should evict lowest-priority item when at maxItems', () => {
      const queue = new PersistentQueue(tempDir, { maxItems: 3 });

      queue.add(createWork({ id: 'w1', priority: 'critical' }));
      queue.add(createWork({ id: 'w2', priority: 'high' }));
      queue.add(createWork({ id: 'w3', priority: 'low' }));

      // Adding a 4th item should evict the lowest priority (low)
      queue.add(createWork({ id: 'w4', priority: 'medium' }));

      expect(queue.getAll()).toHaveLength(3);
      const ids = queue.getAll().map(w => w.id);
      expect(ids).toContain('w1');
      expect(ids).toContain('w2');
      expect(ids).toContain('w4');
      expect(ids).not.toContain('w3');
    });

    it('should evict higher-tier item when priorities match', () => {
      const queue = new PersistentQueue(tempDir, { maxItems: 2 });

      queue.add(createWork({ id: 'w1', priority: 'medium', tier: 1 as AutomationTier }));
      queue.add(createWork({ id: 'w2', priority: 'medium', tier: 4 as AutomationTier }));

      // Adding a 3rd should evict the higher tier (4)
      queue.add(createWork({ id: 'w3', priority: 'medium', tier: 2 as AutomationTier }));

      const ids = queue.getAll().map(w => w.id);
      expect(ids).toContain('w1');
      expect(ids).toContain('w3');
      expect(ids).not.toContain('w2');
    });
  });

  describe('remove', () => {
    it('should remove a work item by ID', () => {
      const queue = new PersistentQueue(tempDir);
      const work = createWork({ id: 'to-remove' });
      queue.add(work);

      const removed = queue.remove('to-remove');
      expect(removed).toBe(true);
      expect(queue.getAll()).toHaveLength(0);
    });

    it('should return false for non-existent ID', () => {
      const queue = new PersistentQueue(tempDir);
      expect(queue.remove('non-existent')).toBe(false);
    });

    it('should persist removal to disk', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'will-remove' }));
      queue.remove('will-remove');

      const queue2 = new PersistentQueue(tempDir);
      expect(queue2.getAll()).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update work item fields', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'to-update', status: 'pending' }));

      const updated = queue.update('to-update', {
        status: 'in-progress',
        startedAt: new Date(),
        assignedTo: 'worker-1',
      });

      expect(updated).toBe(true);
      const item = queue.getAll().find(w => w.id === 'to-update');
      expect(item!.status).toBe('in-progress');
      expect(item!.assignedTo).toBe('worker-1');
    });

    it('should return false for non-existent ID', () => {
      const queue = new PersistentQueue(tempDir);
      expect(queue.update('non-existent', { status: 'completed' })).toBe(false);
    });

    it('should persist update to disk', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'persist-update', status: 'pending' }));
      queue.update('persist-update', { status: 'completed', resolution: 'Fixed' });

      const queue2 = new PersistentQueue(tempDir);
      const item = queue2.getAll().find(w => w.id === 'persist-update');
      expect(item!.status).toBe('completed');
      expect(item!.resolution).toBe('Fixed');
    });
  });

  describe('getPending', () => {
    it('should return only pending items', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'pending-1', status: 'pending' }));
      queue.add(createWork({ id: 'active-1', status: 'in-progress' }));
      queue.add(createWork({ id: 'pending-2', status: 'pending' }));
      queue.add(createWork({ id: 'done-1', status: 'completed' }));

      const pending = queue.getPending();
      expect(pending).toHaveLength(2);
      expect(pending.map(w => w.id)).toEqual(['pending-1', 'pending-2']);
    });
  });

  describe('getNextWork', () => {
    it('should return the highest priority pending item', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'low', priority: 'low', tier: 1 as AutomationTier }));
      queue.add(createWork({ id: 'critical', priority: 'critical', tier: 1 as AutomationTier }));
      queue.add(createWork({ id: 'medium', priority: 'medium', tier: 1 as AutomationTier }));

      const next = queue.getNextWork();
      expect(next!.id).toBe('critical');
    });

    it('should sort by tier when priority is equal', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'tier3', priority: 'high', tier: 3 as AutomationTier }));
      queue.add(createWork({ id: 'tier1', priority: 'high', tier: 1 as AutomationTier }));

      const next = queue.getNextWork();
      expect(next!.id).toBe('tier1');
    });

    it('should sort by discoveredAt when priority and tier are equal', () => {
      const queue = new PersistentQueue(tempDir);
      const older = new Date('2026-02-17T10:00:00Z');
      const newer = new Date('2026-02-18T10:00:00Z');

      queue.add(createWork({ id: 'newer', priority: 'high', tier: 2 as AutomationTier, discoveredAt: newer }));
      queue.add(createWork({ id: 'older', priority: 'high', tier: 2 as AutomationTier, discoveredAt: older }));

      const next = queue.getNextWork();
      expect(next!.id).toBe('older');
    });

    it('should skip non-pending items', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'active', priority: 'critical', status: 'in-progress' }));
      queue.add(createWork({ id: 'pending', priority: 'low', status: 'pending' }));

      const next = queue.getNextWork();
      expect(next!.id).toBe('pending');
    });

    it('should return undefined when no pending items', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'done', status: 'completed' }));

      expect(queue.getNextWork()).toBeUndefined();
    });

    it('should return undefined for empty queue', () => {
      const queue = new PersistentQueue(tempDir);
      expect(queue.getNextWork()).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'w1', priority: 'critical', tier: 1 as AutomationTier, status: 'pending' }));
      queue.add(createWork({ id: 'w2', priority: 'high', tier: 2 as AutomationTier, status: 'in-progress' }));
      queue.add(createWork({ id: 'w3', priority: 'medium', tier: 3 as AutomationTier, status: 'pending' }));
      queue.add(createWork({ id: 'w4', priority: 'low', tier: 4 as AutomationTier, status: 'completed' }));

      const stats = queue.getStats();
      expect(stats.totalItems).toBe(4);
      expect(stats.pendingCount).toBe(2);
      expect(stats.inProgressCount).toBe(1);
      expect(stats.completedCount).toBe(1);
      expect(stats.byPriority.critical).toBe(1);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.medium).toBe(1);
      expect(stats.byPriority.low).toBe(1);
      expect(stats.byTier[1]).toBe(1);
      expect(stats.byTier[2]).toBe(1);
      expect(stats.byTier[3]).toBe(1);
      expect(stats.byTier[4]).toBe(1);
    });

    it('should return zero counts for empty queue', () => {
      const queue = new PersistentQueue(tempDir);
      const stats = queue.getStats();

      expect(stats.totalItems).toBe(0);
      expect(stats.pendingCount).toBe(0);
      expect(stats.inProgressCount).toBe(0);
      expect(stats.completedCount).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all items from the queue', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork({ id: 'w1' }));
      queue.add(createWork({ id: 'w2' }));
      queue.add(createWork({ id: 'w3' }));

      queue.clear();

      expect(queue.getAll()).toHaveLength(0);
    });

    it('should persist clear to disk', () => {
      const queue = new PersistentQueue(tempDir);
      queue.add(createWork());
      queue.clear();

      const queue2 = new PersistentQueue(tempDir);
      expect(queue2.getAll()).toHaveLength(0);
    });
  });

  describe('default maxItems', () => {
    it('should default to 100 items', () => {
      const queue = new PersistentQueue(tempDir);
      // Add 101 items - the 101st should cause eviction
      for (let i = 0; i < 101; i++) {
        queue.add(createWork({
          id: `w-${i}`,
          priority: i === 0 ? 'low' : 'critical',
        }));
      }

      expect(queue.getAll()).toHaveLength(100);
      // The low-priority first item should have been evicted
      expect(queue.getAll().find(w => w.id === 'w-0')).toBeUndefined();
    });
  });
});
