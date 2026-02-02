// ABOUTME: Metrics collector for the diagnose → fix → learn cycle.
// ABOUTME: Tracks timing, quality, and learning metrics for process validation.

import { EventEmitter } from 'events';
import type { Diagnosis } from '../discovery/work-discovery.js';
import type { DiscoveredWork } from '../discovery/work-discovery.js';

/**
 * Timing metrics for the fix cycle.
 */
export interface TimingMetrics {
  /** Time from failure detection to diagnosis (ms) */
  timeToDiagnosis: number;

  /** Time from diagnosis to fix applied (ms) */
  timeToFix: number;

  /** Time from fix applied to validation passing (ms) */
  timeToValidation: number;

  /** Total time from failure to success (ms) */
  totalCycleTime: number;

  /** Number of fix attempts before success */
  fixAttempts: number;
}

/**
 * Quality metrics for the fix.
 */
export interface QualityMetrics {
  /** Whether the initial diagnosis was accurate */
  diagnosisAccurate: boolean;

  /** Whether the first fix attempt worked */
  firstFixWorked: boolean;

  /** Root cause category matched the actual fix type */
  rootCauseMatched: boolean;

  /** Confidence of the diagnosis that led to success */
  successfulDiagnosisConfidence: number;
}

/**
 * Learning metrics captured during the cycle.
 */
export interface LearningMetrics {
  /** Number of learnings captured to learnings.md */
  learningsCaptured: number;

  /** Number of novel patterns discovered (not previously seen) */
  novelPatternsDiscovered: number;

  /** Number of patterns that matched known patterns */
  knownPatternsMatched: number;

  /** Number of learnings promoted to permanent docs */
  learningsPromoted: number;
}

/**
 * Complete process metrics for a single fix cycle.
 */
export interface ProcessMetrics {
  /** Unique identifier for this metrics record */
  id: string;

  /** Work item being tracked */
  workId: string;

  /** Resource SID being fixed */
  resourceSid: string;

  /** Type of resource */
  resourceType: string;

  /** Timing metrics */
  timing: TimingMetrics;

  /** Quality metrics */
  quality: QualityMetrics;

  /** Learning metrics */
  learning: LearningMetrics;

  /** Original diagnosis */
  diagnosis: Diagnosis;

  /** Final resolution description */
  resolution: string;

  /** Workflow that was used */
  workflowUsed: string;

  /** Start timestamp */
  startedAt: Date;

  /** Completion timestamp */
  completedAt: Date;
}

/**
 * Aggregate metrics across multiple fix cycles.
 */
export interface AggregateMetrics {
  /** Total cycles completed */
  totalCycles: number;

  /** Average timing metrics */
  averageTiming: Omit<TimingMetrics, 'fixAttempts'> & { avgFixAttempts: number };

  /** Quality rates (0-1) */
  qualityRates: {
    diagnosisAccuracyRate: number;
    firstFixSuccessRate: number;
    rootCauseMatchRate: number;
    avgSuccessfulConfidence: number;
  };

  /** Learning totals */
  learningTotals: {
    totalLearningsCaptured: number;
    totalNovelPatterns: number;
    totalKnownPatternsMatched: number;
    totalLearningsPromoted: number;
  };

  /** Breakdown by root cause category */
  byCategory: Record<string, CategoryMetrics>;

  /** Time range of data */
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * Metrics for a specific root cause category.
 */
export interface CategoryMetrics {
  count: number;
  avgCycleTime: number;
  firstFixSuccessRate: number;
  avgConfidence: number;
}

/**
 * In-progress cycle being tracked.
 */
interface CycleInProgress {
  workId: string;
  resourceSid: string;
  resourceType: string;
  diagnosis: Diagnosis;
  startedAt: Date;
  diagnosedAt?: Date;
  fixStartedAt?: Date;
  fixAttempts: number;
  learningsCaptured: number;
  novelPatternsDiscovered: number;
  knownPatternsMatched: number;
}

/**
 * Events emitted by ProcessMetricsCollector.
 */
export interface ProcessMetricsEvents {
  'cycle-started': [workId: string, diagnosis: Diagnosis];
  'cycle-completed': [metrics: ProcessMetrics];
  'fix-attempted': [workId: string, attempt: number];
  'learning-captured': [workId: string, isNovel: boolean];
}

/**
 * Configuration for ProcessMetricsCollector.
 */
export interface ProcessMetricsConfig {
  /** Maximum cycles to store in memory. Default: 1000 */
  maxStoredCycles?: number;

  /** Enable detailed logging. Default: false */
  verbose?: boolean;
}

/**
 * Collects and aggregates process metrics for the diagnose → fix → learn cycle.
 */
export class ProcessMetricsCollector extends EventEmitter {
  private config: Required<ProcessMetricsConfig>;
  private completedCycles: ProcessMetrics[] = [];
  private inProgressCycles: Map<string, CycleInProgress> = new Map();

  constructor(config: ProcessMetricsConfig = {}) {
    super();
    this.config = {
      maxStoredCycles: config.maxStoredCycles ?? 1000,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Starts tracking a new fix cycle.
   */
  startCycle(work: DiscoveredWork): void {
    if (!work.diagnosis) {
      throw new Error('Cannot start cycle without diagnosis');
    }

    const cycle: CycleInProgress = {
      workId: work.id,
      resourceSid: work.diagnosis.validationResult.resourceSid,
      resourceType: work.diagnosis.validationResult.resourceType,
      diagnosis: work.diagnosis,
      startedAt: new Date(),
      diagnosedAt: work.diagnosis.timestamp,
      fixAttempts: 0,
      learningsCaptured: 0,
      novelPatternsDiscovered: 0,
      knownPatternsMatched: work.diagnosis.isKnownPattern ? 1 : 0,
    };

    this.inProgressCycles.set(work.id, cycle);
    this.emit('cycle-started', work.id, work.diagnosis);

    if (this.config.verbose) {
      console.log(`[ProcessMetrics] Started cycle for ${work.id}`);
    }
  }

  /**
   * Records a fix attempt for a cycle.
   */
  recordFixAttempt(workId: string): void {
    const cycle = this.inProgressCycles.get(workId);
    if (!cycle) {
      throw new Error(`No in-progress cycle found for ${workId}`);
    }

    if (!cycle.fixStartedAt) {
      cycle.fixStartedAt = new Date();
    }
    cycle.fixAttempts++;

    this.emit('fix-attempted', workId, cycle.fixAttempts);

    if (this.config.verbose) {
      console.log(`[ProcessMetrics] Fix attempt ${cycle.fixAttempts} for ${workId}`);
    }
  }

  /**
   * Records a learning capture during a cycle.
   */
  recordLearningCapture(workId: string, isNovel: boolean): void {
    const cycle = this.inProgressCycles.get(workId);
    if (!cycle) {
      throw new Error(`No in-progress cycle found for ${workId}`);
    }

    cycle.learningsCaptured++;
    if (isNovel) {
      cycle.novelPatternsDiscovered++;
    }

    this.emit('learning-captured', workId, isNovel);
  }

  /**
   * Completes a cycle and generates final metrics.
   */
  completeCycle(
    workId: string,
    resolution: string,
    options: {
      diagnosisAccurate: boolean;
      rootCauseMatched: boolean;
      workflowUsed: string;
      learningsPromoted?: number;
    }
  ): ProcessMetrics {
    const cycle = this.inProgressCycles.get(workId);
    if (!cycle) {
      throw new Error(`No in-progress cycle found for ${workId}`);
    }

    const completedAt = new Date();

    // Calculate timing metrics
    const timeToDiagnosis = cycle.diagnosedAt
      ? cycle.diagnosedAt.getTime() - cycle.startedAt.getTime()
      : 0;

    const timeToFix = cycle.fixStartedAt
      ? completedAt.getTime() - cycle.fixStartedAt.getTime()
      : completedAt.getTime() - cycle.startedAt.getTime();

    const timeToValidation = completedAt.getTime() - (cycle.fixStartedAt?.getTime() ?? cycle.startedAt.getTime());

    const metrics: ProcessMetrics = {
      id: `metrics-${workId}-${Date.now()}`,
      workId,
      resourceSid: cycle.resourceSid,
      resourceType: cycle.resourceType,
      timing: {
        timeToDiagnosis,
        timeToFix,
        timeToValidation,
        totalCycleTime: completedAt.getTime() - cycle.startedAt.getTime(),
        fixAttempts: cycle.fixAttempts,
      },
      quality: {
        diagnosisAccurate: options.diagnosisAccurate,
        firstFixWorked: cycle.fixAttempts === 1,
        rootCauseMatched: options.rootCauseMatched,
        successfulDiagnosisConfidence: cycle.diagnosis.rootCause.confidence,
      },
      learning: {
        learningsCaptured: cycle.learningsCaptured,
        novelPatternsDiscovered: cycle.novelPatternsDiscovered,
        knownPatternsMatched: cycle.knownPatternsMatched,
        learningsPromoted: options.learningsPromoted ?? 0,
      },
      diagnosis: cycle.diagnosis,
      resolution,
      workflowUsed: options.workflowUsed,
      startedAt: cycle.startedAt,
      completedAt,
    };

    // Store completed metrics
    this.completedCycles.push(metrics);

    // Trim if over limit
    if (this.completedCycles.length > this.config.maxStoredCycles) {
      this.completedCycles = this.completedCycles.slice(-this.config.maxStoredCycles);
    }

    // Remove from in-progress
    this.inProgressCycles.delete(workId);

    this.emit('cycle-completed', metrics);

    if (this.config.verbose) {
      console.log(`[ProcessMetrics] Completed cycle for ${workId} in ${metrics.timing.totalCycleTime}ms`);
    }

    return metrics;
  }

  /**
   * Cancels an in-progress cycle without completion.
   */
  cancelCycle(workId: string): void {
    this.inProgressCycles.delete(workId);
  }

  /**
   * Gets all completed metrics.
   */
  getCompletedMetrics(): ProcessMetrics[] {
    return [...this.completedCycles];
  }

  /**
   * Gets metrics for a specific time range.
   */
  getMetricsInRange(start: Date, end: Date): ProcessMetrics[] {
    return this.completedCycles.filter(
      (m) => m.completedAt >= start && m.completedAt <= end
    );
  }

  /**
   * Gets in-progress cycles.
   */
  getInProgressCycles(): Array<{ workId: string; startedAt: Date; fixAttempts: number }> {
    return Array.from(this.inProgressCycles.entries()).map(([workId, cycle]) => ({
      workId,
      startedAt: cycle.startedAt,
      fixAttempts: cycle.fixAttempts,
    }));
  }

  /**
   * Computes aggregate metrics from all completed cycles.
   */
  computeAggregates(metrics?: ProcessMetrics[]): AggregateMetrics {
    const data = metrics ?? this.completedCycles;

    if (data.length === 0) {
      return this.emptyAggregates();
    }

    // Timing aggregates
    const avgTimeToDiagnosis = this.average(data.map((m) => m.timing.timeToDiagnosis));
    const avgTimeToFix = this.average(data.map((m) => m.timing.timeToFix));
    const avgTimeToValidation = this.average(data.map((m) => m.timing.timeToValidation));
    const avgTotalCycleTime = this.average(data.map((m) => m.timing.totalCycleTime));
    const avgFixAttempts = this.average(data.map((m) => m.timing.fixAttempts));

    // Quality rates
    const diagnosisAccuracyRate = this.rate(data.map((m) => m.quality.diagnosisAccurate));
    const firstFixSuccessRate = this.rate(data.map((m) => m.quality.firstFixWorked));
    const rootCauseMatchRate = this.rate(data.map((m) => m.quality.rootCauseMatched));
    const avgSuccessfulConfidence = this.average(
      data.filter((m) => m.quality.diagnosisAccurate).map((m) => m.quality.successfulDiagnosisConfidence)
    );

    // Learning totals
    const totalLearningsCaptured = this.sum(data.map((m) => m.learning.learningsCaptured));
    const totalNovelPatterns = this.sum(data.map((m) => m.learning.novelPatternsDiscovered));
    const totalKnownPatternsMatched = this.sum(data.map((m) => m.learning.knownPatternsMatched));
    const totalLearningsPromoted = this.sum(data.map((m) => m.learning.learningsPromoted));

    // By category
    const byCategory: Record<string, CategoryMetrics> = {};
    for (const m of data) {
      const category = m.diagnosis.rootCause.category;
      if (!byCategory[category]) {
        byCategory[category] = {
          count: 0,
          avgCycleTime: 0,
          firstFixSuccessRate: 0,
          avgConfidence: 0,
        };
      }
      byCategory[category].count++;
    }

    // Calculate per-category averages
    for (const category of Object.keys(byCategory)) {
      const categoryData = data.filter((m) => m.diagnosis.rootCause.category === category);
      byCategory[category].avgCycleTime = this.average(categoryData.map((m) => m.timing.totalCycleTime));
      byCategory[category].firstFixSuccessRate = this.rate(categoryData.map((m) => m.quality.firstFixWorked));
      byCategory[category].avgConfidence = this.average(
        categoryData.map((m) => m.quality.successfulDiagnosisConfidence)
      );
    }

    // Time range
    const timestamps = data.map((m) => m.completedAt.getTime());
    const start = new Date(Math.min(...timestamps));
    const end = new Date(Math.max(...timestamps));

    return {
      totalCycles: data.length,
      averageTiming: {
        timeToDiagnosis: avgTimeToDiagnosis,
        timeToFix: avgTimeToFix,
        timeToValidation: avgTimeToValidation,
        totalCycleTime: avgTotalCycleTime,
        avgFixAttempts,
      },
      qualityRates: {
        diagnosisAccuracyRate,
        firstFixSuccessRate,
        rootCauseMatchRate,
        avgSuccessfulConfidence,
      },
      learningTotals: {
        totalLearningsCaptured,
        totalNovelPatterns,
        totalKnownPatternsMatched,
        totalLearningsPromoted,
      },
      byCategory,
      timeRange: { start, end },
    };
  }

  /**
   * Clears all stored metrics.
   */
  clear(): void {
    this.completedCycles = [];
    this.inProgressCycles.clear();
  }

  // Helper methods

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
  }

  private rate(values: boolean[]): number {
    if (values.length === 0) return 0;
    return values.filter((v) => v).length / values.length;
  }

  private emptyAggregates(): AggregateMetrics {
    return {
      totalCycles: 0,
      averageTiming: {
        timeToDiagnosis: 0,
        timeToFix: 0,
        timeToValidation: 0,
        totalCycleTime: 0,
        avgFixAttempts: 0,
      },
      qualityRates: {
        diagnosisAccuracyRate: 0,
        firstFixSuccessRate: 0,
        rootCauseMatchRate: 0,
        avgSuccessfulConfidence: 0,
      },
      learningTotals: {
        totalLearningsCaptured: 0,
        totalNovelPatterns: 0,
        totalKnownPatternsMatched: 0,
        totalLearningsPromoted: 0,
      },
      byCategory: {},
      timeRange: {
        start: new Date(),
        end: new Date(),
      },
    };
  }
}

/**
 * Creates a new ProcessMetricsCollector instance.
 */
export function createProcessMetricsCollector(config?: ProcessMetricsConfig): ProcessMetricsCollector {
  return new ProcessMetricsCollector(config);
}
