// ABOUTME: Integration tests for autonomous workflow infrastructure.
// ABOUTME: Tests the full diagnose → fix → learn cycle with mocked components.

import { EventEmitter } from 'events';
import {
  WorkPoller,
  createWorkPoller,
  type DiscoveredWork,
  type Diagnosis,
  createWorkFromValidation,
} from '../../src/discovery/index.js';
import {
  ProcessMetricsCollector,
  createProcessMetricsCollector,
} from '../../src/metrics/index.js';
import {
  ReplayVerifier,
  createReplayVerifier,
  type ReplayScenario,
  type FixExecutor,
} from '../../src/verification/index.js';

/**
 * Mock DeepValidator that emits validation events.
 * Simulates the real DeepValidator's EventEmitter behavior.
 */
class MockDeepValidator extends EventEmitter {
  private shouldFail: boolean = true;
  private failCount: number = 0;
  private maxFails: number = 2;

  setFailureMode(shouldFail: boolean, maxFails: number = 2): void {
    this.shouldFail = shouldFail;
    this.maxFails = maxFails;
    this.failCount = 0;
  }

  async validateMessage(messageSid: string): Promise<{ success: boolean; errors: string[] }> {
    const shouldFailNow = this.shouldFail && this.failCount < this.maxFails;
    this.failCount++;

    const result = {
      success: !shouldFailNow,
      resourceSid: messageSid,
      resourceType: 'message' as const,
      primaryStatus: shouldFailNow ? 'failed' : 'delivered',
      checks: {
        resourceStatus: { passed: !shouldFailNow, message: shouldFailNow ? 'Failed' : 'Delivered' },
        debuggerAlerts: { passed: true, message: 'No alerts' },
      },
      errors: shouldFailNow ? ['Message delivery failed'] : [],
      warnings: [],
      duration: 100,
    };

    if (!result.success) {
      const diagnosis = this.createMockDiagnosis(messageSid, result.errors);
      this.emit('validation-failure', {
        type: 'message',
        result,
        diagnosis,
        timestamp: new Date(),
      });
    } else {
      this.emit('validation-success', {
        type: 'message',
        result,
        timestamp: new Date(),
      });
    }

    return result;
  }

  private createMockDiagnosis(resourceSid: string, errors: string[]): Diagnosis {
    return {
      patternId: `PAT-${resourceSid}-${Date.now()}`,
      summary: `Message ${resourceSid} delivery failed`,
      rootCause: {
        category: 'configuration',
        description: errors[0] || 'Unknown error',
        confidence: 0.85,
      },
      evidence: [
        {
          source: 'message-status',
          data: { status: 'failed', errorCode: 30007 },
          relevance: 'primary',
        },
      ],
      suggestedFixes: [
        {
          description: 'Check phone number configuration',
          actionType: 'config',
          confidence: 0.9,
          automated: true,
        },
      ],
      isKnownPattern: false,
      previousOccurrences: 0,
      validationResult: {
        success: false,
        resourceSid,
        resourceType: 'message',
        primaryStatus: 'failed',
        checks: {},
        errors,
        warnings: [],
        duration: 100,
      },
      timestamp: new Date(),
    };
  }
}

/**
 * Mock fix executor for replay verification.
 */
class MockFixExecutor implements FixExecutor {
  private attemptCount = 0;
  private failUntilAttempt: number;
  private learningsProvided = false;

  constructor(failUntilAttempt: number = 2) {
    this.failUntilAttempt = failUntilAttempt;
  }

  reset(): void {
    this.attemptCount = 0;
    this.learningsProvided = false;
  }

  async attemptFix(diagnosis: Diagnosis, learnings?: string[]): Promise<string[]> {
    this.attemptCount++;
    this.learningsProvided = !!learnings && learnings.length > 0;

    const actions: string[] = [];

    if (this.learningsProvided) {
      actions.push('Applied learnings from previous fixes');
      actions.push(`Used ${learnings!.length} learned patterns`);
    }

    actions.push(`Analyzed diagnosis: ${diagnosis.summary}`);
    actions.push(`Applied fix for ${diagnosis.rootCause.category} issue`);

    return actions;
  }

  getAttemptCount(): number {
    return this.attemptCount;
  }

  wasLearningsProvided(): boolean {
    return this.learningsProvided;
  }
}

describe('Autonomous Workflow Integration', () => {
  describe('Work Discovery Pipeline', () => {
    let validator: MockDeepValidator;
    let poller: WorkPoller;

    beforeEach(() => {
      validator = new MockDeepValidator();
      poller = createWorkPoller({ autoHandleLowTier: false });
      poller.registerValidator(validator);
    });

    afterEach(() => {
      poller.unregisterValidator(validator);
      poller.stop();
    });

    it('should discover work from validation failures', async () => {
      const discoveredWork: DiscoveredWork[] = [];

      poller.on('work-discovered', (work) => {
        discoveredWork.push(work);
      });

      // Trigger validation failure
      validator.setFailureMode(true, 1);
      await validator.validateMessage('SM12345');

      // Work should be queued
      expect(discoveredWork).toHaveLength(1);
      expect(discoveredWork[0].source).toBe('validation-failure');
      expect(discoveredWork[0].priority).toBeDefined();
      expect(discoveredWork[0].tier).toBeDefined();
    });

    it('should classify work by priority and tier', async () => {
      const discoveredWork: DiscoveredWork[] = [];

      poller.on('work-discovered', (work) => {
        discoveredWork.push(work);
      });

      // Trigger validation failure
      validator.setFailureMode(true, 1);
      await validator.validateMessage('SM12345');

      const work = discoveredWork[0];

      // Configuration error with high confidence should be critical/tier 1
      expect(work.priority).toBe('critical');
      expect(work.tier).toBe(1);
      expect(work.suggestedWorkflow).toBe('bug-fix');
    });

    it('should track work lifecycle', async () => {
      const events: string[] = [];

      poller.on('work-discovered', () => events.push('discovered'));
      poller.on('work-started', () => events.push('started'));
      poller.on('work-completed', () => events.push('completed'));

      // Trigger validation failure
      validator.setFailureMode(true, 1);
      await validator.validateMessage('SM12345');

      const work = poller.getNextWork()!;
      expect(work).toBeDefined();

      poller.startWork(work);
      expect(work.status).toBe('in-progress');

      poller.completeWork(work, 'Fixed configuration');
      expect(work.status).toBe('completed');

      expect(events).toEqual(['discovered', 'started', 'completed']);
    });

    it('should provide queue statistics', async () => {
      // Trigger multiple failures
      validator.setFailureMode(true, 3);

      for (let i = 0; i < 3; i++) {
        await validator.validateMessage(`SM${i}`);
      }

      const stats = poller.getStats();

      expect(stats.queueSize).toBe(3);
      expect(stats.pendingCount).toBe(3);
      expect(stats.inProgressCount).toBe(0);
      expect(stats.byPriority.critical).toBe(3);
      expect(stats.byTier[1]).toBe(3);
    });
  });

  describe('Process Metrics Integration', () => {
    let collector: ProcessMetricsCollector;
    let poller: WorkPoller;
    let validator: MockDeepValidator;

    beforeEach(() => {
      collector = createProcessMetricsCollector();
      validator = new MockDeepValidator();
      poller = createWorkPoller();
      poller.registerValidator(validator);
    });

    afterEach(() => {
      poller.unregisterValidator(validator);
      poller.stop();
    });

    it('should track complete fix cycle', async () => {
      // Trigger validation failure
      validator.setFailureMode(true, 1);
      await validator.validateMessage('SM12345');

      const work = poller.getNextWork()!;
      expect(work).toBeDefined();

      // Start tracking
      collector.startCycle(work);

      // Simulate fix attempts
      collector.recordFixAttempt(work.id);
      collector.recordLearningCapture(work.id, true); // Novel pattern

      // Complete cycle
      const metrics = collector.completeCycle(work.id, 'Fixed phone configuration', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
        learningsPromoted: 1,
      });

      expect(metrics.timing.fixAttempts).toBe(1);
      expect(metrics.quality.diagnosisAccurate).toBe(true);
      expect(metrics.quality.firstFixWorked).toBe(true);
      expect(metrics.learning.novelPatternsDiscovered).toBe(1);
      expect(metrics.learning.learningsPromoted).toBe(1);
    });

    it('should compute aggregates across multiple cycles', async () => {
      // Trigger multiple failures
      validator.setFailureMode(true, 3);

      for (let i = 0; i < 3; i++) {
        await validator.validateMessage(`SM${i}`);
        const work = poller.getNextWork()!;

        collector.startCycle(work);
        collector.recordFixAttempt(work.id);
        if (i > 0) collector.recordFixAttempt(work.id); // Extra attempt for some

        collector.completeCycle(work.id, 'Fixed', {
          diagnosisAccurate: i < 2, // 2/3 accurate
          rootCauseMatched: true,
          workflowUsed: 'bug-fix',
        });

        poller.completeWork(work, 'Fixed');
      }

      const aggregates = collector.computeAggregates();

      expect(aggregates.totalCycles).toBe(3);
      expect(aggregates.qualityRates.diagnosisAccuracyRate).toBeCloseTo(0.67, 1);
      expect(aggregates.averageTiming.avgFixAttempts).toBeGreaterThan(1);
    });

    it('should emit events for cycle lifecycle', async () => {
      const events: string[] = [];

      collector.on('cycle-started', () => events.push('started'));
      collector.on('fix-attempted', () => events.push('attempted'));
      collector.on('learning-captured', () => events.push('learned'));
      collector.on('cycle-completed', () => events.push('completed'));

      validator.setFailureMode(true, 1);
      await validator.validateMessage('SM12345');

      const work = poller.getNextWork()!;

      collector.startCycle(work);
      collector.recordFixAttempt(work.id);
      collector.recordLearningCapture(work.id, false);
      collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      expect(events).toEqual(['started', 'attempted', 'learned', 'completed']);
    });
  });

  describe('Replay Verification Integration', () => {
    let verifier: ReplayVerifier;
    let executor: MockFixExecutor;

    beforeEach(() => {
      verifier = createReplayVerifier({
        maxAttempts: 5,
        attemptDelayMs: 10,
        attemptTimeoutMs: 5000,
      });
      executor = new MockFixExecutor(2);
      verifier.setExecutor(executor);
    });

    it('should verify learnings improve performance', async () => {
      let attemptsMade = 0;
      let learningsUsed = false;

      const scenario: ReplayScenario = {
        id: 'message-failure',
        name: 'Message Delivery Failure',
        description: 'Tests retry with learnings',
        diagnosis: {
          patternId: 'PAT-001',
          summary: 'Message delivery failed',
          rootCause: {
            category: 'configuration',
            description: 'Invalid phone number format',
            confidence: 0.9,
          },
          evidence: [],
          suggestedFixes: [
            {
              description: 'Use E.164 format',
              actionType: 'config',
              confidence: 0.95,
              automated: true,
            },
          ],
          isKnownPattern: false,
          previousOccurrences: 0,
          validationResult: {
            success: false,
            resourceSid: 'SM123',
            resourceType: 'message',
            primaryStatus: 'failed',
            checks: {},
            errors: ['Invalid format'],
            warnings: [],
            duration: 100,
          },
          timestamp: new Date(),
        },
        capturedLearnings: [
          'Phone numbers must be in E.164 format (+1XXXXXXXXXX)',
          'Validate format before sending',
        ],
        resolution: 'Applied E.164 formatting',
        validateSuccess: async () => {
          attemptsMade++;
          // Succeed faster with learnings
          return learningsUsed || attemptsMade >= 3;
        },
        setupFailure: async () => {
          attemptsMade = 0;
        },
      };

      // Custom executor that tracks learnings usage
      const trackingExecutor: FixExecutor = {
        attemptFix: async (diagnosis, learnings) => {
          learningsUsed = !!learnings && learnings.length > 0;
          return [`Applied fix, learnings: ${learningsUsed}`];
        },
      };

      verifier.setExecutor(trackingExecutor);
      verifier.registerScenario(scenario);

      const comparison = await verifier.compare('message-failure');

      // With learnings should succeed faster (on first try with learnings)
      expect(comparison.baseline.totalAttempts).toBeGreaterThanOrEqual(3);
      expect(comparison.enhanced.totalAttempts).toBe(1);
      expect(comparison.improvement.attemptsSaved).toBeGreaterThan(0);
      expect(comparison.improvement.learningsHelped).toBe(true);
    });

    it('should detect when learnings enable success', async () => {
      let hasLearnings = false;

      const scenario: ReplayScenario = {
        id: 'learnings-required',
        name: 'Learnings Required Scenario',
        description: 'Can only succeed with learnings',
        diagnosis: {
          patternId: 'PAT-002',
          summary: 'Complex failure',
          rootCause: {
            category: 'code',
            description: 'Missing edge case handling',
            confidence: 0.8,
          },
          evidence: [],
          suggestedFixes: [],
          isKnownPattern: false,
          previousOccurrences: 0,
          validationResult: {
            success: false,
            resourceSid: 'CA123',
            resourceType: 'call',
            primaryStatus: 'failed',
            checks: {},
            errors: ['Edge case not handled'],
            warnings: [],
            duration: 100,
          },
          timestamp: new Date(),
        },
        capturedLearnings: ['Handle edge case X by checking Y first'],
        resolution: 'Added edge case handling',
        validateSuccess: async () => hasLearnings,
        setupFailure: async () => {
          hasLearnings = false;
        },
      };

      const trackingExecutor: FixExecutor = {
        attemptFix: async (diagnosis, learnings) => {
          hasLearnings = !!learnings && learnings.length > 0;
          return ['Applied fix'];
        },
      };

      verifier.setExecutor(trackingExecutor);
      verifier.registerScenario(scenario);

      const comparison = await verifier.compare('learnings-required');

      expect(comparison.baseline.success).toBe(false);
      expect(comparison.enhanced.success).toBe(true);
      expect(comparison.improvement.learningsEnabledSuccess).toBe(true);
    });

    it('should produce verification summary', async () => {
      // Register multiple scenarios with different outcomes
      const scenarios = [
        { id: 'improved', succeedsWithLearnings: true, baselineAttempts: 3 },
        { id: 'same', succeedsWithLearnings: true, baselineAttempts: 1 },
      ];

      for (const s of scenarios) {
        let attempts = 0;
        let hasLearnings = false;

        verifier.registerScenario({
          id: s.id,
          name: `Scenario ${s.id}`,
          description: 'Test scenario',
          diagnosis: {
            patternId: `PAT-${s.id}`,
            summary: 'Test',
            rootCause: { category: 'code', description: 'Test', confidence: 0.8 },
            evidence: [],
            suggestedFixes: [],
            isKnownPattern: false,
            previousOccurrences: 0,
            validationResult: {
              success: false,
              resourceSid: 'X123',
              resourceType: 'message',
              primaryStatus: 'failed',
              checks: {},
              errors: [],
              warnings: [],
              duration: 100,
            },
            timestamp: new Date(),
          },
          capturedLearnings: ['Learning'],
          resolution: 'Fixed',
          validateSuccess: async () => {
            attempts++;
            return hasLearnings || attempts >= s.baselineAttempts;
          },
          setupFailure: async () => {
            attempts = 0;
          },
        });
      }

      const trackingExecutor: FixExecutor = {
        attemptFix: async (diagnosis, learnings) => {
          // Update hasLearnings for the scenario being tested
          return [`Applied fix with learnings: ${!!learnings}`];
        },
      };

      verifier.setExecutor(trackingExecutor);

      const summary = await verifier.verifyAll();

      expect(summary.totalScenarios).toBe(2);
      expect(summary.successRateWithLearnings).toBe(1); // Both succeed with learnings
    });
  });

  describe('Full Autonomous Cycle Integration', () => {
    it('should execute complete diagnose-fix-learn cycle', async () => {
      // Set up all components
      const validator = new MockDeepValidator();
      const poller = createWorkPoller();
      const collector = createProcessMetricsCollector();

      poller.registerValidator(validator);

      // Step 1: Validation failure triggers work discovery
      const discoveredPromise = new Promise<DiscoveredWork>((resolve) => {
        poller.on('work-discovered', resolve);
      });

      validator.setFailureMode(true, 1);
      await validator.validateMessage('SM-TEST-001');

      const work = await discoveredPromise;
      expect(work).toBeDefined();
      expect(work.source).toBe('validation-failure');

      // Step 2: Start metrics tracking
      collector.startCycle(work);

      // Step 3: Simulate fix attempts with learnings
      collector.recordFixAttempt(work.id);
      collector.recordLearningCapture(work.id, true);

      // Step 4: Complete the cycle
      const metrics = collector.completeCycle(work.id, 'Applied E.164 formatting', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
        learningsPromoted: 1,
      });

      // Step 5: Mark work as complete
      poller.completeWork(work, 'Fixed');

      // Verify full cycle completed
      expect(metrics.quality.firstFixWorked).toBe(true);
      expect(metrics.learning.novelPatternsDiscovered).toBe(1);
      expect(work.status).toBe('completed');

      // Cleanup
      poller.unregisterValidator(validator);
      poller.stop();
    });

    it('should handle retry scenarios with escalation', async () => {
      const validator = new MockDeepValidator();
      const poller = createWorkPoller();
      const collector = createProcessMetricsCollector();

      poller.registerValidator(validator);

      const events: string[] = [];
      poller.on('work-discovered', () => events.push('discovered'));
      poller.on('work-escalated', () => events.push('escalated'));

      // Trigger failure
      validator.setFailureMode(true, 1);
      await validator.validateMessage('SM-COMPLEX-001');

      const work = poller.getNextWork()!;
      collector.startCycle(work);

      // Simulate multiple failed attempts
      collector.recordFixAttempt(work.id);
      collector.recordFixAttempt(work.id);
      collector.recordFixAttempt(work.id);

      // Escalate after too many attempts
      poller.escalateWork(work, 'Requires human review after 3 failed attempts');

      // Complete metrics with failure
      const metrics = collector.completeCycle(work.id, 'Escalated to human', {
        diagnosisAccurate: false,
        rootCauseMatched: false,
        workflowUsed: 'investigation',
      });

      expect(metrics.timing.fixAttempts).toBe(3);
      expect(metrics.quality.firstFixWorked).toBe(false);
      expect(work.status).toBe('escalated');
      expect(events).toContain('escalated');

      // Cleanup
      poller.unregisterValidator(validator);
      poller.stop();
    });
  });
});
