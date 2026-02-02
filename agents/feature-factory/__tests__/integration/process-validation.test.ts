// ABOUTME: Integration tests for process validation infrastructure.
// ABOUTME: Tests DiagnosticBridge, LearningCapture, and PatternTracker integration.

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  WorkPoller,
  createWorkPoller,
  type DiscoveredWork,
  type Diagnosis,
  determinePriority,
  determineAutomationTier,
  suggestWorkflow,
} from '../../src/discovery/index.js';
import {
  ProcessMetricsCollector,
  createProcessMetricsCollector,
  type AggregateMetrics,
} from '../../src/metrics/index.js';
import {
  ReplayVerifier,
  createReplayVerifier,
  type ReplayScenario,
  type VerificationSummary,
} from '../../src/verification/index.js';

/**
 * Create a diagnosis with specified characteristics for testing.
 */
function createTestDiagnosis(options: {
  category: Diagnosis['rootCause']['category'];
  confidence: number;
  automated: boolean;
  isKnownPattern?: boolean;
}): Diagnosis {
  return {
    patternId: `PAT-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    summary: `Test ${options.category} failure`,
    rootCause: {
      category: options.category,
      description: `A ${options.category} issue was detected`,
      confidence: options.confidence,
    },
    evidence: [
      {
        source: 'test',
        data: { errorCode: 12345 },
        relevance: 'primary',
      },
    ],
    suggestedFixes: [
      {
        description: `Fix the ${options.category} issue`,
        actionType: options.category === 'configuration' ? 'config' : 'code',
        confidence: options.confidence,
        automated: options.automated,
      },
    ],
    isKnownPattern: options.isKnownPattern ?? false,
    previousOccurrences: options.isKnownPattern ? 3 : 0,
    validationResult: {
      success: false,
      resourceSid: `XX${Date.now()}`,
      resourceType: 'message',
      primaryStatus: 'failed',
      checks: {
        resourceStatus: { passed: false, message: 'Failed' },
        debuggerAlerts: { passed: true, message: 'No alerts' },
      },
      errors: [`${options.category} error occurred`],
      warnings: [],
      duration: 100,
    },
    timestamp: new Date(),
  };
}

describe('Process Validation Integration', () => {
  describe('Work Discovery Classification', () => {
    it('should classify configuration errors as critical priority', () => {
      const diagnosis = createTestDiagnosis({
        category: 'configuration',
        confidence: 0.9,
        automated: true,
      });

      expect(determinePriority(diagnosis)).toBe('critical');
      expect(determineAutomationTier(diagnosis)).toBe(1);
      expect(suggestWorkflow(diagnosis)).toBe('bug-fix');
    });

    it('should classify code errors as high priority', () => {
      const diagnosis = createTestDiagnosis({
        category: 'code',
        confidence: 0.8,
        automated: true,
      });

      expect(determinePriority(diagnosis)).toBe('high');
      expect(determineAutomationTier(diagnosis)).toBe(2);
      expect(suggestWorkflow(diagnosis)).toBe('bug-fix');
    });

    it('should classify external errors as medium priority', () => {
      const diagnosis = createTestDiagnosis({
        category: 'external',
        confidence: 0.7,
        automated: false,
      });

      expect(determinePriority(diagnosis)).toBe('medium');
      // Has suggested fixes with confidence > 0.5, so tier 3 not tier 4
      expect(determineAutomationTier(diagnosis)).toBe(3);
      expect(suggestWorkflow(diagnosis)).toBe('manual-review');
    });

    it('should classify external errors without fixes as tier 4', () => {
      // Create diagnosis with low confidence (no suggested fixes pass threshold)
      const diagnosis: Diagnosis = {
        patternId: 'PAT-external-001',
        summary: 'External service failure',
        rootCause: {
          category: 'external',
          description: 'Third-party API unavailable',
          confidence: 0.4, // Low confidence
        },
        evidence: [],
        suggestedFixes: [], // No fixes
        isKnownPattern: false,
        previousOccurrences: 0,
        validationResult: {
          success: false,
          resourceSid: 'XX123',
          resourceType: 'message',
          primaryStatus: 'failed',
          checks: {},
          errors: ['External API down'],
          warnings: [],
          duration: 100,
        },
        timestamp: new Date(),
      };

      expect(determinePriority(diagnosis)).toBe('medium');
      expect(determineAutomationTier(diagnosis)).toBe(4);
      expect(suggestWorkflow(diagnosis)).toBe('manual-review');
    });

    it('should classify timing errors as medium priority', () => {
      const diagnosis = createTestDiagnosis({
        category: 'timing',
        confidence: 0.6,
        automated: false,
      });

      expect(determinePriority(diagnosis)).toBe('medium');
      expect(determineAutomationTier(diagnosis)).toBe(3);
      expect(suggestWorkflow(diagnosis)).toBe('investigation');
    });

    it('should classify unknown errors as low priority', () => {
      const diagnosis = createTestDiagnosis({
        category: 'unknown',
        confidence: 0.3,
        automated: false,
      });

      expect(determinePriority(diagnosis)).toBe('low');
      expect(determineAutomationTier(diagnosis)).toBe(4);
      expect(suggestWorkflow(diagnosis)).toBe('investigation');
    });
  });

  describe('Metrics Aggregation by Category', () => {
    let collector: ProcessMetricsCollector;

    beforeEach(() => {
      collector = createProcessMetricsCollector();
    });

    it('should aggregate metrics by root cause category', () => {
      // Create work items for different categories
      const categories: Diagnosis['rootCause']['category'][] = [
        'configuration',
        'configuration',
        'code',
        'timing',
      ];

      for (let i = 0; i < categories.length; i++) {
        const diagnosis = createTestDiagnosis({
          category: categories[i],
          confidence: 0.8,
          automated: true,
        });

        const work: DiscoveredWork = {
          id: `work-${i}`,
          discoveredAt: new Date(),
          source: 'validation-failure',
          priority: determinePriority(diagnosis),
          tier: determineAutomationTier(diagnosis),
          suggestedWorkflow: suggestWorkflow(diagnosis),
          summary: diagnosis.summary,
          description: 'Test work',
          diagnosis,
          status: 'pending',
        };

        collector.startCycle(work);
        collector.recordFixAttempt(work.id);
        collector.completeCycle(work.id, 'Fixed', {
          diagnosisAccurate: true,
          rootCauseMatched: true,
          workflowUsed: 'bug-fix',
        });
      }

      const aggregates = collector.computeAggregates();

      expect(aggregates.byCategory['configuration'].count).toBe(2);
      expect(aggregates.byCategory['code'].count).toBe(1);
      expect(aggregates.byCategory['timing'].count).toBe(1);
    });

    it('should track learning metrics correctly', () => {
      const diagnosis = createTestDiagnosis({
        category: 'code',
        confidence: 0.9,
        automated: true,
      });

      const work: DiscoveredWork = {
        id: 'work-learning-test',
        discoveredAt: new Date(),
        source: 'validation-failure',
        priority: 'high',
        tier: 2,
        suggestedWorkflow: 'bug-fix',
        summary: 'Test',
        description: 'Test',
        diagnosis,
        status: 'pending',
      };

      collector.startCycle(work);
      collector.recordLearningCapture(work.id, true); // Novel
      collector.recordLearningCapture(work.id, false); // Known
      collector.recordLearningCapture(work.id, true); // Novel

      const metrics = collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
        learningsPromoted: 2,
      });

      expect(metrics.learning.learningsCaptured).toBe(3);
      expect(metrics.learning.novelPatternsDiscovered).toBe(2);
      expect(metrics.learning.learningsPromoted).toBe(2);
    });
  });

  describe('Replay Verification with Metrics', () => {
    let verifier: ReplayVerifier;
    let collector: ProcessMetricsCollector;

    beforeEach(() => {
      verifier = createReplayVerifier({
        maxAttempts: 5,
        attemptDelayMs: 10,
      });
      collector = createProcessMetricsCollector();
    });

    it('should integrate replay results with process metrics', async () => {
      let attemptsWithoutLearnings = 0;
      let attemptsWithLearnings = 0;
      let hasLearnings = false;

      const scenario: ReplayScenario = {
        id: 'metrics-integration',
        name: 'Metrics Integration Test',
        description: 'Tests replay with metrics',
        diagnosis: createTestDiagnosis({
          category: 'code',
          confidence: 0.85,
          automated: true,
        }),
        capturedLearnings: ['Key insight for fixing'],
        resolution: 'Applied fix',
        validateSuccess: async () => {
          if (hasLearnings) {
            attemptsWithLearnings++;
            return attemptsWithLearnings >= 1;
          } else {
            attemptsWithoutLearnings++;
            return attemptsWithoutLearnings >= 3;
          }
        },
        setupFailure: async () => {
          attemptsWithoutLearnings = 0;
          attemptsWithLearnings = 0;
        },
      };

      verifier.setExecutor({
        attemptFix: async (diagnosis, learnings) => {
          hasLearnings = !!learnings && learnings.length > 0;
          return ['Applied fix'];
        },
      });

      verifier.registerScenario(scenario);

      // Run comparison
      const comparison = await verifier.compare('metrics-integration');

      // Track in metrics
      const work: DiscoveredWork = {
        id: 'replay-work',
        discoveredAt: new Date(),
        source: 'validation-failure',
        priority: 'high',
        tier: 2,
        suggestedWorkflow: 'bug-fix',
        summary: 'Test',
        description: 'Test',
        diagnosis: scenario.diagnosis,
        status: 'pending',
      };

      collector.startCycle(work);

      // Record attempts based on enhanced (with learnings) result
      for (let i = 0; i < comparison.enhanced.totalAttempts; i++) {
        collector.recordFixAttempt(work.id);
      }

      const metrics = collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      // Verify integration
      expect(comparison.improvement.learningsHelped).toBe(true);
      expect(metrics.timing.fixAttempts).toBe(comparison.enhanced.totalAttempts);
      expect(metrics.quality.firstFixWorked).toBe(comparison.enhanced.totalAttempts === 1);
    });
  });

  describe('Known Pattern Recognition', () => {
    it('should recognize and fast-track known patterns', () => {
      const knownDiagnosis = createTestDiagnosis({
        category: 'configuration',
        confidence: 0.95,
        automated: true,
        isKnownPattern: true,
      });

      // Known patterns should get priority
      expect(knownDiagnosis.isKnownPattern).toBe(true);
      expect(knownDiagnosis.previousOccurrences).toBeGreaterThan(0);

      // Should still be high confidence, high automation
      expect(determinePriority(knownDiagnosis)).toBe('critical');
      expect(determineAutomationTier(knownDiagnosis)).toBe(1);
    });

    it('should track pattern occurrences in metrics', () => {
      const collector = createProcessMetricsCollector();

      // First occurrence (novel)
      const diagnosis1 = createTestDiagnosis({
        category: 'code',
        confidence: 0.8,
        automated: true,
        isKnownPattern: false,
      });

      const work1: DiscoveredWork = {
        id: 'work-1',
        discoveredAt: new Date(),
        source: 'validation-failure',
        priority: 'high',
        tier: 2,
        suggestedWorkflow: 'bug-fix',
        summary: 'First occurrence',
        description: 'Test',
        diagnosis: diagnosis1,
        status: 'pending',
      };

      collector.startCycle(work1);
      collector.recordLearningCapture(work1.id, true); // Novel
      collector.completeCycle(work1.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      // Second occurrence (known)
      const diagnosis2 = createTestDiagnosis({
        category: 'code',
        confidence: 0.9,
        automated: true,
        isKnownPattern: true,
      });

      const work2: DiscoveredWork = {
        id: 'work-2',
        discoveredAt: new Date(),
        source: 'validation-failure',
        priority: 'high',
        tier: 2,
        suggestedWorkflow: 'bug-fix',
        summary: 'Second occurrence',
        description: 'Test',
        diagnosis: diagnosis2,
        status: 'pending',
      };

      collector.startCycle(work2);
      // Not novel since pattern is known
      collector.completeCycle(work2.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      const aggregates = collector.computeAggregates();

      expect(aggregates.totalCycles).toBe(2);
      expect(aggregates.learningTotals.totalNovelPatterns).toBe(1);
    });
  });

  describe('End-to-End Validation Pipeline', () => {
    it('should execute full validation pipeline with all components', async () => {
      // Setup all components
      const mockValidator = new EventEmitter();
      const poller = createWorkPoller();
      const collector = createProcessMetricsCollector();
      const verifier = createReplayVerifier({ maxAttempts: 3, attemptDelayMs: 10 });

      poller.registerValidator(mockValidator as any);

      // Track all events
      const events: string[] = [];
      poller.on('work-discovered', () => events.push('work-discovered'));
      poller.on('work-started', () => events.push('work-started'));
      poller.on('work-completed', () => events.push('work-completed'));
      collector.on('cycle-started', () => events.push('cycle-started'));
      collector.on('cycle-completed', () => events.push('cycle-completed'));

      // Step 1: Validation failure emits event
      const diagnosis = createTestDiagnosis({
        category: 'configuration',
        confidence: 0.9,
        automated: true,
      });

      const validationEvent = {
        type: 'message',
        result: {
          success: false,
          resourceSid: 'SM123',
          resourceType: 'message',
          primaryStatus: 'failed',
          checks: {},
          errors: ['Failed'],
          warnings: [],
          duration: 100,
        },
        diagnosis,
        timestamp: new Date(),
      };

      mockValidator.emit('validation-failure', validationEvent);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Step 2: Work should be discovered
      expect(events).toContain('work-discovered');
      const work = poller.getNextWork()!;
      expect(work).toBeDefined();

      // Step 3: Start processing
      poller.startWork(work);
      collector.startCycle(work);

      // Step 4: Simulate fix
      collector.recordFixAttempt(work.id);
      collector.recordLearningCapture(work.id, true);

      // Step 5: Complete
      const metrics = collector.completeCycle(work.id, 'Fixed configuration', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
        learningsPromoted: 1,
      });
      poller.completeWork(work, 'Fixed');

      // Step 6: Verify replay can use learnings
      let hasLearnings = false;
      verifier.setExecutor({
        attemptFix: async (d, l) => {
          hasLearnings = !!l && l.length > 0;
          return ['Fixed'];
        },
      });

      verifier.registerScenario({
        id: 'replay-test',
        name: 'Replay Test',
        description: 'Test replay',
        diagnosis,
        capturedLearnings: ['Check config first'],
        resolution: 'Fixed',
        validateSuccess: async () => hasLearnings,
        setupFailure: async () => {
          hasLearnings = false;
        },
      });

      const comparison = await verifier.compare('replay-test');

      // Verify full pipeline
      expect(events).toContain('work-discovered');
      expect(events).toContain('work-started');
      expect(events).toContain('cycle-started');
      expect(events).toContain('cycle-completed');
      expect(events).toContain('work-completed');
      expect(metrics.quality.firstFixWorked).toBe(true);
      expect(metrics.learning.novelPatternsDiscovered).toBe(1);
      expect(comparison.enhanced.success).toBe(true);
      expect(comparison.improvement.learningsEnabledSuccess).toBe(true);

      // Cleanup
      poller.unregisterValidator(mockValidator as any);
      poller.stop();
    });
  });

  describe('Quality Metrics Analysis', () => {
    it('should track and analyze fix quality over time', () => {
      const collector = createProcessMetricsCollector();

      // Simulate multiple fix cycles with varying quality
      const scenarios = [
        { accurate: true, firstFix: true, category: 'configuration' as const },
        { accurate: true, firstFix: true, category: 'code' as const },
        { accurate: false, firstFix: false, category: 'timing' as const },
        { accurate: true, firstFix: false, category: 'configuration' as const },
        { accurate: true, firstFix: true, category: 'code' as const },
      ];

      for (let i = 0; i < scenarios.length; i++) {
        const s = scenarios[i];
        const diagnosis = createTestDiagnosis({
          category: s.category,
          confidence: s.accurate ? 0.9 : 0.4,
          automated: true,
        });

        const work: DiscoveredWork = {
          id: `quality-${i}`,
          discoveredAt: new Date(),
          source: 'validation-failure',
          priority: determinePriority(diagnosis),
          tier: determineAutomationTier(diagnosis),
          suggestedWorkflow: suggestWorkflow(diagnosis),
          summary: 'Test',
          description: 'Test',
          diagnosis,
          status: 'pending',
        };

        collector.startCycle(work);
        collector.recordFixAttempt(work.id);
        if (!s.firstFix) {
          collector.recordFixAttempt(work.id);
        }

        collector.completeCycle(work.id, 'Fixed', {
          diagnosisAccurate: s.accurate,
          rootCauseMatched: s.accurate,
          workflowUsed: 'bug-fix',
        });
      }

      const aggregates = collector.computeAggregates();

      // Quality analysis
      expect(aggregates.totalCycles).toBe(5);
      expect(aggregates.qualityRates.diagnosisAccuracyRate).toBe(0.8); // 4/5
      expect(aggregates.qualityRates.firstFixSuccessRate).toBe(0.6); // 3/5
      expect(aggregates.averageTiming.avgFixAttempts).toBeCloseTo(1.4, 1); // (1+1+2+2+1)/5

      // Category analysis
      expect(aggregates.byCategory['configuration'].count).toBe(2);
      expect(aggregates.byCategory['code'].count).toBe(2);
      expect(aggregates.byCategory['timing'].count).toBe(1);
    });
  });
});
