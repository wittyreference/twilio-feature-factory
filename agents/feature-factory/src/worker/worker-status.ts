// ABOUTME: File-based worker status persistence for the autonomous worker.
// ABOUTME: Saves and loads worker state to .feature-factory/worker-status.json.

import * as fs from 'fs';
import * as path from 'path';

const STATUS_DIR = '.feature-factory';
const STATUS_FILE = 'worker-status.json';

/**
 * Worker status states.
 */
export type WorkerState = 'idle' | 'running' | 'processing' | 'stopping' | 'stopped';

/**
 * Current work item summary for status display.
 */
export interface CurrentWorkInfo {
  id: string;
  summary: string;
  startedAt: Date;
}

/**
 * Worker execution statistics.
 */
export interface WorkerStats {
  completed: number;
  escalated: number;
  failed: number;
  totalCostUsd: number;
}

/**
 * Queue statistics snapshot.
 */
export interface QueueStatsSnapshot {
  pending: number;
  inProgress: number;
  total: number;
}

/**
 * Full worker status for persistence and display.
 */
export interface WorkerStatus {
  status: WorkerState;
  startedAt: Date;
  lastPollAt: Date | null;
  currentWork: CurrentWorkInfo | null;
  stats: WorkerStats;
  queueStats: QueueStatsSnapshot;
}

/**
 * Save worker status to disk.
 */
export function saveWorkerStatus(status: WorkerStatus, workingDirectory: string): void {
  const dir = path.join(workingDirectory, STATUS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, STATUS_FILE);
  fs.writeFileSync(filePath, JSON.stringify(status, null, 2), 'utf-8');
}

/**
 * Load worker status from disk. Returns null if no status file exists or file is corrupted.
 */
export function loadWorkerStatus(workingDirectory: string): WorkerStatus | null {
  const filePath = path.join(workingDirectory, STATUS_DIR, STATUS_FILE);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as WorkerStatus;

    // Rehydrate dates
    data.startedAt = new Date(data.startedAt);
    data.lastPollAt = data.lastPollAt ? new Date(data.lastPollAt) : null;
    if (data.currentWork) {
      data.currentWork.startedAt = new Date(data.currentWork.startedAt);
    }

    return data;
  } catch {
    return null;
  }
}
