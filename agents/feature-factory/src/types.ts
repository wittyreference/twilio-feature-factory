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
  | 'review'
  | 'docs';

/**
 * Available workflow types
 */
export type WorkflowType = 'new-feature' | 'bug-fix' | 'refactor';

/**
 * Tools available to agents
 */
export type AgentTool =
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
 * Model selection for agents
 */
export type ModelType = 'sonnet' | 'opus' | 'haiku';

/**
 * Approval mode for workflow phases
 */
export type ApprovalMode = 'after-each-phase' | 'at-end' | 'none';

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
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | ApprovalRequestedEvent
  | ApprovalReceivedEvent
  | WorkflowCompletedEvent
  | WorkflowErrorEvent
  | CostUpdateEvent;

export interface WorkflowStartedEvent {
  type: 'workflow-started';
  workflow: WorkflowType;
  description: string;
  totalPhases: number;
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
