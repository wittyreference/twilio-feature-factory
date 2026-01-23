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
  PhaseStartedEvent,
  PhaseCompletedEvent,
  ApprovalRequestedEvent,
  ApprovalReceivedEvent,
  WorkflowCompletedEvent,
  WorkflowErrorEvent,
  CostUpdateEvent,
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
