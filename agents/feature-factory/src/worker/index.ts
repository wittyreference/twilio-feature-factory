// ABOUTME: Barrel exports for the autonomous worker module.
// ABOUTME: Re-exports all worker types, classes, and functions.

export {
  AutonomousWorker,
  type AutonomousWorkerConfig,
  type AutonomousWorkerEvents,
  type WorkflowResult,
} from './autonomous-worker.js';

export {
  PersistentQueue,
  type PersistentQueueConfig,
  type QueueStats,
} from './persistent-queue.js';

export {
  evaluateApproval,
  createDefaultPolicy,
  type ApprovalPolicy,
  type ApprovalAction,
  type ApprovalDecision,
  type ApprovalEvaluationOptions,
} from './approval-policy.js';

export {
  createDebuggerAlertSource,
  createFileQueueSource,
  type WorkSourceProvider,
} from './work-sources.js';

export {
  saveWorkerStatus,
  loadWorkerStatus,
  type WorkerStatus,
  type WorkerState,
  type WorkerStats,
  type CurrentWorkInfo,
  type QueueStatsSnapshot,
} from './worker-status.js';
