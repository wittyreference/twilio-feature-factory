// ABOUTME: Replay verifier for validating that learnings improve performance.
// ABOUTME: Compares scenario execution with and without learnings injected.

import { EventEmitter } from 'events';
import type { Diagnosis } from '../discovery/work-discovery.js';

/**
 * A scenario to replay for verification.
 */
export interface ReplayScenario {
  /** Unique identifier for the scenario */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of the scenario */
  description: string;

  /** The original diagnosis that was generated */
  diagnosis: Diagnosis;

  /** Learnings that were captured during the original fix */
  capturedLearnings: string[];

  /** The resolution that was applied */
  resolution: string;

  /** Validation check to determine if scenario is "fixed" */
  validateSuccess: () => Promise<boolean>;

  /** Function to set up the failure condition */
  setupFailure?: () => Promise<void>;

  /** Function to clean up after replay */
  cleanup?: () => Promise<void>;
}

/**
 * Result of a single replay attempt.
 */
export interface ReplayAttempt {
  /** Attempt number (1-indexed) */
  attempt: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Whether this attempt succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Actions taken during this attempt */
  actions: string[];
}

/**
 * Result of replaying a scenario.
 */
export interface ReplayResult {
  /** Scenario that was replayed */
  scenarioId: string;

  /** Whether learnings were injected */
  withLearnings: boolean;

  /** Total duration in milliseconds */
  totalDurationMs: number;

  /** Number of attempts before success (or max) */
  totalAttempts: number;

  /** Whether the scenario was ultimately successful */
  success: boolean;

  /** Individual attempt results */
  attempts: ReplayAttempt[];

  /** Timestamp when replay started */
  startedAt: Date;

  /** Timestamp when replay completed */
  completedAt: Date;
}

/**
 * Comparison of replay results with and without learnings.
 */
export interface ReplayComparison {
  /** Scenario being compared */
  scenarioId: string;

  /** Scenario name */
  scenarioName: string;

  /** Baseline result (without learnings) */
  baseline: ReplayResult;

  /** Enhanced result (with learnings) */
  enhanced: ReplayResult;

  /** Improvement metrics */
  improvement: {
    /** Time saved (baseline - enhanced) in ms, positive = faster with learnings */
    timeSavedMs: number;

    /** Percentage improvement in time */
    timeImprovementPercent: number;

    /** Attempts saved (baseline - enhanced), positive = fewer attempts with learnings */
    attemptsSaved: number;

    /** Percentage improvement in attempts */
    attemptsImprovementPercent: number;

    /** Whether learnings helped (both succeeded but enhanced was better) */
    learningsHelped: boolean;

    /** Whether baseline failed but enhanced succeeded */
    learningsEnabledSuccess: boolean;
  };

  /** Timestamp of comparison */
  timestamp: Date;
}

/**
 * Summary of multiple replay verifications.
 */
export interface VerificationSummary {
  /** Total scenarios tested */
  totalScenarios: number;

  /** Scenarios where learnings helped */
  scenariosImproved: number;

  /** Scenarios where learnings enabled success */
  scenariosEnabledSuccess: number;

  /** Scenarios where learnings made no difference */
  scenariosNoDifference: number;

  /** Scenarios where learnings hurt (rare, indicates bad learnings) */
  scenariosHurt: number;

  /** Average time improvement percentage */
  avgTimeImprovementPercent: number;

  /** Average attempts improvement percentage */
  avgAttemptsImprovementPercent: number;

  /** Individual comparisons */
  comparisons: ReplayComparison[];

  /** Overall success rate with learnings */
  successRateWithLearnings: number;

  /** Overall success rate without learnings */
  successRateWithoutLearnings: number;
}

/**
 * Configuration for ReplayVerifier.
 */
export interface ReplayVerifierConfig {
  /** Maximum attempts per scenario. Default: 5 */
  maxAttempts?: number;

  /** Timeout per attempt in milliseconds. Default: 30000 */
  attemptTimeoutMs?: number;

  /** Delay between attempts in milliseconds. Default: 1000 */
  attemptDelayMs?: number;

  /** Enable verbose logging. Default: false */
  verbose?: boolean;
}

/**
 * Events emitted by ReplayVerifier.
 */
export interface ReplayVerifierEvents {
  'replay-started': [scenarioId: string, withLearnings: boolean];
  'replay-attempt': [scenarioId: string, attempt: ReplayAttempt];
  'replay-completed': [result: ReplayResult];
  'comparison-completed': [comparison: ReplayComparison];
  'verification-completed': [summary: VerificationSummary];
}

/**
 * Executor interface for running fix attempts.
 * This allows different execution strategies to be plugged in.
 */
export interface FixExecutor {
  /**
   * Attempts to fix the scenario.
   * @param diagnosis The diagnosis to use for fixing
   * @param learnings Optional learnings to inject
   * @returns Actions taken during the fix attempt
   */
  attemptFix(diagnosis: Diagnosis, learnings?: string[]): Promise<string[]>;
}

/**
 * Verifies that captured learnings actually improve fix performance.
 * Runs scenarios with and without learnings and compares results.
 */
export class ReplayVerifier extends EventEmitter {
  private config: Required<ReplayVerifierConfig>;
  private scenarios: Map<string, ReplayScenario> = new Map();
  private executor?: FixExecutor;

  constructor(config: ReplayVerifierConfig = {}) {
    super();
    this.config = {
      maxAttempts: config.maxAttempts ?? 5,
      attemptTimeoutMs: config.attemptTimeoutMs ?? 30000,
      attemptDelayMs: config.attemptDelayMs ?? 1000,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Sets the fix executor for replay attempts.
   */
  setExecutor(executor: FixExecutor): void {
    this.executor = executor;
  }

  /**
   * Registers a scenario for replay verification.
   */
  registerScenario(scenario: ReplayScenario): void {
    this.scenarios.set(scenario.id, scenario);
    if (this.config.verbose) {
      console.log(`[ReplayVerifier] Registered scenario: ${scenario.id}`);
    }
  }

  /**
   * Unregisters a scenario.
   */
  unregisterScenario(scenarioId: string): void {
    this.scenarios.delete(scenarioId);
  }

  /**
   * Gets all registered scenarios.
   */
  getScenarios(): ReplayScenario[] {
    return Array.from(this.scenarios.values());
  }

  /**
   * Replays a single scenario.
   * @param scenarioId The scenario to replay
   * @param withLearnings Whether to inject learnings
   */
  async replay(scenarioId: string, withLearnings: boolean): Promise<ReplayResult> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    if (!this.executor) {
      throw new Error('No fix executor set. Call setExecutor() first.');
    }

    const startedAt = new Date();
    const attempts: ReplayAttempt[] = [];
    let success = false;

    this.emit('replay-started', scenarioId, withLearnings);

    // Set up failure condition if provided
    if (scenario.setupFailure) {
      await scenario.setupFailure();
    }

    try {
      for (let i = 1; i <= this.config.maxAttempts && !success; i++) {
        const attemptStart = Date.now();
        let actions: string[] = [];
        let error: string | undefined;

        try {
          // Run fix attempt with timeout
          actions = await this.runWithTimeout(
            () =>
              this.executor!.attemptFix(
                scenario.diagnosis,
                withLearnings ? scenario.capturedLearnings : undefined
              ),
            this.config.attemptTimeoutMs
          );

          // Check if successful
          success = await scenario.validateSuccess();
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }

        const attempt: ReplayAttempt = {
          attempt: i,
          durationMs: Date.now() - attemptStart,
          success,
          error,
          actions,
        };

        attempts.push(attempt);
        this.emit('replay-attempt', scenarioId, attempt);

        if (this.config.verbose) {
          console.log(
            `[ReplayVerifier] Attempt ${i}/${this.config.maxAttempts} for ${scenarioId}: ${
              success ? 'SUCCESS' : error || 'FAILED'
            }`
          );
        }

        // Delay between attempts if not successful and not last attempt
        if (!success && i < this.config.maxAttempts) {
          await this.delay(this.config.attemptDelayMs);
        }
      }
    } finally {
      // Clean up if provided
      if (scenario.cleanup) {
        await scenario.cleanup();
      }
    }

    const completedAt = new Date();
    const result: ReplayResult = {
      scenarioId,
      withLearnings,
      totalDurationMs: completedAt.getTime() - startedAt.getTime(),
      totalAttempts: attempts.length,
      success,
      attempts,
      startedAt,
      completedAt,
    };

    this.emit('replay-completed', result);
    return result;
  }

  /**
   * Compares scenario execution with and without learnings.
   * @param scenarioId The scenario to compare
   */
  async compare(scenarioId: string): Promise<ReplayComparison> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario not found: ${scenarioId}`);
    }

    if (this.config.verbose) {
      console.log(`[ReplayVerifier] Comparing ${scenarioId} with and without learnings`);
    }

    // Run baseline (without learnings)
    const baseline = await this.replay(scenarioId, false);

    // Run enhanced (with learnings)
    const enhanced = await this.replay(scenarioId, true);

    // Calculate improvement
    const timeSavedMs = baseline.totalDurationMs - enhanced.totalDurationMs;
    const timeImprovementPercent =
      baseline.totalDurationMs > 0 ? (timeSavedMs / baseline.totalDurationMs) * 100 : 0;

    const attemptsSaved = baseline.totalAttempts - enhanced.totalAttempts;
    const attemptsImprovementPercent =
      baseline.totalAttempts > 0 ? (attemptsSaved / baseline.totalAttempts) * 100 : 0;

    const learningsHelped = enhanced.success && (timeSavedMs > 0 || attemptsSaved > 0);
    const learningsEnabledSuccess = !baseline.success && enhanced.success;

    const comparison: ReplayComparison = {
      scenarioId,
      scenarioName: scenario.name,
      baseline,
      enhanced,
      improvement: {
        timeSavedMs,
        timeImprovementPercent,
        attemptsSaved,
        attemptsImprovementPercent,
        learningsHelped,
        learningsEnabledSuccess,
      },
      timestamp: new Date(),
    };

    this.emit('comparison-completed', comparison);

    if (this.config.verbose) {
      console.log(
        `[ReplayVerifier] Comparison complete: time ${timeImprovementPercent.toFixed(1)}% better, ` +
          `attempts ${attemptsImprovementPercent.toFixed(1)}% better`
      );
    }

    return comparison;
  }

  /**
   * Verifies all registered scenarios and produces a summary.
   */
  async verifyAll(): Promise<VerificationSummary> {
    const comparisons: ReplayComparison[] = [];

    for (const scenario of this.scenarios.values()) {
      try {
        const comparison = await this.compare(scenario.id);
        comparisons.push(comparison);
      } catch (e) {
        if (this.config.verbose) {
          console.error(`[ReplayVerifier] Failed to verify ${scenario.id}:`, e);
        }
      }
    }

    const summary = this.computeSummary(comparisons);
    this.emit('verification-completed', summary);
    return summary;
  }

  /**
   * Computes a summary from comparison results.
   */
  computeSummary(comparisons: ReplayComparison[]): VerificationSummary {
    if (comparisons.length === 0) {
      return {
        totalScenarios: 0,
        scenariosImproved: 0,
        scenariosEnabledSuccess: 0,
        scenariosNoDifference: 0,
        scenariosHurt: 0,
        avgTimeImprovementPercent: 0,
        avgAttemptsImprovementPercent: 0,
        comparisons: [],
        successRateWithLearnings: 0,
        successRateWithoutLearnings: 0,
      };
    }

    let scenariosImproved = 0;
    let scenariosEnabledSuccess = 0;
    let scenariosNoDifference = 0;
    let scenariosHurt = 0;

    let totalTimeImprovement = 0;
    let totalAttemptsImprovement = 0;
    let successWithLearnings = 0;
    let successWithoutLearnings = 0;

    for (const comparison of comparisons) {
      const { improvement, baseline, enhanced } = comparison;

      if (improvement.learningsEnabledSuccess) {
        scenariosEnabledSuccess++;
      } else if (improvement.learningsHelped) {
        scenariosImproved++;
      } else if (
        baseline.success &&
        enhanced.success &&
        improvement.timeSavedMs < 0 &&
        improvement.attemptsSaved < 0
      ) {
        scenariosHurt++;
      } else {
        scenariosNoDifference++;
      }

      totalTimeImprovement += improvement.timeImprovementPercent;
      totalAttemptsImprovement += improvement.attemptsImprovementPercent;

      if (enhanced.success) successWithLearnings++;
      if (baseline.success) successWithoutLearnings++;
    }

    return {
      totalScenarios: comparisons.length,
      scenariosImproved,
      scenariosEnabledSuccess,
      scenariosNoDifference,
      scenariosHurt,
      avgTimeImprovementPercent: totalTimeImprovement / comparisons.length,
      avgAttemptsImprovementPercent: totalAttemptsImprovement / comparisons.length,
      comparisons,
      successRateWithLearnings: successWithLearnings / comparisons.length,
      successRateWithoutLearnings: successWithoutLearnings / comparisons.length,
    };
  }

  // Helper methods

  private async runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a new ReplayVerifier instance.
 */
export function createReplayVerifier(config?: ReplayVerifierConfig): ReplayVerifier {
  return new ReplayVerifier(config);
}
