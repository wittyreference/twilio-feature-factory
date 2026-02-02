// ABOUTME: Tests for process metrics collector.
// ABOUTME: Verifies timing, quality, and learning metrics tracking.

import {
  ProcessMetricsCollector,
  createProcessMetricsCollector,
  type ProcessMetrics,
} from '../../src/metrics/process-metrics';
import type { DiscoveredWork, Diagnosis } from '../../src/discovery/work-discovery';

describe('ProcessMetricsCollector', () => {
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

  const createMockWork = (diagnosis?: Diagnosis): DiscoveredWork => ({
    id: `work-${Date.now()}`,
    discoveredAt: new Date(),
    source: 'validation-failure',
    priority: 'high',
    tier: 2,
    suggestedWorkflow: 'bug-fix',
    summary: 'Test work',
    description: 'Test work description',
    diagnosis: diagnosis ?? createMockDiagnosis(),
    resourceSids: ['SM123'],
    tags: ['code', 'bug-fix'],
    status: 'pending',
  });

  describe('constructor', () => {
    it('creates collector with default config', () => {
      const collector = createProcessMetricsCollector();
      expect(collector).toBeInstanceOf(ProcessMetricsCollector);
      expect(collector.getCompletedMetrics()).toHaveLength(0);
    });

    it('creates collector with custom config', () => {
      const collector = createProcessMetricsCollector({
        maxStoredCycles: 500,
        verbose: true,
      });
      expect(collector).toBeInstanceOf(ProcessMetricsCollector);
    });
  });

  describe('startCycle', () => {
    it('starts tracking a new cycle', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);

      const inProgress = collector.getInProgressCycles();
      expect(inProgress).toHaveLength(1);
      expect(inProgress[0].workId).toBe(work.id);
    });

    it('throws if work has no diagnosis', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();
      delete work.diagnosis;

      expect(() => collector.startCycle(work)).toThrow('Cannot start cycle without diagnosis');
    });

    it('emits cycle-started event', (done) => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.on('cycle-started', (workId, diagnosis) => {
        expect(workId).toBe(work.id);
        expect(diagnosis.patternId).toBe(work.diagnosis!.patternId);
        done();
      });

      collector.startCycle(work);
    });
  });

  describe('recordFixAttempt', () => {
    it('increments fix attempts', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      collector.recordFixAttempt(work.id);
      collector.recordFixAttempt(work.id);

      const inProgress = collector.getInProgressCycles();
      expect(inProgress[0].fixAttempts).toBe(2);
    });

    it('throws if cycle not found', () => {
      const collector = createProcessMetricsCollector();
      expect(() => collector.recordFixAttempt('unknown')).toThrow('No in-progress cycle found');
    });

    it('emits fix-attempted event', (done) => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);

      collector.on('fix-attempted', (workId, attempt) => {
        expect(workId).toBe(work.id);
        expect(attempt).toBe(1);
        done();
      });

      collector.recordFixAttempt(work.id);
    });
  });

  describe('recordLearningCapture', () => {
    it('records novel learning', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      collector.recordLearningCapture(work.id, true);

      // Complete to check the metrics
      const metrics = collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      expect(metrics.learning.learningsCaptured).toBe(1);
      expect(metrics.learning.novelPatternsDiscovered).toBe(1);
    });

    it('records non-novel learning', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      collector.recordLearningCapture(work.id, false);

      const metrics = collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      expect(metrics.learning.learningsCaptured).toBe(1);
      expect(metrics.learning.novelPatternsDiscovered).toBe(0);
    });

    it('emits learning-captured event', (done) => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);

      collector.on('learning-captured', (workId, isNovel) => {
        expect(workId).toBe(work.id);
        expect(isNovel).toBe(true);
        done();
      });

      collector.recordLearningCapture(work.id, true);
    });
  });

  describe('completeCycle', () => {
    it('completes a cycle and returns metrics', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      collector.recordFixAttempt(work.id);

      const metrics = collector.completeCycle(work.id, 'Fixed the issue', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
        learningsPromoted: 1,
      });

      expect(metrics.workId).toBe(work.id);
      expect(metrics.resolution).toBe('Fixed the issue');
      expect(metrics.quality.diagnosisAccurate).toBe(true);
      expect(metrics.quality.firstFixWorked).toBe(true);
      expect(metrics.timing.fixAttempts).toBe(1);
      expect(metrics.learning.learningsPromoted).toBe(1);
    });

    it('tracks first fix worked correctly', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      collector.recordFixAttempt(work.id);
      collector.recordFixAttempt(work.id);

      const metrics = collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      expect(metrics.quality.firstFixWorked).toBe(false);
      expect(metrics.timing.fixAttempts).toBe(2);
    });

    it('removes cycle from in-progress', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      expect(collector.getInProgressCycles()).toHaveLength(0);
    });

    it('adds to completed metrics', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      expect(collector.getCompletedMetrics()).toHaveLength(1);
    });

    it('emits cycle-completed event', (done) => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);

      collector.on('cycle-completed', (metrics) => {
        expect(metrics.workId).toBe(work.id);
        done();
      });

      collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });
    });

    it('respects maxStoredCycles limit', () => {
      const collector = createProcessMetricsCollector({ maxStoredCycles: 3 });

      for (let i = 0; i < 5; i++) {
        const work = createMockWork(createMockDiagnosis({ patternId: `PAT-${i}` }));
        work.id = `work-${i}`;
        collector.startCycle(work);
        collector.completeCycle(work.id, `Fixed ${i}`, {
          diagnosisAccurate: true,
          rootCauseMatched: true,
          workflowUsed: 'bug-fix',
        });
      }

      const completed = collector.getCompletedMetrics();
      expect(completed).toHaveLength(3);
      // Should keep the most recent 3
      expect(completed[0].workId).toBe('work-2');
      expect(completed[2].workId).toBe('work-4');
    });
  });

  describe('cancelCycle', () => {
    it('removes cycle from in-progress', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      expect(collector.getInProgressCycles()).toHaveLength(1);

      collector.cancelCycle(work.id);
      expect(collector.getInProgressCycles()).toHaveLength(0);
    });
  });

  describe('getMetricsInRange', () => {
    it('returns metrics within time range', async () => {
      const collector = createProcessMetricsCollector();

      // Create a few cycles
      for (let i = 0; i < 3; i++) {
        const work = createMockWork(createMockDiagnosis({ patternId: `PAT-${i}` }));
        work.id = `work-${i}`;
        collector.startCycle(work);
        collector.completeCycle(work.id, 'Fixed', {
          diagnosisAccurate: true,
          rootCauseMatched: true,
          workflowUsed: 'bug-fix',
        });
      }

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const oneHourFromNow = new Date(now.getTime() + 3600000);

      const metrics = collector.getMetricsInRange(oneHourAgo, oneHourFromNow);
      expect(metrics).toHaveLength(3);

      // Range in the past should return nothing
      const pastRange = collector.getMetricsInRange(
        new Date(now.getTime() - 7200000),
        new Date(now.getTime() - 3600000)
      );
      expect(pastRange).toHaveLength(0);
    });
  });

  describe('computeAggregates', () => {
    it('returns empty aggregates for no data', () => {
      const collector = createProcessMetricsCollector();
      const aggregates = collector.computeAggregates();

      expect(aggregates.totalCycles).toBe(0);
      expect(aggregates.averageTiming.totalCycleTime).toBe(0);
      expect(aggregates.qualityRates.diagnosisAccuracyRate).toBe(0);
    });

    it('computes correct averages and rates', () => {
      const collector = createProcessMetricsCollector();

      // Create cycles with varying outcomes
      const scenarios = [
        { diagnosisAccurate: true, firstFix: true, category: 'code' },
        { diagnosisAccurate: true, firstFix: false, category: 'code' },
        { diagnosisAccurate: false, firstFix: true, category: 'configuration' },
        { diagnosisAccurate: true, firstFix: true, category: 'timing' },
      ];

      for (let i = 0; i < scenarios.length; i++) {
        const diagnosis = createMockDiagnosis({
          patternId: `PAT-${i}`,
          rootCause: {
            category: scenarios[i].category as 'code' | 'configuration' | 'timing',
            description: 'Test',
            confidence: 0.8,
          },
        });
        const work = createMockWork(diagnosis);
        work.id = `work-${i}`;

        collector.startCycle(work);
        collector.recordFixAttempt(work.id);
        if (!scenarios[i].firstFix) {
          collector.recordFixAttempt(work.id);
        }
        collector.completeCycle(work.id, 'Fixed', {
          diagnosisAccurate: scenarios[i].diagnosisAccurate,
          rootCauseMatched: true,
          workflowUsed: 'bug-fix',
        });
      }

      const aggregates = collector.computeAggregates();

      expect(aggregates.totalCycles).toBe(4);
      expect(aggregates.qualityRates.diagnosisAccuracyRate).toBe(0.75); // 3/4
      expect(aggregates.qualityRates.firstFixSuccessRate).toBe(0.75); // 3/4
      expect(aggregates.byCategory['code'].count).toBe(2);
      expect(aggregates.byCategory['configuration'].count).toBe(1);
      expect(aggregates.byCategory['timing'].count).toBe(1);
    });

    it('computes category-specific metrics', () => {
      const collector = createProcessMetricsCollector();

      // All code category cycles
      for (let i = 0; i < 3; i++) {
        const diagnosis = createMockDiagnosis({
          patternId: `PAT-${i}`,
          rootCause: { category: 'code', description: 'Test', confidence: 0.9 },
        });
        const work = createMockWork(diagnosis);
        work.id = `work-${i}`;

        collector.startCycle(work);
        collector.recordFixAttempt(work.id);
        collector.completeCycle(work.id, 'Fixed', {
          diagnosisAccurate: true,
          rootCauseMatched: true,
          workflowUsed: 'bug-fix',
        });
      }

      const aggregates = collector.computeAggregates();

      expect(aggregates.byCategory['code']).toBeDefined();
      expect(aggregates.byCategory['code'].count).toBe(3);
      expect(aggregates.byCategory['code'].firstFixSuccessRate).toBe(1);
      expect(aggregates.byCategory['code'].avgConfidence).toBe(0.9);
    });
  });

  describe('clear', () => {
    it('clears all metrics', () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);
      collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      // Start another cycle
      const work2 = createMockWork(createMockDiagnosis({ patternId: 'PAT-2' }));
      work2.id = 'work-2';
      collector.startCycle(work2);

      expect(collector.getCompletedMetrics()).toHaveLength(1);
      expect(collector.getInProgressCycles()).toHaveLength(1);

      collector.clear();

      expect(collector.getCompletedMetrics()).toHaveLength(0);
      expect(collector.getInProgressCycles()).toHaveLength(0);
    });
  });

  describe('timing calculations', () => {
    it('calculates timing metrics correctly', async () => {
      const collector = createProcessMetricsCollector();
      const work = createMockWork();

      collector.startCycle(work);

      // Simulate some delay
      await new Promise((r) => setTimeout(r, 50));

      collector.recordFixAttempt(work.id);

      await new Promise((r) => setTimeout(r, 50));

      const metrics = collector.completeCycle(work.id, 'Fixed', {
        diagnosisAccurate: true,
        rootCauseMatched: true,
        workflowUsed: 'bug-fix',
      });

      expect(metrics.timing.totalCycleTime).toBeGreaterThanOrEqual(100);
      expect(metrics.timing.timeToFix).toBeGreaterThanOrEqual(50);
    });
  });
});
