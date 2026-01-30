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
} from './deep-validator.js';
