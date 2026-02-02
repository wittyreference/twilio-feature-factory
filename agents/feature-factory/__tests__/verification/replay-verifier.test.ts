// ABOUTME: Tests for replay verifier.
// ABOUTME: Validates that learnings improve fix performance.

import {
  ReplayVerifier,
  createReplayVerifier,
  type ReplayScenario,
  type FixExecutor,
} from '../../src/verification/replay-verifier';
import type { Diagnosis } from '../../src/discovery/work-discovery';

describe('ReplayVerifier', () => {
  const createMockDiagnosis = (overrides: Partial<Diagnosis> = {}): Diagnosis => ({
    patternId: 'PAT-test-001',
    summary: 'Test failure',
    rootCause: {
      category: 'code',
      description: 'Test error',
      confidence: 0.8,
    },
    evidence: [{ source: 'test', data: {}, relevance: 'primary' }],
    suggestedFixes: [
      { description: 'Fix the code', actionType: 'code', confidence: 0.8, automated: true },
    ],
    isKnownPattern: false,
    previousOccurrences: 0,
    validationResult: {
      success: false,
      resourceSid: 'SM123',
      resourceType: 'message',
      primaryStatus: 'failed',
      checks: {},
      errors: ['Test error'],
      warnings: [],
      duration: 100,
    },
    timestamp: new Date(),
    ...overrides,
  });

  const createMockScenario = (
    id: string,
    options: {
      successOnAttempt?: number;
      successWithLearnings?: boolean;
    } = {}
  ): ReplayScenario => {
    let attemptCount = 0;
    const successOnAttempt = options.successOnAttempt ?? 1;

    return {
      id,
      name: `Test Scenario ${id}`,
      description: 'A test scenario',
      diagnosis: createMockDiagnosis(),
      capturedLearnings: ['Learning 1: Fix X by doing Y'],
      resolution: 'Applied fix Y',
      validateSuccess: async () => {
        attemptCount++;
        // If successWithLearnings is set, only succeed when learnings are present
        // This is controlled by the executor via the learnings parameter
        if (options.successWithLearnings !== undefined) {
          // Success is determined by the executor setting a flag
          return attemptCount >= successOnAttempt;
        }
        return attemptCount >= successOnAttempt;
      },
      setupFailure: async () => {
        attemptCount = 0;
      },
    };
  };

  const createMockExecutor = (options: {
    alwaysSucceed?: boolean;
    succeedWithLearnings?: boolean;
    failFirst?: number;
  } = {}): FixExecutor => {
    let attemptCount = 0;

    return {
      attemptFix: async (diagnosis, learnings) => {
        attemptCount++;
        const actions = [`Applied fix for ${diagnosis.patternId}`];

        if (learnings && learnings.length > 0) {
          actions.push(`Used ${learnings.length} learnings`);
        }

        // If succeedWithLearnings is true, only succeed when learnings are provided
        if (options.succeedWithLearnings && !learnings) {
          // Don't add success action - scenario validation will handle this
        }

        if (options.failFirst && attemptCount <= options.failFirst) {
          actions.push('Attempt failed');
        }

        return actions;
      },
    };
  };

  describe('constructor', () => {
    it('creates verifier with default config', () => {
      const verifier = createReplayVerifier();
      expect(verifier).toBeInstanceOf(ReplayVerifier);
      expect(verifier.getScenarios()).toHaveLength(0);
    });

    it('creates verifier with custom config', () => {
      const verifier = createReplayVerifier({
        maxAttempts: 10,
        attemptTimeoutMs: 60000,
        attemptDelayMs: 500,
        verbose: true,
      });
      expect(verifier).toBeInstanceOf(ReplayVerifier);
    });
  });

  describe('registerScenario / unregisterScenario', () => {
    it('registers and retrieves scenarios', () => {
      const verifier = createReplayVerifier();
      const scenario = createMockScenario('scenario-1');

      verifier.registerScenario(scenario);

      const scenarios = verifier.getScenarios();
      expect(scenarios).toHaveLength(1);
      expect(scenarios[0].id).toBe('scenario-1');
    });

    it('unregisters scenarios', () => {
      const verifier = createReplayVerifier();
      const scenario = createMockScenario('scenario-1');

      verifier.registerScenario(scenario);
      verifier.unregisterScenario('scenario-1');

      expect(verifier.getScenarios()).toHaveLength(0);
    });
  });

  describe('setExecutor', () => {
    it('sets the fix executor', () => {
      const verifier = createReplayVerifier();
      const executor = createMockExecutor();

      // Should not throw
      verifier.setExecutor(executor);
    });
  });

  describe('replay', () => {
    it('throws if scenario not found', async () => {
      const verifier = createReplayVerifier();
      verifier.setExecutor(createMockExecutor());

      await expect(verifier.replay('unknown', false)).rejects.toThrow('Scenario not found');
    });

    it('throws if no executor set', async () => {
      const verifier = createReplayVerifier();
      verifier.registerScenario(createMockScenario('scenario-1'));

      await expect(verifier.replay('scenario-1', false)).rejects.toThrow('No fix executor set');
    });

    it('replays scenario successfully on first attempt', async () => {
      const verifier = createReplayVerifier();
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1', { successOnAttempt: 1 }));

      const result = await verifier.replay('scenario-1', false);

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(result.attempts[0].success).toBe(true);
    });

    it('replays scenario with multiple attempts before success', async () => {
      const verifier = createReplayVerifier({ maxAttempts: 5, attemptDelayMs: 10 });
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1', { successOnAttempt: 3 }));

      const result = await verifier.replay('scenario-1', false);

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(3);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[1].success).toBe(false);
      expect(result.attempts[2].success).toBe(true);
    });

    it('fails after max attempts', async () => {
      const verifier = createReplayVerifier({ maxAttempts: 3, attemptDelayMs: 10 });
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1', { successOnAttempt: 10 }));

      const result = await verifier.replay('scenario-1', false);

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(3);
    });

    it('includes learnings flag in result', async () => {
      const verifier = createReplayVerifier();
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1'));

      const withoutLearnings = await verifier.replay('scenario-1', false);
      expect(withoutLearnings.withLearnings).toBe(false);

      const withLearnings = await verifier.replay('scenario-1', true);
      expect(withLearnings.withLearnings).toBe(true);
    });

    it('emits replay-started event', (done) => {
      const verifier = createReplayVerifier();
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1'));

      verifier.on('replay-started', (scenarioId, withLearnings) => {
        expect(scenarioId).toBe('scenario-1');
        expect(withLearnings).toBe(true);
        done();
      });

      verifier.replay('scenario-1', true);
    });

    it('emits replay-attempt events', (done) => {
      const verifier = createReplayVerifier({ maxAttempts: 2, attemptDelayMs: 10 });
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1', { successOnAttempt: 2 }));

      const attempts: number[] = [];
      verifier.on('replay-attempt', (scenarioId, attempt) => {
        attempts.push(attempt.attempt);
        if (attempts.length === 2) {
          expect(attempts).toEqual([1, 2]);
          done();
        }
      });

      verifier.replay('scenario-1', false);
    });

    it('emits replay-completed event', (done) => {
      const verifier = createReplayVerifier();
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1'));

      verifier.on('replay-completed', (result) => {
        expect(result.scenarioId).toBe('scenario-1');
        expect(result.success).toBe(true);
        done();
      });

      verifier.replay('scenario-1', false);
    });
  });

  describe('compare', () => {
    it('throws if scenario not found', async () => {
      const verifier = createReplayVerifier();
      verifier.setExecutor(createMockExecutor());

      await expect(verifier.compare('unknown')).rejects.toThrow('Scenario not found');
    });

    it('compares baseline and enhanced results', async () => {
      const verifier = createReplayVerifier({ attemptDelayMs: 10 });
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1', { successOnAttempt: 1 }));

      const comparison = await verifier.compare('scenario-1');

      expect(comparison.scenarioId).toBe('scenario-1');
      expect(comparison.baseline).toBeDefined();
      expect(comparison.enhanced).toBeDefined();
      expect(comparison.improvement).toBeDefined();
    });

    it('calculates improvement when learnings help', async () => {
      const verifier = createReplayVerifier({ attemptDelayMs: 10 });

      // Create scenario that fails twice without learnings, succeeds immediately with
      let hasLearnings = false;
      let attemptCount = 0;

      const scenario: ReplayScenario = {
        id: 'learning-helps',
        name: 'Learnings Help Scenario',
        description: 'Scenario where learnings help',
        diagnosis: createMockDiagnosis(),
        capturedLearnings: ['Key learning'],
        resolution: 'Fixed',
        validateSuccess: async () => {
          attemptCount++;
          // Succeed immediately with learnings, after 2 attempts without
          return hasLearnings || attemptCount >= 2;
        },
        setupFailure: async () => {
          attemptCount = 0;
        },
      };

      const executor: FixExecutor = {
        attemptFix: async (diagnosis, learnings) => {
          hasLearnings = !!learnings && learnings.length > 0;
          return ['Applied fix'];
        },
      };

      verifier.setExecutor(executor);
      verifier.registerScenario(scenario);

      const comparison = await verifier.compare('learning-helps');

      // Baseline: 2 attempts (no learnings)
      // Enhanced: 1 attempt (with learnings)
      expect(comparison.baseline.totalAttempts).toBe(2);
      expect(comparison.enhanced.totalAttempts).toBe(1);
      expect(comparison.improvement.attemptsSaved).toBe(1);
      expect(comparison.improvement.learningsHelped).toBe(true);
    });

    it('detects when learnings enabled success', async () => {
      const verifier = createReplayVerifier({ maxAttempts: 2, attemptDelayMs: 10 });

      // Scenario that only succeeds with learnings
      let hasLearnings = false;

      const scenario: ReplayScenario = {
        id: 'learnings-required',
        name: 'Learnings Required Scenario',
        description: 'Scenario requiring learnings',
        diagnosis: createMockDiagnosis(),
        capturedLearnings: ['Critical learning'],
        resolution: 'Fixed',
        validateSuccess: async () => hasLearnings,
        setupFailure: async () => {
          // Reset
        },
      };

      const executor: FixExecutor = {
        attemptFix: async (diagnosis, learnings) => {
          hasLearnings = !!learnings && learnings.length > 0;
          return ['Applied fix'];
        },
      };

      verifier.setExecutor(executor);
      verifier.registerScenario(scenario);

      const comparison = await verifier.compare('learnings-required');

      expect(comparison.baseline.success).toBe(false);
      expect(comparison.enhanced.success).toBe(true);
      expect(comparison.improvement.learningsEnabledSuccess).toBe(true);
    });

    it('emits comparison-completed event', (done) => {
      const verifier = createReplayVerifier({ attemptDelayMs: 10 });
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1'));

      verifier.on('comparison-completed', (comparison) => {
        expect(comparison.scenarioId).toBe('scenario-1');
        done();
      });

      verifier.compare('scenario-1');
    });
  });

  describe('verifyAll', () => {
    it('returns empty summary for no scenarios', async () => {
      const verifier = createReplayVerifier();
      verifier.setExecutor(createMockExecutor());

      const summary = await verifier.verifyAll();

      expect(summary.totalScenarios).toBe(0);
      expect(summary.comparisons).toHaveLength(0);
    });

    it('verifies all registered scenarios', async () => {
      const verifier = createReplayVerifier({ attemptDelayMs: 10 });
      verifier.setExecutor(createMockExecutor());

      verifier.registerScenario(createMockScenario('scenario-1'));
      verifier.registerScenario(createMockScenario('scenario-2'));
      verifier.registerScenario(createMockScenario('scenario-3'));

      const summary = await verifier.verifyAll();

      expect(summary.totalScenarios).toBe(3);
      expect(summary.comparisons).toHaveLength(3);
    });

    it('computes summary statistics', async () => {
      const verifier = createReplayVerifier({ attemptDelayMs: 10 });
      verifier.setExecutor(createMockExecutor());

      verifier.registerScenario(createMockScenario('scenario-1'));
      verifier.registerScenario(createMockScenario('scenario-2'));

      const summary = await verifier.verifyAll();

      expect(summary.successRateWithLearnings).toBeDefined();
      expect(summary.successRateWithoutLearnings).toBeDefined();
      expect(summary.avgTimeImprovementPercent).toBeDefined();
      expect(summary.avgAttemptsImprovementPercent).toBeDefined();
    });

    it('emits verification-completed event', (done) => {
      const verifier = createReplayVerifier({ attemptDelayMs: 10 });
      verifier.setExecutor(createMockExecutor());
      verifier.registerScenario(createMockScenario('scenario-1'));

      verifier.on('verification-completed', (summary) => {
        expect(summary.totalScenarios).toBe(1);
        done();
      });

      verifier.verifyAll();
    });
  });

  describe('computeSummary', () => {
    it('classifies scenarios correctly', () => {
      const verifier = createReplayVerifier();

      // Mock comparisons
      const comparisons = [
        // Improved: both succeeded, enhanced was better
        {
          scenarioId: 'improved',
          scenarioName: 'Improved',
          baseline: { success: true, totalAttempts: 3, totalDurationMs: 3000 },
          enhanced: { success: true, totalAttempts: 1, totalDurationMs: 1000 },
          improvement: {
            timeSavedMs: 2000,
            timeImprovementPercent: 66.7,
            attemptsSaved: 2,
            attemptsImprovementPercent: 66.7,
            learningsHelped: true,
            learningsEnabledSuccess: false,
          },
          timestamp: new Date(),
        },
        // Enabled success: baseline failed, enhanced succeeded
        {
          scenarioId: 'enabled',
          scenarioName: 'Enabled',
          baseline: { success: false, totalAttempts: 3, totalDurationMs: 3000 },
          enhanced: { success: true, totalAttempts: 1, totalDurationMs: 1000 },
          improvement: {
            timeSavedMs: 2000,
            timeImprovementPercent: 66.7,
            attemptsSaved: 2,
            attemptsImprovementPercent: 66.7,
            learningsHelped: false,
            learningsEnabledSuccess: true,
          },
          timestamp: new Date(),
        },
        // No difference: same results
        {
          scenarioId: 'same',
          scenarioName: 'Same',
          baseline: { success: true, totalAttempts: 1, totalDurationMs: 1000 },
          enhanced: { success: true, totalAttempts: 1, totalDurationMs: 1000 },
          improvement: {
            timeSavedMs: 0,
            timeImprovementPercent: 0,
            attemptsSaved: 0,
            attemptsImprovementPercent: 0,
            learningsHelped: false,
            learningsEnabledSuccess: false,
          },
          timestamp: new Date(),
        },
        // Hurt: learnings made it worse
        {
          scenarioId: 'hurt',
          scenarioName: 'Hurt',
          baseline: { success: true, totalAttempts: 1, totalDurationMs: 1000 },
          enhanced: { success: true, totalAttempts: 3, totalDurationMs: 3000 },
          improvement: {
            timeSavedMs: -2000,
            timeImprovementPercent: -200,
            attemptsSaved: -2,
            attemptsImprovementPercent: -200,
            learningsHelped: false,
            learningsEnabledSuccess: false,
          },
          timestamp: new Date(),
        },
      ];

      const summary = verifier.computeSummary(comparisons as any);

      expect(summary.totalScenarios).toBe(4);
      expect(summary.scenariosImproved).toBe(1);
      expect(summary.scenariosEnabledSuccess).toBe(1);
      expect(summary.scenariosNoDifference).toBe(1);
      expect(summary.scenariosHurt).toBe(1);
      expect(summary.successRateWithLearnings).toBe(1); // 4/4
      expect(summary.successRateWithoutLearnings).toBe(0.75); // 3/4
    });
  });

  describe('timeout handling', () => {
    it('times out slow operations', async () => {
      const verifier = createReplayVerifier({
        maxAttempts: 1,
        attemptTimeoutMs: 50,
      });

      const slowExecutor: FixExecutor = {
        attemptFix: async () => {
          await new Promise((r) => setTimeout(r, 200));
          return ['Should not reach'];
        },
      };

      verifier.setExecutor(slowExecutor);
      verifier.registerScenario(createMockScenario('scenario-1'));

      const result = await verifier.replay('scenario-1', false);

      expect(result.success).toBe(false);
      expect(result.attempts[0].error).toContain('timed out');
    });
  });
});
