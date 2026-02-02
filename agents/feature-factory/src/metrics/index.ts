// ABOUTME: Export process metrics interfaces and collector.
// ABOUTME: Measures diagnose → fix → learn cycle performance.

export {
  type TimingMetrics,
  type QualityMetrics,
  type LearningMetrics,
  type ProcessMetrics,
  type AggregateMetrics,
  type CategoryMetrics,
  type ProcessMetricsConfig,
  type ProcessMetricsEvents,
  ProcessMetricsCollector,
  createProcessMetricsCollector,
} from './process-metrics.js';
