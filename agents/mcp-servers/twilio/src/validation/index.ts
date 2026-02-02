// ABOUTME: Export deep validation utilities for Twilio API operations.
// ABOUTME: Provides comprehensive validation beyond simple 200 OK responses.

export {
  DeepValidator,
  createDeepValidator,
  type ValidationResult,
  type ValidationOptions,
  type CheckResult,
  // New validation interfaces
  type DebuggerValidationOptions,
  type DebuggerValidationResult,
  type ServerlessLogsValidationOptions,
  type ServerlessLogsValidationResult,
  type RecordingValidationOptions,
  type RecordingValidationResult,
  type TranscriptValidationOptions,
  type TranscriptValidationResult,
  type LanguageOperatorValidationOptions,
  type LanguageOperatorValidationResult,
  // ConversationRelay and Prerequisite validation
  type ConversationRelayValidationOptions,
  type ConversationRelayValidationResult,
  type PrerequisiteCheck,
  type PrerequisiteValidationOptions,
  type PrerequisiteValidationResult,
  // Two-way conversation validation
  type TwoWayValidationOptions,
  type TwoWayValidationResult,
  // Event types for autonomous work discovery
  type ValidationEventType,
  type ValidationFailureEvent,
  type DeepValidatorEvents,
} from './deep-validator.js';

// DiagnosticBridge - Connects validation failures to learning capture
export {
  DiagnosticBridge,
  createDiagnosticBridge,
  type Diagnosis,
  type DiagnosticBridgeConfig,
  type RootCauseCategory,
  type FixActionType,
} from './diagnostic-bridge.js';

// LearningCaptureEngine - Auto-captures learnings from validation failures
export {
  LearningCaptureEngine,
  createLearningCaptureEngine,
  formatLearningEntry,
  formatLearningMarkdown,
  type LearningEntry,
  type LearningCaptureConfig,
} from './learning-capture.js';

// PatternTracker - Tracks recurring validation failure patterns
export {
  PatternTracker,
  createPatternTracker,
  type PatternHistory,
  type PatternDatabase,
  type PatternTrackerConfig,
} from './pattern-tracker.js';
