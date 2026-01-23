// ABOUTME: Configuration for Feature Factory orchestrator.
// ABOUTME: Defines cost limits, model selection, and approval behavior.

import type { ApprovalMode, ModelType } from './types.js';

/**
 * Feature Factory configuration options
 */
export interface FeatureFactoryConfig {
  /**
   * Maximum budget in USD for a single feature.
   * Pipeline stops if this is exceeded.
   * @default 5.00
   */
  maxBudgetUsd: number;

  /**
   * Maximum turns per agent before stopping.
   * Prevents infinite loops.
   * @default 50
   */
  maxTurnsPerAgent: number;

  /**
   * Default model for agents.
   * Can be overridden per-agent.
   * @default 'sonnet'
   */
  defaultModel: ModelType;

  /**
   * When to require human approval.
   * - 'after-each-phase': Approval after architect, spec, review
   * - 'at-end': Single approval after all phases
   * - 'none': No approval gates (autonomous)
   * @default 'after-each-phase'
   */
  approvalMode: ApprovalMode;

  /**
   * Whether to enable Twilio MCP tools.
   * Required for deep validation.
   * @default true
   */
  twilioMcpEnabled: boolean;

  /**
   * Whether to use deep validation.
   * Validates beyond 200 OK responses.
   * @default true
   */
  deepValidationEnabled: boolean;

  /**
   * Timeout for validation operations (ms).
   * @default 30000
   */
  validationTimeoutMs: number;

  /**
   * Working directory for the pipeline.
   * @default process.cwd()
   */
  workingDirectory: string;

  /**
   * Enable verbose logging.
   * @default false
   */
  verbose: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: FeatureFactoryConfig = {
  maxBudgetUsd: 5.0,
  maxTurnsPerAgent: 50,
  defaultModel: 'sonnet',
  approvalMode: 'after-each-phase',
  twilioMcpEnabled: true,
  deepValidationEnabled: true,
  validationTimeoutMs: 30000,
  workingDirectory: process.cwd(),
  verbose: false,
};

/**
 * Create a configuration by merging partial options with defaults
 */
export function createConfig(
  options: Partial<FeatureFactoryConfig> = {}
): FeatureFactoryConfig {
  return {
    ...DEFAULT_CONFIG,
    ...options,
  };
}

/**
 * Validate configuration values
 */
export function validateConfig(config: FeatureFactoryConfig): void {
  if (config.maxBudgetUsd <= 0) {
    throw new Error('maxBudgetUsd must be greater than 0');
  }

  if (config.maxTurnsPerAgent <= 0) {
    throw new Error('maxTurnsPerAgent must be greater than 0');
  }

  if (config.validationTimeoutMs <= 0) {
    throw new Error('validationTimeoutMs must be greater than 0');
  }

  const validModels: ModelType[] = ['sonnet', 'opus', 'haiku'];
  if (!validModels.includes(config.defaultModel)) {
    throw new Error(`defaultModel must be one of: ${validModels.join(', ')}`);
  }

  const validApprovalModes: ApprovalMode[] = [
    'after-each-phase',
    'at-end',
    'none',
  ];
  if (!validApprovalModes.includes(config.approvalMode)) {
    throw new Error(
      `approvalMode must be one of: ${validApprovalModes.join(', ')}`
    );
  }
}

/**
 * Environment variable overrides for configuration
 */
export function configFromEnv(): Partial<FeatureFactoryConfig> {
  const config: Partial<FeatureFactoryConfig> = {};

  if (process.env.FEATURE_FACTORY_MAX_BUDGET) {
    config.maxBudgetUsd = parseFloat(process.env.FEATURE_FACTORY_MAX_BUDGET);
  }

  if (process.env.FEATURE_FACTORY_MAX_TURNS) {
    config.maxTurnsPerAgent = parseInt(
      process.env.FEATURE_FACTORY_MAX_TURNS,
      10
    );
  }

  if (process.env.FEATURE_FACTORY_MODEL) {
    config.defaultModel = process.env.FEATURE_FACTORY_MODEL as ModelType;
  }

  if (process.env.FEATURE_FACTORY_APPROVAL_MODE) {
    config.approvalMode = process.env
      .FEATURE_FACTORY_APPROVAL_MODE as ApprovalMode;
  }

  if (process.env.FEATURE_FACTORY_VERBOSE === 'true') {
    config.verbose = true;
  }

  return config;
}
