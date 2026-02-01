// ABOUTME: Type definitions for Feature Factory orchestrator.
// ABOUTME: Defines agents, workflows, events, and configuration interfaces.

/**
 * Available agent types in the Feature Factory
 */
export type AgentType =
  | 'architect'
  | 'spec'
  | 'test-gen'
  | 'dev'
  | 'qa'
  | 'review'
  | 'docs';

/**
 * Available workflow types
 */
export type WorkflowType = 'new-feature' | 'bug-fix' | 'refactor';

/**
 * Core tools available to agents (file operations, shell)
 */
export type CoreTool =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Glob'
  | 'Grep'
  | 'Bash'
  | 'WebSearch'
  | 'WebFetch'
  | 'AskUserQuestion';

/**
 * MCP Twilio tools for API operations and validation
 */
export type McpTool =
  // Messaging
  | 'send_sms'
  | 'send_mms'
  | 'get_message_logs'
  | 'get_message_status'
  // Voice
  | 'get_call_logs'
  | 'make_call'
  | 'get_recording'
  // Phone Numbers
  | 'list_phone_numbers'
  | 'configure_webhook'
  | 'search_available_numbers'
  // Verify
  | 'start_verification'
  | 'check_verification'
  | 'get_verification_status'
  // Sync
  | 'create_document'
  | 'update_document'
  | 'get_document'
  | 'list_documents'
  // TaskRouter
  | 'create_task'
  | 'list_tasks'
  | 'get_task_status'
  | 'list_workers'
  | 'list_workflows'
  // Debugger
  | 'get_debugger_logs'
  | 'analyze_errors'
  | 'get_usage_records'
  // Deep Validation
  | 'validate_message'
  | 'validate_call'
  | 'validate_verification';

/**
 * All tools available to agents
 */
export type AgentTool = CoreTool | McpTool;

/**
 * Model selection for agents
 */
export type ModelType = 'sonnet' | 'opus' | 'haiku';

/**
 * Approval mode for workflow phases
 */
export type ApprovalMode = 'after-each-phase' | 'at-end' | 'none';

/**
 * Autonomous mode configuration
 *
 * When enabled, the workflow runs without human approval prompts.
 * Quality gates (TDD, lint, coverage) still enforced.
 * Budget and turn limits removed.
 */
export interface AutonomousModeConfig {
  /** Whether autonomous mode is enabled */
  enabled: boolean;

  /** Whether the user has acknowledged the risks */
  acknowledged: boolean;

  /** How acknowledgment was provided */
  acknowledgedVia: 'interactive' | 'environment' | null;

  /** Timestamp of acknowledgment */
  acknowledgedAt: Date | null;
}

/**
 * Summary of an autonomous session completion
 */
export interface AutonomousSessionSummary {
  /** Session ID */
  sessionId: string;

  /** Duration in milliseconds */
  durationMs: number;

  /** Total cost in USD */
  totalCostUsd: number;

  /** Phases completed vs total */
  phasesCompleted: number;
  phasesTotal: number;

  /** Test results */
  testResults: {
    unitTestsPassed: number;
    unitTestsTotal: number;
    integrationTestsPassed: number;
    integrationTestsTotal: number;
    coveragePercent: number;
    lintClean: boolean;
  };

  /** Files created/modified */
  filesCreated: string[];
  filesModified: string[];

  /** Learnings and recommendations captured */
  learningsCaptured: number;
  pendingActionsGenerated: number;

  /** Whether E2E validation was performed */
  e2eValidationPerformed: boolean;
  e2eValidationResult?: {
    callsCompleted: number;
    messagesDelivered: number;
  };

  /** Audit log path */
  auditLogPath: string;
}

/**
 * Configuration for an individual agent
 */
export interface AgentConfig {
  /** Agent identifier */
  name: AgentType;

  /** Human-readable description */
  description: string;

  /** System prompt for the agent */
  systemPrompt: string;

  /** Tools the agent can use */
  tools: AgentTool[];

  /** Maximum turns before stopping */
  maxTurns: number;

  /** Model to use (optional, defaults to config.defaultModel) */
  model?: ModelType;

  /** Input schema description */
  inputSchema: Record<string, string>;

  /** Output schema description */
  outputSchema: Record<string, string>;
}

/**
 * Context passed to an agent when executing
 */
export interface AgentContext {
  /** Feature description from user */
  featureDescription: string;

  /** Current working directory */
  workingDirectory: string;

  /** Results from previous phases */
  previousPhaseResults: Record<string, AgentResult>;

  /** Additional context from user or previous agents */
  additionalContext?: string;
}

/**
 * Result from an agent execution
 */
export interface AgentResult {
  /** Agent that produced this result */
  agent: AgentType;

  /** Whether the agent completed successfully */
  success: boolean;

  /** Structured output from the agent */
  output: Record<string, unknown>;

  /** Files created during execution */
  filesCreated: string[];

  /** Files modified during execution */
  filesModified: string[];

  /** Commits made during execution */
  commits: string[];

  /** Cost incurred (USD) */
  costUsd: number;

  /** Number of turns used */
  turnsUsed: number;

  /** Validation results (if applicable) */
  validation?: ValidationResult;

  /** Error message if failed */
  error?: string;
}

/**
 * A phase in a workflow
 */
export interface WorkflowPhase {
  /** Agent to execute */
  agent: AgentType;

  /** Phase name for display */
  name: string;

  /** Whether human approval is required after this phase */
  approvalRequired: boolean;

  /** Transform this phase's result into input for next phase */
  nextPhaseInput?: (result: AgentResult) => Record<string, unknown>;

  /** Validation function to check if phase succeeded */
  validation?: (result: AgentResult) => boolean | Promise<boolean>;

  /** Hooks to run BEFORE this phase starts */
  prePhaseHooks?: HookType[];
}

/**
 * A complete workflow definition
 */
export interface Workflow {
  /** Workflow identifier */
  name: WorkflowType;

  /** Human-readable description */
  description: string;

  /** Ordered list of phases */
  phases: WorkflowPhase[];
}

/**
 * Events emitted during workflow execution
 */
export type WorkflowEvent =
  | WorkflowStartedEvent
  | WorkflowResumedEvent
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | ApprovalRequestedEvent
  | ApprovalReceivedEvent
  | WorkflowCompletedEvent
  | WorkflowErrorEvent
  | CostUpdateEvent
  | PrePhaseHookEvent;

export interface WorkflowStartedEvent {
  type: 'workflow-started';
  workflow: WorkflowType;
  description: string;
  totalPhases: number;
  timestamp: Date;
}

export interface WorkflowResumedEvent {
  type: 'workflow-resumed';
  sessionId: string;
  workflow: WorkflowType;
  description: string;
  resumedAtPhase: number;
  previousCostUsd: number;
  timestamp: Date;
}

export interface PhaseStartedEvent {
  type: 'phase-started';
  phase: string;
  agent: AgentType;
  phaseIndex: number;
  totalPhases: number;
  timestamp: Date;
}

export interface PhaseCompletedEvent {
  type: 'phase-completed';
  phase: string;
  agent: AgentType;
  result: AgentResult;
  timestamp: Date;
}

export interface ApprovalRequestedEvent {
  type: 'approval-requested';
  phase: string;
  summary: string;
  result: AgentResult;
  timestamp: Date;
}

export interface ApprovalReceivedEvent {
  type: 'approval-received';
  phase: string;
  approved: boolean;
  feedback?: string;
  timestamp: Date;
}

export interface WorkflowCompletedEvent {
  type: 'workflow-completed';
  workflow: WorkflowType;
  success: boolean;
  totalCostUsd: number;
  totalTurns: number;
  results: Record<string, AgentResult>;
  timestamp: Date;
}

export interface WorkflowErrorEvent {
  type: 'workflow-error';
  phase?: string;
  error: string;
  recoverable: boolean;
  timestamp: Date;
}

export interface CostUpdateEvent {
  type: 'cost-update';
  currentCostUsd: number;
  budgetRemainingUsd: number;
  timestamp: Date;
}

/**
 * Validation result from deep validation
 */
export interface ValidationResult {
  /** Overall success */
  success: boolean;

  /** Resource SID being validated */
  resourceSid?: string;

  /** Resource type */
  resourceType?: 'message' | 'call' | 'verification' | 'task';

  /** Primary status from API */
  primaryStatus?: string;

  /** Individual check results */
  checks: {
    resourceStatus?: CheckResult;
    debuggerAlerts?: CheckResult;
    syncCallbacks?: CheckResult;
    functionLogs?: CheckResult;
  };

  /** Hard failures */
  errors: string[];

  /** Soft issues */
  warnings: string[];

  /** Validation duration (ms) */
  durationMs?: number;
}

export interface CheckResult {
  passed: boolean;
  data?: unknown;
}

/**
 * State of a running workflow
 */
export interface WorkflowState {
  /** Unique session identifier */
  sessionId: string;

  /** Workflow being executed */
  workflow: WorkflowType;

  /** Feature description */
  description: string;

  /** Current phase index */
  currentPhaseIndex: number;

  /** Status of the workflow */
  status: 'running' | 'awaiting-approval' | 'completed' | 'failed' | 'cancelled';

  /** Results from completed phases */
  phaseResults: Record<string, AgentResult>;

  /** Total cost so far */
  totalCostUsd: number;

  /** Total turns used */
  totalTurns: number;

  /** When the workflow started */
  startedAt: Date;

  /** When the workflow completed (if finished) */
  completedAt?: Date;

  /** Error message if failed */
  error?: string;
}

/**
 * Persisted session with metadata
 */
export interface PersistedSession {
  /** Session metadata */
  metadata: SessionMetadata;

  /** Workflow state */
  state: WorkflowState;
}

/**
 * Session metadata for persistence
 */
export interface SessionMetadata {
  /** Unique session identifier */
  sessionId: string;

  /** When session was created */
  createdAt: string;

  /** Last update timestamp */
  lastUpdatedAt: string;

  /** Working directory for the workflow */
  workingDirectory: string;

  /** Feature Factory version */
  version: string;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook types that can run before or after phases
 */
export type HookType = 'tdd-enforcement' | 'credential-safety' | 'coverage-threshold' | 'test-passing-enforcement';

/**
 * Context passed to a hook when executing
 */
export interface HookContext {
  /** Current working directory */
  workingDirectory: string;

  /** Results from previous phases */
  previousPhaseResults: Record<string, AgentResult>;

  /** Current workflow state */
  workflowState: WorkflowState;

  /** Verbose logging enabled */
  verbose?: boolean;
}

/**
 * Result from a hook execution
 */
export interface HookResult {
  /** Whether the hook passed */
  passed: boolean;

  /** Error message if hook failed */
  error?: string;

  /** Additional data from the hook */
  data?: Record<string, unknown>;

  /** Warnings (hook passed but with concerns) */
  warnings?: string[];
}

/**
 * Configuration for a hook
 */
export interface HookConfig {
  /** Hook identifier */
  name: HookType;

  /** Human-readable description */
  description: string;

  /** The hook execution function */
  execute: (context: HookContext) => Promise<HookResult>;
}

/**
 * Pre-phase hook event
 */
export interface PrePhaseHookEvent {
  type: 'pre-phase-hook';
  phase: string;
  hook: HookType;
  result: HookResult;
  timestamp: Date;
}
