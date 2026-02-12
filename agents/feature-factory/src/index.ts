// ABOUTME: Main entry point for Feature Factory package.
// ABOUTME: Exports orchestrator, config, types, and workflow definitions.

export { FeatureFactoryOrchestrator } from './orchestrator.js';

export {
  createConfig,
  validateConfig,
  configFromEnv,
  DEFAULT_CONFIG,
} from './config.js';
export type { FeatureFactoryConfig } from './config.js';

export type {
  AgentType,
  AgentConfig,
  AgentContext,
  AgentResult,
  AgentTool,
  ApprovalMode,
  ModelType,
  Workflow,
  WorkflowEvent,
  WorkflowPhase,
  WorkflowState,
  WorkflowType,
  ValidationResult,
  CheckResult,
  WorkflowStartedEvent,
  WorkflowResumedEvent,
  PhaseStartedEvent,
  PhaseCompletedEvent,
  PhaseRetryEvent,
  ApprovalRequestedEvent,
  ApprovalReceivedEvent,
  WorkflowCompletedEvent,
  WorkflowErrorEvent,
  CostUpdateEvent,
  PersistedSession,
  SessionMetadata,
} from './types.js';

export { getWorkflow, workflows, newFeatureWorkflow } from './workflows/index.js';

export {
  getAgentConfig,
  agents,
  architectAgent,
  specAgent,
  testGenAgent,
  devAgent,
  reviewAgent,
  docsAgent,
} from './agents/index.js';

export {
  getToolSchemas,
  executeTool,
} from './tools.js';
export type { ToolResult, ToolContext, ToolSchema } from './tools.js';

export {
  initializeMcpTools,
  getMcpToolSchemas,
  executeMcpTool,
  getDeepValidator,
  isMcpInitialized,
  isMcpTool,
} from './mcp-tools.js';
export type { McpToolConfig } from './mcp-tools.js';

export {
  generateSessionId,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  cleanupSessions,
  getResumableSession,
} from './session.js';
export type { SessionSummary, CleanupOptions } from './session.js';

export {
  executeHook,
  getHook,
  listHooks,
  hasHook,
  tddEnforcementHook,
  validateCredentials,
  shouldSkipValidation,
} from './hooks/index.js';
export type {
  CredentialViolation,
  CredentialValidationResult,
} from './hooks/credential-safety.js';
export type {
  HookConfig,
  HookType,
  HookContext,
  HookResult,
  PrePhaseHookEvent,
} from './types.js';

// Sandbox module (isolated workflow execution)
export {
  createSandbox,
  copyResultsBack,
  cleanupSandbox,
  ensureCleanWorkingTree,
} from './sandbox.js';
export type {
  SandboxConfig,
  SandboxInfo,
  CopyBackResult,
} from './sandbox.js';

// Context management module (tool output truncation and conversation compaction)
export {
  truncateToolOutput,
  shouldCompact,
  compactMessages,
  DEFAULT_CONTEXT_MANAGER_CONFIG,
} from './context-manager.js';
export type {
  ContextManagerConfig,
  TruncationResult,
  CompactionResult,
} from './context-manager.js';

// Stall detection module (stuck agent behavioral analysis)
export {
  createStallTracker,
  hashToolInput,
  buildInterventionMessage,
  DEFAULT_STALL_DETECTION_CONFIG,
} from './stall-detection.js';
export type {
  StallDetectionConfig,
  StallDetection,
  StallType,
  StallTracker,
  ToolCallRecord,
} from './stall-detection.js';

// Discovery module (autonomous work discovery)
export {
  type DiscoveredWork,
  type WorkSource,
  type WorkPriority,
  type SuggestedWorkflow,
  type AutomationTier,
  type WorkDiscoveryConfig,
  determinePriority,
  determineAutomationTier,
  suggestWorkflow,
  createWorkFromValidation,
  WorkPoller,
  createWorkPoller,
  type WorkPollerEvents,
} from './discovery/index.js';

// Metrics module (process metrics collector)
export {
  type TimingMetrics,
  type QualityMetrics,
  type LearningMetrics,
  type ProcessMetrics,
  type AggregateMetrics,
  type CategoryMetrics,
  type ProcessMetricsConfig,
  type ProcessMetricsEvents,
  ProcessMetricsCollector,
  createProcessMetricsCollector,
} from './metrics/index.js';

// Verification module (replay verifier)
export {
  type ReplayScenario,
  type ReplayAttempt,
  type ReplayResult,
  type ReplayComparison,
  type VerificationSummary,
  type ReplayVerifierConfig,
  type ReplayVerifierEvents,
  type FixExecutor,
  ReplayVerifier,
  createReplayVerifier,
} from './verification/index.js';
