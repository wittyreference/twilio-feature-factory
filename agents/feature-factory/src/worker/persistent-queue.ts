// ABOUTME: File-based persistent queue for autonomous worker work items.
// ABOUTME: Loads from .feature-factory/work-queue.json on construction, saves on every mutation.

import * as fs from 'fs';
import * as path from 'path';
import type {
  DiscoveredWork,
  WorkPriority,
  AutomationTier,
} from '../discovery/work-discovery.js';

const QUEUE_DIR = '.feature-factory';
const QUEUE_FILE = 'work-queue.json';

/**
 * Configuration for the persistent queue.
 */
export interface PersistentQueueConfig {
  /** Maximum number of items in the queue. Evicts lowest-priority when full. Default: 100 */
  maxItems: number;
}

/**
 * Queue statistics.
 */
export interface QueueStats {
  totalItems: number;
  pendingCount: number;
  inProgressCount: number;
  completedCount: number;
  escalatedCount: number;
  byPriority: Record<WorkPriority, number>;
  byTier: Record<AutomationTier, number>;
}

/**
 * Serialized queue format on disk.
 */
interface QueueFile {
  version: string;
  updatedAt: string;
  items: DiscoveredWork[];
}

const PRIORITY_ORDER: WorkPriority[] = ['critical', 'high', 'medium', 'low'];

/**
 * File-based persistent queue for DiscoveredWork items.
 * Follows the same file-persistence pattern as session.ts.
 */
export class PersistentQueue {
  private items: DiscoveredWork[] = [];
  private readonly queueDir: string;
  private readonly queueFilePath: string;
  private readonly maxItems: number;

  constructor(workingDirectory: string, config?: Partial<PersistentQueueConfig>) {
    this.maxItems = config?.maxItems ?? 100;
    this.queueDir = path.join(workingDirectory, QUEUE_DIR);
    this.queueFilePath = path.join(this.queueDir, QUEUE_FILE);
    this.ensureDir();
    this.load();
  }

  /**
   * Add a work item to the queue. Evicts lowest-priority item if at capacity.
   * Throws if an item with the same ID already exists.
   */
  add(work: DiscoveredWork): void {
    if (this.items.some(w => w.id === work.id)) {
      throw new Error(`Work item '${work.id}' already exists in queue`);
    }

    if (this.items.length >= this.maxItems) {
      this.evictLowest();
    }

    this.items.push(work);
    this.save();
  }

  /**
   * Remove a work item by ID. Returns true if found and removed.
   */
  remove(workId: string): boolean {
    const index = this.items.findIndex(w => w.id === workId);
    if (index === -1) {
      return false;
    }

    this.items.splice(index, 1);
    this.save();
    return true;
  }

  /**
   * Update fields on an existing work item. Returns true if found and updated.
   */
  update(workId: string, updates: Partial<DiscoveredWork>): boolean {
    const item = this.items.find(w => w.id === workId);
    if (!item) {
      return false;
    }

    Object.assign(item, updates);
    this.save();
    return true;
  }

  /**
   * Get all items in the queue.
   */
  getAll(): DiscoveredWork[] {
    return [...this.items];
  }

  /**
   * Get only pending items.
   */
  getPending(): DiscoveredWork[] {
    return this.items.filter(w => w.status === 'pending');
  }

  /**
   * Get the next work item to process, sorted by priority → tier → discoveredAt.
   * Returns undefined if no pending items.
   */
  getNextWork(): DiscoveredWork | undefined {
    const pending = this.getPending();
    if (pending.length === 0) {
      return undefined;
    }

    pending.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (priorityDiff !== 0) return priorityDiff;

      if (a.tier !== b.tier) return a.tier - b.tier;

      return a.discoveredAt.getTime() - b.discoveredAt.getTime();
    });

    return pending[0];
  }

  /**
   * Get queue statistics.
   */
  getStats(): QueueStats {
    const byPriority: Record<WorkPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byTier: Record<AutomationTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let pendingCount = 0;
    let inProgressCount = 0;
    let completedCount = 0;
    let escalatedCount = 0;

    for (const item of this.items) {
      byPriority[item.priority]++;
      byTier[item.tier]++;
      if (item.status === 'pending') pendingCount++;
      if (item.status === 'in-progress') inProgressCount++;
      if (item.status === 'completed') completedCount++;
      if (item.status === 'escalated') escalatedCount++;
    }

    return {
      totalItems: this.items.length,
      pendingCount,
      inProgressCount,
      completedCount,
      escalatedCount,
      byPriority,
      byTier,
    };
  }

  /**
   * Remove all items from the queue.
   */
  clear(): void {
    this.items = [];
    this.save();
  }

  /**
   * Evict the lowest-priority item to make room.
   * Priority order: critical > high > medium > low.
   * When tied on priority, evict higher tier. When tied on tier, evict oldest.
   */
  private evictLowest(): void {
    if (this.items.length === 0) return;

    // Sort to find the "worst" item (lowest priority, highest tier, oldest)
    const sorted = [...this.items].sort((a, b) => {
      // Reverse priority (lowest first = eviction candidate)
      const priorityDiff = PRIORITY_ORDER.indexOf(b.priority) - PRIORITY_ORDER.indexOf(a.priority);
      if (priorityDiff !== 0) return priorityDiff;

      // Higher tier = worse (eviction candidate)
      if (a.tier !== b.tier) return b.tier - a.tier;

      // Oldest = eviction candidate
      return a.discoveredAt.getTime() - b.discoveredAt.getTime();
    });

    const toEvict = sorted[0];
    this.items = this.items.filter(w => w.id !== toEvict.id);
  }

  /**
   * Ensure the queue directory exists.
   */
  private ensureDir(): void {
    if (!fs.existsSync(this.queueDir)) {
      fs.mkdirSync(this.queueDir, { recursive: true });
    }
  }

  /**
   * Load queue from disk. Handles missing file, corrupted JSON gracefully.
   */
  private load(): void {
    if (!fs.existsSync(this.queueFilePath)) {
      this.items = [];
      return;
    }

    try {
      const content = fs.readFileSync(this.queueFilePath, 'utf-8');
      const data: QueueFile = JSON.parse(content);

      this.items = (data.items || []).map(item => ({
        ...item,
        discoveredAt: new Date(item.discoveredAt),
        startedAt: item.startedAt ? new Date(item.startedAt) : undefined,
        completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
      }));
    } catch {
      // Corrupted file — start fresh
      this.items = [];
    }
  }

  /**
   * Save queue to disk.
   */
  private save(): void {
    const data: QueueFile = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      items: this.items,
    };

    this.ensureDir();
    fs.writeFileSync(this.queueFilePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
