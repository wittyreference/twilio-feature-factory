// ABOUTME: Configuration for Feature Factory orchestrator.
// ABOUTME: Defines cost limits, model selection, and approval behavior.

import type { ApprovalMode, AutonomousModeConfig, ModelType } from './types.js';
import type { ContextManagerConfig } from './context-manager.js';

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

  /**
   * Autonomous mode configuration.
   * When enabled, removes approval prompts and elevates budget/turn limits.
   * Quality gates (TDD, lint, coverage) remain enforced.
   */
  autonomousMode: AutonomousModeConfig;

  /**
   * Context window management overrides.
   * Controls tool output truncation limits and compaction behavior.
   */
  contextWindow?: Partial<ContextManagerConfig>;

  /**
   * Sandbox mode configuration.
   * When enabled, workflows run in an isolated temp directory.
   */
  sandbox?: {
    enabled: boolean;
    sourceDirectory?: string;
  };

  /**
   * Maximum duration per agent in milliseconds.
   * Prevents single agents from running indefinitely.
   * @default 300000 (5 minutes)
   */
  maxDurationMsPerAgent: number;

  /**
   * Maximum duration per workflow in milliseconds.
   * Prevents entire workflows from running indefinitely.
   * @default 1800000 (30 minutes)
   */
  maxDurationMsPerWorkflow: number;
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
  autonomousMode: {
    enabled: false,
    acknowledged: false,
    acknowledgedVia: null,
    acknowledgedAt: null,
  },
  maxDurationMsPerAgent: 5 * 60 * 1000,      // 5 minutes
  maxDurationMsPerWorkflow: 30 * 60 * 1000,   // 30 minutes
};

/**
 * Create a configuration by merging partial options with defaults.
 * When autonomous mode is enabled, overrides approval mode and elevates limits.
 */
export function createConfig(
  options: Partial<FeatureFactoryConfig> = {}
): FeatureFactoryConfig {
  const config = {
    ...DEFAULT_CONFIG,
    ...options,
    autonomousMode: {
      ...DEFAULT_CONFIG.autonomousMode,
      ...options.autonomousMode,
    },
  };

  // Autonomous mode overrides: elevated-but-finite unless user explicitly passed values
  if (config.autonomousMode.enabled && config.autonomousMode.acknowledged) {
    config.approvalMode = 'none';

    if (!options.maxBudgetUsd) {
      config.maxBudgetUsd = 50.0;
    }
    if (!options.maxTurnsPerAgent) {
      config.maxTurnsPerAgent = 200;
    }
    if (!options.maxDurationMsPerAgent) {
      config.maxDurationMsPerAgent = 10 * 60 * 1000;   // 10 min (elevated from 5)
    }
    if (!options.maxDurationMsPerWorkflow) {
      config.maxDurationMsPerWorkflow = 60 * 60 * 1000; // 60 min (elevated from 30)
    }

    // Autonomous mode implies sandbox unless explicitly disabled
    if (config.sandbox === undefined) {
      config.sandbox = { enabled: true, sourceDirectory: config.workingDirectory };
    }
  }

  return config;
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

  if (config.maxDurationMsPerAgent <= 0) {
    throw new Error('maxDurationMsPerAgent must be greater than 0');
  }

  if (config.maxDurationMsPerWorkflow <= 0) {
    throw new Error('maxDurationMsPerWorkflow must be greater than 0');
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

  // Autonomous mode requires acknowledgment
  if (config.autonomousMode.enabled && !config.autonomousMode.acknowledged) {
    throw new Error(
      'Autonomous mode is enabled but not acknowledged. ' +
        'Use --dangerously-autonomous flag with acknowledgment prompt, ' +
        'or set FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED=true in CI/CD.'
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

  if (process.env.FEATURE_FACTORY_MAX_DURATION_PER_AGENT) {
    config.maxDurationMsPerAgent = parseInt(
      process.env.FEATURE_FACTORY_MAX_DURATION_PER_AGENT,
      10
    );
  }

  if (process.env.FEATURE_FACTORY_MAX_DURATION_PER_WORKFLOW) {
    config.maxDurationMsPerWorkflow = parseInt(
      process.env.FEATURE_FACTORY_MAX_DURATION_PER_WORKFLOW,
      10
    );
  }

  // Context window management from environment
  if (process.env.FEATURE_FACTORY_CONTEXT_COMPACTION_THRESHOLD) {
    config.contextWindow = {
      ...config.contextWindow,
      compactionThresholdTokens: parseInt(
        process.env.FEATURE_FACTORY_CONTEXT_COMPACTION_THRESHOLD,
        10
      ),
    };
  }

  // Autonomous mode from environment (for CI/CD)
  if (process.env.FEATURE_FACTORY_AUTONOMOUS === 'true') {
    config.autonomousMode = {
      enabled: true,
      acknowledged:
        process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED === 'true',
      acknowledgedVia:
        process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED === 'true'
          ? 'environment'
          : null,
      acknowledgedAt:
        process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED === 'true'
          ? new Date()
          : null,
    };
  }

  return config;
}

/**
 * Check if autonomous mode is enabled and acknowledged
 */
export function isAutonomousMode(config: FeatureFactoryConfig): boolean {
  return config.autonomousMode.enabled && config.autonomousMode.acknowledged;
}
