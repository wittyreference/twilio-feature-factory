// ABOUTME: Orchestrates running relevant DeepValidator methods based on products used.
// ABOUTME: Feeds all results to DiagnosticBridge, LearningCapture, and PatternTracker.

import type { Twilio } from 'twilio';
import {
  DeepValidator,
  type ValidationResult,
  type DebuggerValidationResult,
  type ServerlessLogsValidationResult,
  type RecordingValidationResult,
  type TranscriptValidationResult,
  type TwoWayValidationResult,
  type ConversationRelayValidationResult,
} from './deep-validator.js';
import { DiagnosticBridge, type Diagnosis } from './diagnostic-bridge.js';
import { LearningCaptureEngine, type LearningEntry } from './learning-capture.js';
import { PatternTracker, type PatternHistory } from './pattern-tracker.js';

/**
 * Union type of all validation result types.
 */
export type AnyValidationResult =
  | ValidationResult
  | DebuggerValidationResult
  | ServerlessLogsValidationResult
  | RecordingValidationResult
  | TranscriptValidationResult
  | TwoWayValidationResult
  | ConversationRelayValidationResult;

/**
 * Result from a comprehensive validation run.
 */
export interface ComprehensiveValidationResult {
  /** Whether all validators passed */
  allPassed: boolean;

  /** Individual validation results by validator name */
  results: Map<string, AnyValidationResult>;

  /** Diagnoses for failed validations */
  diagnoses: Diagnosis[];

  /** Learnings captured from failures */
  learnings: LearningEntry[];

  /** Patterns recorded */
  patterns: PatternHistory[];

  /** Summary statistics */
  summary: {
    totalValidators: number;
    passed: number;
    failed: number;
    warnings: number;
    duration: number;
  };
}

/**
 * Products that can be used in a Twilio flow.
 */
export type TwilioProduct =
  | 'voice'
  | 'messaging'
  | 'verify'
  | 'sync'
  | 'taskrouter'
  | 'conversation-relay'
  | 'intelligence'
  | 'serverless'
  | 'conference';

/**
 * Configuration for comprehensive validation.
 */
export interface ComprehensiveValidatorConfig {
  /** Project root for learnings/patterns storage */
  projectRoot: string;

  /** Session ID for learning capture */
  sessionId?: string;

  /** Whether to capture learnings on failure. Default: true */
  captureLearnings?: boolean;

  /** Whether to track patterns. Default: true */
  trackPatterns?: boolean;

  /** Trigger flywheel after capture. Default: false */
  triggerFlywheel?: boolean;
}

/**
 * Options for Voice AI flow validation.
 */
export interface VoiceAIFlowOptions {
  /** Call SID to validate */
  callSid: string;

  /** Recording SID (if call was recorded) */
  recordingSid?: string;

  /** Transcript SID (if Intelligence enabled) */
  transcriptSid?: string;

  /** SMS SID for summary message */
  smsSid?: string;

  /** Sync document name for conversation data */
  syncDocumentName?: string;

  /** ConversationRelay WebSocket URL */
  conversationRelayUrl?: string;

  /** Time window start for debugger check */
  windowStart?: Date;

  /** Time window end for debugger check */
  windowEnd?: Date;

  /** Serverless service SID */
  serverlessServiceSid?: string;

  /** Sync service SID */
  syncServiceSid?: string;

  /** Intelligence service SID */
  intelligenceServiceSid?: string;

  /** Forbidden patterns for two-way validation */
  forbiddenPatterns?: string[];

  /** Minimum sentences per side for two-way validation */
  minSentencesPerSide?: number;
}

/**
 * ComprehensiveValidator - Orchestrates validation based on products used.
 *
 * Runs relevant DeepValidator methods for each product, feeds failures to
 * the self-healing loop (DiagnosticBridge → LearningCapture → PatternTracker).
 */
export class ComprehensiveValidator {
  private deepValidator: DeepValidator;
  private diagnosticBridge: DiagnosticBridge;
  private learningCapture: LearningCaptureEngine;
  private patternTracker: PatternTracker;
  private config: Required<ComprehensiveValidatorConfig>;

  constructor(client: Twilio, config: ComprehensiveValidatorConfig) {
    this.deepValidator = new DeepValidator(client);
    this.diagnosticBridge = new DiagnosticBridge();
    this.learningCapture = new LearningCaptureEngine(config.projectRoot, {
      sessionId: config.sessionId,
      triggerFlywheel: config.triggerFlywheel ?? false,
    });
    this.patternTracker = new PatternTracker(config.projectRoot);
    this.config = {
      projectRoot: config.projectRoot,
      sessionId: config.sessionId ?? `session-${Date.now()}`,
      captureLearnings: config.captureLearnings ?? true,
      trackPatterns: config.trackPatterns ?? true,
      triggerFlywheel: config.triggerFlywheel ?? false,
    };
  }

  /**
   * Validates a Voice AI flow using all relevant validators.
   *
   * Products used: Voice, ConversationRelay, Intelligence, Messaging, Sync, Serverless
   *
   * Validators run:
   * - validateCall (Voice)
   * - validateRecording (if recording exists)
   * - validateTranscript (if Intelligence enabled)
   * - validateTwoWay (if two-way conversation)
   * - validateDebugger (always)
   * - validateServerlessFunctions (if serverless configured)
   * - validateConversationRelay (if URL provided)
   * - validateMessage (if SMS summary enabled)
   */
  async validateVoiceAIFlow(options: VoiceAIFlowOptions): Promise<ComprehensiveValidationResult> {
    const startTime = Date.now();
    const results = new Map<string, AnyValidationResult>();
    const diagnoses: Diagnosis[] = [];
    const learnings: LearningEntry[] = [];
    const patterns: PatternHistory[] = [];
    let warningCount = 0;

    // Run validators in parallel where possible
    const validationPromises: Array<{
      name: string;
      promise: Promise<AnyValidationResult>;
    }> = [];

    // Always run debugger validation
    const windowStart = options.windowStart || new Date(Date.now() - 5 * 60 * 1000);
    const windowEnd = options.windowEnd || new Date();
    const lookbackSeconds = Math.floor((windowEnd.getTime() - windowStart.getTime()) / 1000);

    validationPromises.push({
      name: 'debugger',
      promise: this.deepValidator.validateDebugger({ lookbackSeconds }),
    });

    // Validate call
    validationPromises.push({
      name: 'call',
      promise: this.deepValidator.validateCall(options.callSid, {
        waitForTerminal: true,
        timeout: 60000,
        serverlessServiceSid: options.serverlessServiceSid,
        syncServiceSid: options.syncServiceSid,
      }),
    });

    // Validate recording if provided
    if (options.recordingSid) {
      validationPromises.push({
        name: 'recording',
        promise: this.deepValidator.validateRecording(options.recordingSid, {
          waitForCompleted: true,
          timeout: 60000,
        }),
      });
    }

    // Validate transcript if provided
    if (options.transcriptSid) {
      validationPromises.push({
        name: 'transcript',
        promise: this.deepValidator.validateTranscript(options.transcriptSid, {
          waitForCompleted: true,
          timeout: 120000,
          checkSentences: true,
        }),
      });
    }

    // Validate two-way conversation if Intelligence service configured
    if (options.intelligenceServiceSid && options.callSid) {
      validationPromises.push({
        name: 'twoWay',
        promise: this.deepValidator.validateTwoWay({
          callSidA: options.callSid,
          callSidB: options.callSid, // Same call for single-leg analysis
          intelligenceServiceSid: options.intelligenceServiceSid,
          expectedTurns: 4,
          forbiddenPatterns: options.forbiddenPatterns ?? [
            'application error',
            "we're sorry",
            'cannot be completed',
            'please try again later',
          ],
          minSentencesPerSide: options.minSentencesPerSide ?? 3,
        }),
      });
    }

    // Validate serverless functions if configured
    if (options.serverlessServiceSid) {
      validationPromises.push({
        name: 'serverless',
        promise: this.deepValidator.validateServerlessFunctions({
          serverlessServiceSid: options.serverlessServiceSid,
          lookbackSeconds,
        }),
      });
    }

    // Validate ConversationRelay if URL provided
    if (options.conversationRelayUrl) {
      validationPromises.push({
        name: 'conversationRelay',
        promise: this.deepValidator.validateConversationRelay({
          url: options.conversationRelayUrl,
          timeout: 10000,
          validateGreeting: true,
        }),
      });
    }

    // Validate SMS if provided
    if (options.smsSid) {
      validationPromises.push({
        name: 'message',
        promise: this.deepValidator.validateMessage(options.smsSid, {
          waitForTerminal: true,
          timeout: 300000, // 5 min for async delivery
          syncServiceSid: options.syncServiceSid,
        }),
      });
    }

    // Run all validations
    const settledResults = await Promise.allSettled(
      validationPromises.map(async (v) => ({ name: v.name, result: await v.promise }))
    );

    // Process results
    for (const settled of settledResults) {
      if (settled.status === 'fulfilled') {
        const { name, result } = settled.value;
        results.set(name, result);

        // Process failures through self-healing loop
        if (!result.success) {
          await this.processFailure(name, result, diagnoses, learnings, patterns);
        }

        // Count warnings
        if ('warnings' in result && Array.isArray(result.warnings)) {
          warningCount += result.warnings.length;
        }
      } else {
        // Handle promise rejection
        console.error(`Validator failed with error:`, settled.reason);
      }
    }

    const passed = Array.from(results.values()).filter((r) => r.success).length;
    const failed = results.size - passed;

    return {
      allPassed: failed === 0,
      results,
      diagnoses,
      learnings,
      patterns,
      summary: {
        totalValidators: results.size,
        passed,
        failed,
        warnings: warningCount,
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * Validates a Verify flow.
   *
   * Products used: Verify, Debugger
   */
  async validateVerifyFlow(
    serviceSid: string,
    verificationSid: string
  ): Promise<ComprehensiveValidationResult> {
    const startTime = Date.now();
    const results = new Map<string, AnyValidationResult>();
    const diagnoses: Diagnosis[] = [];
    const learnings: LearningEntry[] = [];
    const patterns: PatternHistory[] = [];

    // Validate verification
    const verifyResult = await this.deepValidator.validateVerification(
      serviceSid,
      verificationSid,
      { waitForTerminal: true }
    );
    results.set('verification', verifyResult);

    if (!verifyResult.success) {
      await this.processFailure('verification', verifyResult, diagnoses, learnings, patterns);
    }

    // Validate debugger
    const debuggerResult = await this.deepValidator.validateDebugger({ lookbackSeconds: 300 });
    results.set('debugger', debuggerResult);

    if (!debuggerResult.success) {
      await this.processFailure('debugger', debuggerResult, diagnoses, learnings, patterns);
    }

    const passed = Array.from(results.values()).filter((r) => r.success).length;
    const failed = results.size - passed;

    return {
      allPassed: failed === 0,
      results,
      diagnoses,
      learnings,
      patterns,
      summary: {
        totalValidators: results.size,
        passed,
        failed,
        warnings: 0,
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * Validates a TaskRouter flow.
   *
   * Products used: TaskRouter, Debugger
   */
  async validateTaskRouterFlow(
    workspaceSid: string,
    taskSid: string
  ): Promise<ComprehensiveValidationResult> {
    const startTime = Date.now();
    const results = new Map<string, AnyValidationResult>();
    const diagnoses: Diagnosis[] = [];
    const learnings: LearningEntry[] = [];
    const patterns: PatternHistory[] = [];

    // Validate task
    const taskResult = await this.deepValidator.validateTask(workspaceSid, taskSid);
    results.set('task', taskResult);

    if (!taskResult.success) {
      await this.processFailure('task', taskResult, diagnoses, learnings, patterns);
    }

    // Validate debugger
    const debuggerResult = await this.deepValidator.validateDebugger({ lookbackSeconds: 300 });
    results.set('debugger', debuggerResult);

    if (!debuggerResult.success) {
      await this.processFailure('debugger', debuggerResult, diagnoses, learnings, patterns);
    }

    const passed = Array.from(results.values()).filter((r) => r.success).length;
    const failed = results.size - passed;

    return {
      allPassed: failed === 0,
      results,
      diagnoses,
      learnings,
      patterns,
      summary: {
        totalValidators: results.size,
        passed,
        failed,
        warnings: 0,
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * Validates a Messaging flow.
   *
   * Products used: Messaging, Debugger
   */
  async validateMessagingFlow(
    messageSid: string,
    options?: { syncServiceSid?: string; serverlessServiceSid?: string }
  ): Promise<ComprehensiveValidationResult> {
    const startTime = Date.now();
    const results = new Map<string, AnyValidationResult>();
    const diagnoses: Diagnosis[] = [];
    const learnings: LearningEntry[] = [];
    const patterns: PatternHistory[] = [];

    // Validate message
    const messageResult = await this.deepValidator.validateMessage(messageSid, {
      waitForTerminal: true,
      syncServiceSid: options?.syncServiceSid,
      serverlessServiceSid: options?.serverlessServiceSid,
    });
    results.set('message', messageResult);

    if (!messageResult.success) {
      await this.processFailure('message', messageResult, diagnoses, learnings, patterns);
    }

    // Validate debugger
    const debuggerResult = await this.deepValidator.validateDebugger({ lookbackSeconds: 300 });
    results.set('debugger', debuggerResult);

    if (!debuggerResult.success) {
      await this.processFailure('debugger', debuggerResult, diagnoses, learnings, patterns);
    }

    const passed = Array.from(results.values()).filter((r) => r.success).length;
    const failed = results.size - passed;

    return {
      allPassed: failed === 0,
      results,
      diagnoses,
      learnings,
      patterns,
      summary: {
        totalValidators: results.size,
        passed,
        failed,
        warnings: 0,
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * Processes a validation failure through the self-healing loop.
   */
  private async processFailure(
    validatorName: string,
    result: AnyValidationResult,
    diagnoses: Diagnosis[],
    learnings: LearningEntry[],
    patterns: PatternHistory[]
  ): Promise<void> {
    // Create a ValidationResult-like object for DiagnosticBridge
    // DiagnosticBridge expects ValidationResult type
    const validationResultLike = this.toValidationResult(validatorName, result);

    // Skip if we can't convert to ValidationResult (e.g., debugger-only results)
    if (!validationResultLike) return;

    try {
      // Analyze with DiagnosticBridge
      const diagnosis = this.diagnosticBridge.analyze(validationResultLike);
      diagnoses.push(diagnosis);

      // Capture learning
      if (this.config.captureLearnings) {
        const learning = await this.learningCapture.capture(diagnosis);
        learnings.push(learning);
      }

      // Track pattern
      if (this.config.trackPatterns) {
        const pattern = this.patternTracker.record(diagnosis, this.config.sessionId);
        patterns.push(pattern);
      }

      // Log diagnosis summary
      console.error(`[ComprehensiveValidator] ${validatorName} FAILED`);
      console.error(`  Summary: ${diagnosis.summary}`);
      console.error(`  Root cause: ${diagnosis.rootCause.description} (confidence: ${diagnosis.rootCause.confidence})`);
      if (diagnosis.suggestedFixes.length > 0) {
        console.error(`  Suggested fix: ${diagnosis.suggestedFixes[0].description}`);
      }
    } catch (error) {
      // DiagnosticBridge may throw for non-ValidationResult types
      console.error(`[ComprehensiveValidator] Could not analyze ${validatorName} failure:`, error);
    }
  }

  /**
   * Converts various result types to ValidationResult for DiagnosticBridge.
   */
  private toValidationResult(name: string, result: AnyValidationResult): ValidationResult | null {
    // Check if it's already a ValidationResult
    if ('resourceSid' in result && 'resourceType' in result && 'checks' in result) {
      return result as ValidationResult;
    }

    // Convert other result types to ValidationResult-like structure
    if ('totalAlerts' in result) {
      // DebuggerValidationResult
      const debugResult = result as DebuggerValidationResult;
      return {
        success: debugResult.success,
        resourceSid: 'debugger',
        resourceType: 'message', // Use message as a fallback type
        primaryStatus: debugResult.success ? 'clean' : 'has-errors',
        checks: {
          resourceStatus: {
            passed: debugResult.success,
            message: `Found ${debugResult.errorAlerts} errors, ${debugResult.warningAlerts} warnings`,
            data: { errorCount: debugResult.errorAlerts, warningCount: debugResult.warningAlerts },
          },
          debuggerAlerts: {
            passed: debugResult.errorAlerts === 0,
            message: debugResult.alerts.map((a) => `${a.errorCode}: ${a.alertText}`).join('; '),
            data: debugResult.alerts,
          },
        },
        errors: debugResult.alerts.filter((a) => a.logLevel === 'error').map((a) => a.alertText),
        warnings: debugResult.alerts.filter((a) => a.logLevel === 'warning').map((a) => a.alertText),
        duration: debugResult.duration,
      };
    }

    if ('recordingSid' in result) {
      // RecordingValidationResult
      const recResult = result as RecordingValidationResult;
      return {
        success: recResult.success,
        resourceSid: recResult.recordingSid,
        resourceType: 'call', // Recordings are associated with calls
        primaryStatus: recResult.status,
        checks: {
          resourceStatus: {
            passed: recResult.success,
            message: `Recording status: ${recResult.status}`,
            data: { status: recResult.status, duration: recResult.duration },
          },
          debuggerAlerts: { passed: true, message: 'N/A', data: [] },
        },
        errors: recResult.errors,
        warnings: [],
        duration: recResult.validationDuration,
      };
    }

    if ('transcriptSid' in result && 'sentenceCount' in result) {
      // TranscriptValidationResult
      const txResult = result as TranscriptValidationResult;
      return {
        success: txResult.success,
        resourceSid: txResult.transcriptSid,
        resourceType: 'call', // Transcripts are associated with calls
        primaryStatus: txResult.status,
        checks: {
          resourceStatus: {
            passed: txResult.success,
            message: `Transcript status: ${txResult.status}, sentences: ${txResult.sentenceCount}`,
            data: { status: txResult.status, sentenceCount: txResult.sentenceCount },
          },
          debuggerAlerts: { passed: true, message: 'N/A', data: [] },
        },
        errors: txResult.errors,
        warnings: [],
        duration: txResult.validationDuration,
      };
    }

    if ('callA' in result && 'callB' in result) {
      // TwoWayValidationResult
      const twoWayResult = result as TwoWayValidationResult;
      return {
        success: twoWayResult.success,
        resourceSid: twoWayResult.callA.callSid,
        resourceType: 'call',
        primaryStatus: twoWayResult.success ? 'validated' : 'failed',
        checks: {
          resourceStatus: {
            passed: twoWayResult.success,
            message: `Two-way: ${twoWayResult.conversation.totalTurns} turns, natural flow: ${twoWayResult.conversation.hasNaturalFlow}`,
            data: twoWayResult.conversation,
          },
          debuggerAlerts: { passed: true, message: 'N/A', data: [] },
        },
        errors: twoWayResult.errors,
        warnings: twoWayResult.warnings,
        duration: twoWayResult.validationDuration,
      };
    }

    if ('connectionEstablished' in result) {
      // ConversationRelayValidationResult
      const crResult = result as ConversationRelayValidationResult;
      return {
        success: crResult.success,
        resourceSid: 'conversation-relay',
        resourceType: 'call',
        primaryStatus: crResult.success ? 'connected' : 'failed',
        checks: {
          resourceStatus: {
            passed: crResult.success,
            message: `WebSocket: connected=${crResult.connectionEstablished}, greeting=${crResult.greetingReceived}`,
            data: {
              connectionEstablished: crResult.connectionEstablished,
              greetingReceived: crResult.greetingReceived,
              greetingText: crResult.greetingText,
            },
          },
          debuggerAlerts: { passed: true, message: 'N/A', data: [] },
        },
        errors: crResult.errors.concat(crResult.protocolErrors),
        warnings: [],
        duration: crResult.validationDuration,
      };
    }

    if ('totalLogs' in result) {
      // ServerlessLogsValidationResult
      const slResult = result as ServerlessLogsValidationResult;
      return {
        success: slResult.success,
        resourceSid: 'serverless',
        resourceType: 'message', // Use message as fallback
        primaryStatus: slResult.success ? 'clean' : 'has-errors',
        checks: {
          resourceStatus: {
            passed: slResult.success,
            message: `Logs: ${slResult.totalLogs} total, ${slResult.errorLogs} errors, ${slResult.warnLogs} warnings`,
            data: { totalLogs: slResult.totalLogs, errorLogs: slResult.errorLogs },
          },
          debuggerAlerts: { passed: true, message: 'N/A', data: [] },
          functionLogs: {
            passed: slResult.errorLogs === 0,
            message: slResult.logs.map((l) => l.message).join('; ').slice(0, 500),
            data: slResult.logs,
          },
        },
        errors: slResult.logs.filter((l) => l.level === 'error').map((l) => l.message),
        warnings: slResult.logs.filter((l) => l.level === 'warn').map((l) => l.message),
        duration: slResult.duration,
      };
    }

    // Unknown result type
    console.warn(`[ComprehensiveValidator] Unknown result type for ${name}, cannot convert to ValidationResult`);
    return null;
  }

  /**
   * Gets the underlying DeepValidator for direct access if needed.
   */
  getDeepValidator(): DeepValidator {
    return this.deepValidator;
  }

  /**
   * Gets the DiagnosticBridge for pattern analysis.
   */
  getDiagnosticBridge(): DiagnosticBridge {
    return this.diagnosticBridge;
  }

  /**
   * Gets the LearningCaptureEngine for accessing captured learnings.
   */
  getLearningCapture(): LearningCaptureEngine {
    return this.learningCapture;
  }

  /**
   * Gets the PatternTracker for accessing tracked patterns.
   */
  getPatternTracker(): PatternTracker {
    return this.patternTracker;
  }
}

/**
 * Creates a ComprehensiveValidator instance.
 */
export function createComprehensiveValidator(
  client: Twilio,
  config: ComprehensiveValidatorConfig
): ComprehensiveValidator {
  return new ComprehensiveValidator(client, config);
}
