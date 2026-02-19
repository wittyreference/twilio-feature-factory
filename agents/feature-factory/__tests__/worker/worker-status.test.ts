// ABOUTME: Unit tests for worker status persistence module.
// ABOUTME: Tests save, load, and status file management.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  saveWorkerStatus,
  loadWorkerStatus,
  type WorkerStatus,
} from '../../src/worker/worker-status.js';

function createStatus(overrides: Partial<WorkerStatus> = {}): WorkerStatus {
  return {
    status: 'idle',
    startedAt: new Date('2026-02-18T10:00:00Z'),
    lastPollAt: null,
    currentWork: null,
    stats: {
      completed: 0,
      escalated: 0,
      failed: 0,
      totalCostUsd: 0,
    },
    queueStats: {
      pending: 0,
      inProgress: 0,
      total: 0,
    },
    ...overrides,
  };
}

describe('WorkerStatus', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-worker-status-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('saveWorkerStatus', () => {
    it('should create the status file', () => {
      const status = createStatus();
      saveWorkerStatus(status, tempDir);

      const filePath = path.join(tempDir, '.feature-factory', 'worker-status.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should create directory if missing', () => {
      const status = createStatus();
      saveWorkerStatus(status, tempDir);

      expect(fs.existsSync(path.join(tempDir, '.feature-factory'))).toBe(true);
    });

    it('should write valid JSON', () => {
      const status = createStatus({ status: 'running' });
      saveWorkerStatus(status, tempDir);

      const filePath = path.join(tempDir, '.feature-factory', 'worker-status.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  describe('loadWorkerStatus', () => {
    it('should return null when no status file exists', () => {
      const loaded = loadWorkerStatus(tempDir);
      expect(loaded).toBeNull();
    });

    it('should load a saved status', () => {
      const status = createStatus({
        status: 'running',
        stats: { completed: 5, escalated: 1, failed: 2, totalCostUsd: 3.50 },
      });
      saveWorkerStatus(status, tempDir);

      const loaded = loadWorkerStatus(tempDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.status).toBe('running');
      expect(loaded!.stats.completed).toBe(5);
      expect(loaded!.stats.totalCostUsd).toBe(3.50);
    });

    it('should rehydrate Date fields', () => {
      const status = createStatus({
        startedAt: new Date('2026-02-18T10:00:00Z'),
        lastPollAt: new Date('2026-02-18T10:05:00Z'),
      });
      saveWorkerStatus(status, tempDir);

      const loaded = loadWorkerStatus(tempDir);
      expect(loaded!.startedAt).toBeInstanceOf(Date);
      expect(loaded!.startedAt.toISOString()).toBe('2026-02-18T10:00:00.000Z');
      expect(loaded!.lastPollAt).toBeInstanceOf(Date);
      expect(loaded!.lastPollAt!.toISOString()).toBe('2026-02-18T10:05:00.000Z');
    });

    it('should handle null lastPollAt', () => {
      const status = createStatus({ lastPollAt: null });
      saveWorkerStatus(status, tempDir);

      const loaded = loadWorkerStatus(tempDir);
      expect(loaded!.lastPollAt).toBeNull();
    });

    it('should handle corrupted status file gracefully', () => {
      const dir = path.join(tempDir, '.feature-factory');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'worker-status.json'), 'not json');

      const loaded = loadWorkerStatus(tempDir);
      expect(loaded).toBeNull();
    });

    it('should preserve currentWork details', () => {
      const status = createStatus({
        status: 'processing',
        currentWork: {
          id: 'work-123',
          summary: 'Fix timeout bug',
          startedAt: new Date('2026-02-18T10:10:00Z'),
        },
      });
      saveWorkerStatus(status, tempDir);

      const loaded = loadWorkerStatus(tempDir);
      expect(loaded!.currentWork).not.toBeNull();
      expect(loaded!.currentWork!.id).toBe('work-123');
      expect(loaded!.currentWork!.summary).toBe('Fix timeout bug');
      expect(loaded!.currentWork!.startedAt).toBeInstanceOf(Date);
    });
  });
});
