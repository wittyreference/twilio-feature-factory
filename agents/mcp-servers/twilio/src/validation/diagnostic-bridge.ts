// ABOUTME: Connects validation failures to learning capture and fix suggestions.
// ABOUTME: Analyzes ValidationResult to produce structured Diagnosis with root cause and fixes.

import type { ValidationResult } from './deep-validator';

/**
 * Root cause category for classification.
 */
export type RootCauseCategory =
  | 'configuration'  // Missing env vars, wrong SIDs, misconfigured services
  | 'environment'    // Network issues, connectivity, infrastructure
  | 'timing'         // Insights not ready, callbacks not received yet
  | 'external'       // Carrier rejection, Twilio outage, third-party failure
  | 'code'           // TwiML errors, function crashes, webhook errors
  | 'unknown';       // Cannot determine

/**
 * Fix action type for suggested fixes.
 */
export type FixActionType =
  | 'config'     // Change environment variable or configuration
  | 'code'       // Modify application code
  | 'wait'       // Wait and retry (timing issues)
  | 'escalate';  // Requires human intervention

/**
 * Structured diagnosis from analyzing a validation failure.
 */
export interface Diagnosis {
  /** Unique identifier for this failure pattern (hash of key characteristics) */
  patternId: string;

  /** Human-readable summary of the failure */
  summary: string;

  /** Root cause analysis */
  rootCause: {
    category: RootCauseCategory;
    description: string;
    confidence: number; // 0-1, how confident we are in this classification
  };

  /** Evidence extracted from the validation result */
  evidence: Array<{
    source: string; // e.g., 'resourceStatus', 'debuggerAlerts', 'callEvents'
    data: unknown;
    relevance: 'primary' | 'supporting';
  }>;

  /** Suggested fixes in priority order */
  suggestedFixes: Array<{
    description: string;
    actionType: FixActionType;
    confidence: number; // 0-1, how likely this fix will work
    automated: boolean; // Can this fix be applied without human intervention?
    steps?: string[];   // Detailed steps to implement the fix
  }>;

  /** Has this pattern been seen before in this project? */
  isKnownPattern: boolean;

  /** Number of times this pattern has occurred previously */
  previousOccurrences: number;

  /** Original validation result for reference */
  validationResult: ValidationResult;

  /** Timestamp when diagnosis was created */
  timestamp: Date;
}

/**
 * Configuration for the DiagnosticBridge.
 */
export interface DiagnosticBridgeConfig {
  /** Enable automatic learning capture on failure. Default: true */
  autoCaptureEnabled?: boolean;

  /** Enable fix suggestion generation. Default: true */
  autoSuggestEnabled?: boolean;

  /** Enable pattern tracking across sessions. Default: true */
  patternTrackingEnabled?: boolean;

  /** Path to learnings file. Default: .claude/learnings.md */
  learningsPath?: string;

  /** Path to pattern database. Default: .claude/pattern-db.json */
  patternDbPath?: string;
}

/**
 * SCALABLE ERROR CLASSIFICATION
 *
 * Instead of mapping every individual error code (there are 1500+), we classify
 * by error code RANGE. Twilio organizes errors by prefix:
 *
 * | Range  | Category      | Domain                              |
 * |--------|---------------|-------------------------------------|
 * | 11xxx  | code          | HTTP/webhook retrieval errors       |
 * | 12xxx  | code          | TwiML parsing/validation errors     |
 * | 13xxx  | code          | Voice call errors                   |
 * | 20xxx  | configuration | Authentication/API errors           |
 * | 21xxx  | configuration | Phone number/account errors         |
 * | 30xxx  | external      | Messaging delivery (carrier) errors |
 * | 31xxx  | external      | Messaging sending errors            |
 * | 32xxx  | configuration | Messaging Service errors            |
 * | 34xxx  | configuration | A2P 10DLC registration errors       |
 * | 60xxx  | code          | Verify service errors               |
 * | 63xxx  | external      | Verify delivery errors              |
 * | 64xxx  | code          | Voice/TTS/ConversationRelay errors  |
 * | 80xxx  | code          | Recording errors                    |
 * | 82xxx  | code          | Transcription errors                |
 * | 90xxx  | configuration | TaskRouter errors                   |
 *
 * The actual error message comes from Twilio directly - we don't pre-map descriptions.
 */

/**
 * Categorizes an error code by its range prefix.
 * Returns the category and a generic hint about the error domain.
 */
function categorizeByErrorCodeRange(errorCode: string): { category: RootCauseCategory; domain: string } {
  const code = parseInt(errorCode, 10);
  if (isNaN(code)) {
    return { category: 'unknown', domain: 'Unknown error format' };
  }

  // Error code ranges map to categories
  if (code >= 11000 && code < 12000) return { category: 'code', domain: 'HTTP/webhook retrieval' };
  if (code >= 12000 && code < 13000) return { category: 'code', domain: 'TwiML parsing/validation' };
  if (code >= 13000 && code < 14000) return { category: 'code', domain: 'Voice call processing' };
  if (code >= 20000 && code < 21000) return { category: 'configuration', domain: 'Authentication/API' };
  if (code >= 21000 && code < 22000) return { category: 'configuration', domain: 'Phone number/account' };
  if (code >= 30000 && code < 31000) return { category: 'external', domain: 'Messaging delivery (carrier)' };
  if (code >= 31000 && code < 32000) return { category: 'external', domain: 'Messaging sending' };
  if (code >= 32000 && code < 33000) return { category: 'configuration', domain: 'Messaging Service' };
  if (code >= 34000 && code < 35000) return { category: 'configuration', domain: 'A2P 10DLC registration' };
  if (code >= 60000 && code < 63000) return { category: 'code', domain: 'Verify service' };
  if (code >= 63000 && code < 64000) return { category: 'external', domain: 'Verify delivery' };
  if (code >= 64000 && code < 65000) return { category: 'code', domain: 'Voice/TTS/ConversationRelay' };
  if (code >= 80000 && code < 81000) return { category: 'code', domain: 'Recording' };
  if (code >= 82000 && code < 83000) return { category: 'code', domain: 'Transcription' };
  if (code >= 90000 && code < 91000) return { category: 'configuration', domain: 'TaskRouter' };

  return { category: 'unknown', domain: 'Unrecognized error range' };
}

/**
 * Status patterns for classification.
 */
const STATUS_PATTERNS: Record<string, { category: RootCauseCategory; description: string }> = {
  'failed': { category: 'code', description: 'Operation failed - check error details' },
  'undelivered': { category: 'external', description: 'Message undelivered - carrier issue' },
  'busy': { category: 'external', description: 'Recipient busy' },
  'no-answer': { category: 'external', description: 'No answer from recipient' },
  'canceled': { category: 'configuration', description: 'Operation was canceled' },
};

/**
 * Generates a pattern ID from key failure characteristics.
 */
function generatePatternId(result: ValidationResult): string {
  const components: string[] = [
    result.resourceType,
    result.primaryStatus,
  ];

  // Add error codes if present
  if (result.checks.debuggerAlerts?.data) {
    const alerts = result.checks.debuggerAlerts.data as Array<{ errorCode?: string }>;
    if (alerts.length > 0 && alerts[0].errorCode) {
      components.push(alerts[0].errorCode);
    }
  }

  // Add error messages summary
  if (result.errors.length > 0) {
    // Hash the first error message to avoid overly specific patterns
    const errorSummary = result.errors[0]
      .replace(/[A-Z]{2}[a-f0-9]{32}/gi, '{SID}') // Replace SIDs
      .replace(/\+?\d{10,}/g, '{PHONE}')          // Replace phone numbers
      .replace(/\d{4,}/g, '{NUM}')                // Replace long numbers
      .slice(0, 50);                              // Truncate
    components.push(errorSummary);
  }

  // Simple hash function
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `PAT-${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

/**
 * Extracts error codes from a ValidationResult.
 */
function extractErrorCodes(result: ValidationResult): string[] {
  const codes: string[] = [];

  // From debugger alerts
  if (result.checks.debuggerAlerts?.data) {
    const alerts = result.checks.debuggerAlerts.data as Array<{ errorCode?: string }>;
    for (const alert of alerts) {
      if (alert.errorCode) {
        codes.push(alert.errorCode);
      }
    }
  }

  // From resource status data
  if (result.checks.resourceStatus?.data) {
    const data = result.checks.resourceStatus.data as { errorCode?: string | number };
    if (data.errorCode) {
      codes.push(String(data.errorCode));
    }
  }

  return codes;
}

/**
 * Extracts error details (code + message) from debugger alerts.
 * The message comes directly from Twilio - no pre-mapping needed.
 */
function extractErrorDetails(result: ValidationResult): Array<{
  code: string;
  message: string;
  level: string;
}> {
  const details: Array<{ code: string; message: string; level: string }> = [];

  if (result.checks.debuggerAlerts?.data) {
    const alerts = result.checks.debuggerAlerts.data as Array<{
      errorCode?: string;
      alertText?: string;
      logLevel?: string;
      moreInfo?: string;
    }>;

    for (const alert of alerts) {
      if (alert.errorCode) {
        details.push({
          code: alert.errorCode,
          message: alert.alertText || alert.moreInfo || 'No message provided',
          level: alert.logLevel || 'error',
        });
      }
    }
  }

  return details;
}

/**
 * Classifies root cause from validation result.
 *
 * SCALABLE APPROACH:
 * 1. Extract error codes and messages directly from Twilio debugger alerts
 * 2. Categorize by error code RANGE (not individual codes)
 * 3. Use Twilio's error message as the description (authoritative source)
 * 4. ANY error or warning = failure that needs attention
 */
function classifyRootCause(result: ValidationResult): Diagnosis['rootCause'] {
  const errorDetails = extractErrorDetails(result);
  const errorCodes = extractErrorCodes(result);

  // PRIORITY 1: Debugger alerts with error codes (use Twilio's message directly)
  if (errorDetails.length > 0) {
    const firstError = errorDetails[0];
    const { category, domain } = categorizeByErrorCodeRange(firstError.code);

    return {
      category,
      // Use Twilio's error message directly - don't pre-map
      description: `Error ${firstError.code} (${domain}): ${firstError.message}`,
      confidence: 0.9,
    };
  }

  // PRIORITY 2: Error codes without detailed messages (from resource status)
  if (errorCodes.length > 0) {
    const firstCode = errorCodes[0];
    const { category, domain } = categorizeByErrorCodeRange(firstCode);

    return {
      category,
      description: `Error ${firstCode} (${domain}) - check Twilio Console for details`,
      confidence: 0.8,
    };
  }

  // PRIORITY 3: Check status patterns
  const statusPattern = STATUS_PATTERNS[result.primaryStatus];
  if (statusPattern) {
    return {
      category: statusPattern.category,
      description: `Status '${result.primaryStatus}': ${statusPattern.description}`,
      confidence: 0.8,
    };
  }

  // PRIORITY 4: Check for timing issues
  if (result.errors.some(e => e.includes('not yet available') || e.includes('not found'))) {
    return {
      category: 'timing',
      description: 'Resource or data not yet available - may need to wait',
      confidence: 0.7,
    };
  }

  // PRIORITY 5: Check for webhook/function issues
  if (result.checks.functionLogs && !result.checks.functionLogs.passed) {
    return {
      category: 'code',
      description: 'Function execution errors detected',
      confidence: 0.8,
    };
  }

  // PRIORITY 6: Check for callback issues
  if (result.checks.syncCallbacks && !result.checks.syncCallbacks.passed) {
    const message = result.checks.syncCallbacks.message || '';
    if (message.includes('fallback')) {
      return {
        category: 'code',
        description: 'Fallback handler invoked - primary webhook failed',
        confidence: 0.9,
      };
    }
  }

  // PRIORITY 7: Check for Voice Insights issues
  if (result.checks.voiceInsights && !result.checks.voiceInsights.passed) {
    return {
      category: 'code',
      description: 'Voice Insights detected call quality issues',
      confidence: 0.7,
    };
  }

  // Default to unknown
  return {
    category: 'unknown',
    description: 'Unable to determine root cause from available evidence',
    confidence: 0.3,
  };
}

/**
 * Checks if any error code falls within a range.
 */
function hasErrorInRange(errorCodes: string[], rangeStart: number, rangeEnd: number): boolean {
  return errorCodes.some(code => {
    const num = parseInt(code, 10);
    return !isNaN(num) && num >= rangeStart && num < rangeEnd;
  });
}

/**
 * Generates fix suggestions based on root cause.
 *
 * SCALABLE APPROACH:
 * - Use error code RANGES for suggestions (not individual codes)
 * - Provide generic guidance per domain (webhook, TwiML, messaging, voice, etc.)
 * - The specific error message from Twilio tells you what's wrong
 * - These suggestions tell you WHERE to look and WHAT to check
 */
function generateFixSuggestions(
  result: ValidationResult,
  rootCause: Diagnosis['rootCause']
): Diagnosis['suggestedFixes'] {
  const fixes: Diagnosis['suggestedFixes'] = [];
  const errorCodes = extractErrorCodes(result);

  // Category-specific suggestions
  switch (rootCause.category) {
    case 'configuration':
      fixes.push({
        description: 'Verify environment variables and credentials',
        actionType: 'config',
        confidence: 0.8,
        automated: false,
        steps: [
          'Check .env file for required variables',
          'Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN',
          'Ensure all service SIDs are valid and exist',
        ],
      });

      // 21xxx = Phone number/account errors
      if (hasErrorInRange(errorCodes, 21000, 22000)) {
        fixes.push({
          description: 'Check phone number configuration',
          actionType: 'config',
          confidence: 0.9,
          automated: false,
          steps: [
            'Verify phone number is in E.164 format (+1XXXXXXXXXX)',
            'Confirm the phone number is owned by your account',
            'Check phone number capabilities (SMS, Voice, MMS)',
          ],
        });
      }

      // 32xxx = Messaging Service errors
      if (hasErrorInRange(errorCodes, 32000, 33000)) {
        fixes.push({
          description: 'Check Messaging Service configuration',
          actionType: 'config',
          confidence: 0.9,
          automated: false,
          steps: [
            'Verify TWILIO_MESSAGING_SERVICE_SID is correct',
            'Ensure phone numbers are assigned to the service',
            'Check service settings in Twilio Console',
          ],
        });
      }

      // 34xxx = A2P 10DLC errors
      if (hasErrorInRange(errorCodes, 34000, 35000)) {
        fixes.push({
          description: 'Check A2P 10DLC registration status',
          actionType: 'escalate',
          confidence: 0.9,
          automated: false,
          steps: [
            'Review A2P registration in Twilio Console',
            'Ensure brand and campaign are approved',
            'Check for compliance violations',
          ],
        });
      }

      // 90xxx = TaskRouter errors
      if (hasErrorInRange(errorCodes, 90000, 91000)) {
        fixes.push({
          description: 'Check TaskRouter configuration',
          actionType: 'config',
          confidence: 0.9,
          automated: false,
          steps: [
            'Verify workspace, workflow, and queue SIDs',
            'Check worker availability and activities',
            'Review workflow configuration',
          ],
        });
      }
      break;

    case 'external':
      fixes.push({
        description: 'Wait and retry - external issue may be temporary',
        actionType: 'wait',
        confidence: 0.6,
        automated: true,
        steps: [
          'Wait 30-60 seconds',
          'Retry the operation',
          'If persists, check Twilio Status page',
        ],
      });

      // 30xxx = Messaging delivery (carrier) errors
      if (hasErrorInRange(errorCodes, 30000, 31000)) {
        fixes.push({
          description: 'Review message for carrier compliance',
          actionType: 'code',
          confidence: 0.7,
          automated: false,
          steps: [
            'Check message content for spam indicators',
            'Verify recipient number is valid and reachable',
            'Consider using a Messaging Service for better deliverability',
            'Check A2P 10DLC registration if sending to US numbers',
          ],
        });
      }

      // 63xxx = Verify delivery errors
      if (hasErrorInRange(errorCodes, 63000, 64000)) {
        fixes.push({
          description: 'Check verification delivery settings',
          actionType: 'config',
          confidence: 0.7,
          automated: false,
          steps: [
            'Verify recipient phone number format',
            'Check country is supported for verification',
            'Consider fallback to voice channel',
          ],
        });
      }
      break;

    case 'code':
      // Always suggest checking function logs if available
      if (result.checks.functionLogs && !result.checks.functionLogs.passed) {
        fixes.push({
          description: 'Check Twilio Function logs for errors',
          actionType: 'code',
          confidence: 0.8,
          automated: false,
          steps: [
            'Run: twilio serverless:logs --tail',
            'Look for error-level log entries',
            'Check for unhandled exceptions',
          ],
        });
      }

      // 11xxx = HTTP/webhook errors
      if (hasErrorInRange(errorCodes, 11000, 12000)) {
        fixes.push({
          description: 'Check webhook URL accessibility',
          actionType: 'code',
          confidence: 0.9,
          automated: false,
          steps: [
            'Verify webhook URL is publicly accessible',
            'Test webhook with curl or Postman',
            'Check for SSL certificate issues',
            'Ensure server responds within timeout (15s)',
          ],
        });
      }

      // 12xxx = TwiML errors
      if (hasErrorInRange(errorCodes, 12000, 13000)) {
        fixes.push({
          description: 'Check TwiML syntax and response',
          actionType: 'code',
          confidence: 0.9,
          automated: false,
          steps: [
            'Validate TwiML syntax (XML format)',
            'Check for invalid attributes or verbs',
            'Ensure Content-Type is text/xml or application/xml',
            'Test TwiML response in Twilio Console TwiML Bins',
          ],
        });
      }

      // 64xxx = Voice/TTS/ConversationRelay errors
      if (hasErrorInRange(errorCodes, 64000, 65000)) {
        fixes.push({
          description: 'Check Voice/TTS/ConversationRelay configuration',
          actionType: 'code',
          confidence: 0.9,
          automated: false,
          steps: [
            'Verify voice attribute format (Polly.Amy for Amazon, Google.en-US-Neural2-A for Google)',
            'Check transcriptionProvider and voice compatibility',
            'Ensure WebSocket URL is accessible (wss://)',
            'Remove invalid ConversationRelay attributes (e.g., interruptByDtmf)',
            'Review functions/conversation-relay/CLAUDE.md for valid options',
          ],
        });
      }

      // 60xxx = Verify service errors
      if (hasErrorInRange(errorCodes, 60000, 63000)) {
        fixes.push({
          description: 'Check Verify service configuration',
          actionType: 'code',
          confidence: 0.9,
          automated: false,
          steps: [
            'Verify TWILIO_VERIFY_SERVICE_SID is correct',
            'Check verification channel settings',
            'Ensure service is enabled in Twilio Console',
          ],
        });
      }

      // 80xxx = Recording errors
      if (hasErrorInRange(errorCodes, 80000, 81000)) {
        fixes.push({
          description: 'Check recording configuration',
          actionType: 'code',
          confidence: 0.8,
          automated: false,
          steps: [
            'Verify recording settings in TwiML',
            'Check storage and callback URLs',
            'Ensure sufficient account balance',
          ],
        });
      }

      // 82xxx = Transcription errors
      if (hasErrorInRange(errorCodes, 82000, 83000)) {
        fixes.push({
          description: 'Check transcription settings',
          actionType: 'code',
          confidence: 0.8,
          automated: false,
          steps: [
            'Verify Intelligence Service SID',
            'Check transcription provider settings',
            'Ensure recording is accessible',
          ],
        });
      }
      break;

    case 'timing':
      fixes.push({
        description: 'Wait for async processing to complete',
        actionType: 'wait',
        confidence: 0.8,
        automated: true,
        steps: [
          'Wait 2-5 minutes for Insights data',
          'Wait up to 30 minutes for final Insights',
          'Retry validation after waiting',
        ],
      });
      break;

    case 'environment':
      fixes.push({
        description: 'Check network connectivity and service availability',
        actionType: 'escalate',
        confidence: 0.5,
        automated: false,
        steps: [
          'Check Twilio Status page for outages',
          'Verify network connectivity',
          'Test with a simple API call',
        ],
      });
      break;

    default:
      fixes.push({
        description: 'Review error details in Twilio Console',
        actionType: 'escalate',
        confidence: 0.3,
        automated: false,
        steps: [
          'Check Twilio Console > Monitor > Errors',
          'Review the specific error code documentation',
          'Contact Twilio support if needed',
        ],
      });
  }

  // Sort by confidence (highest first)
  return fixes.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Extracts evidence from validation result.
 */
function extractEvidence(result: ValidationResult): Diagnosis['evidence'] {
  const evidence: Diagnosis['evidence'] = [];

  // Primary evidence: the failed checks
  for (const [checkName, checkResult] of Object.entries(result.checks)) {
    if (checkResult && !checkResult.passed) {
      evidence.push({
        source: checkName,
        data: checkResult.data || checkResult.message,
        relevance: 'primary',
      });
    }
  }

  // Supporting evidence: passed checks with relevant data
  for (const [checkName, checkResult] of Object.entries(result.checks)) {
    if (checkResult && checkResult.passed && checkResult.data) {
      evidence.push({
        source: checkName,
        data: checkResult.data,
        relevance: 'supporting',
      });
    }
  }

  return evidence;
}

/**
 * Generates human-readable summary.
 */
function generateSummary(result: ValidationResult, rootCause: Diagnosis['rootCause']): string {
  const parts: string[] = [];

  parts.push(`${result.resourceType.charAt(0).toUpperCase() + result.resourceType.slice(1)} validation failed`);
  parts.push(`Status: ${result.primaryStatus}`);
  parts.push(`Root cause: ${rootCause.description}`);

  if (result.errors.length > 0) {
    parts.push(`Errors: ${result.errors.length}`);
  }

  return parts.join('. ');
}

/**
 * DiagnosticBridge - Connects validation failures to learning capture.
 * Analyzes ValidationResult to produce structured Diagnosis with root cause and fix suggestions.
 */
export class DiagnosticBridge {
  private config: Required<DiagnosticBridgeConfig>;
  private patternCache: Map<string, { count: number; firstSeen: Date }> = new Map();

  constructor(config: DiagnosticBridgeConfig = {}) {
    this.config = {
      autoCaptureEnabled: config.autoCaptureEnabled ?? true,
      autoSuggestEnabled: config.autoSuggestEnabled ?? true,
      patternTrackingEnabled: config.patternTrackingEnabled ?? true,
      learningsPath: config.learningsPath ?? '.claude/learnings.md',
      patternDbPath: config.patternDbPath ?? '.claude/pattern-db.json',
    };
  }

  /**
   * Analyzes a validation result and produces a structured diagnosis.
   */
  analyze(result: ValidationResult): Diagnosis {
    // Only analyze failures
    if (result.success) {
      throw new Error('DiagnosticBridge.analyze() should only be called for failed validations');
    }

    const patternId = generatePatternId(result);
    const rootCause = classifyRootCause(result);
    const evidence = extractEvidence(result);
    const suggestedFixes = this.config.autoSuggestEnabled
      ? generateFixSuggestions(result, rootCause)
      : [];
    const summary = generateSummary(result, rootCause);

    // Check pattern cache
    const cachedPattern = this.patternCache.get(patternId);
    const isKnownPattern = !!cachedPattern;
    const previousOccurrences = cachedPattern?.count || 0;

    // Update pattern cache
    if (this.config.patternTrackingEnabled) {
      this.patternCache.set(patternId, {
        count: previousOccurrences + 1,
        firstSeen: cachedPattern?.firstSeen || new Date(),
      });
    }

    return {
      patternId,
      summary,
      rootCause,
      evidence,
      suggestedFixes,
      isKnownPattern,
      previousOccurrences,
      validationResult: result,
      timestamp: new Date(),
    };
  }

  /**
   * Gets statistics about tracked patterns.
   */
  getPatternStats(): {
    totalPatterns: number;
    frequentPatterns: Array<{ patternId: string; count: number; firstSeen: Date }>;
  } {
    const patterns = Array.from(this.patternCache.entries())
      .map(([patternId, data]) => ({ patternId, ...data }))
      .sort((a, b) => b.count - a.count);

    return {
      totalPatterns: patterns.length,
      frequentPatterns: patterns.slice(0, 10),
    };
  }

  /**
   * Clears the pattern cache.
   */
  clearPatternCache(): void {
    this.patternCache.clear();
  }

  /**
   * Gets configuration.
   */
  getConfig(): Required<DiagnosticBridgeConfig> {
    return { ...this.config };
  }
}

/**
 * Creates a DiagnosticBridge instance.
 */
export function createDiagnosticBridge(config?: DiagnosticBridgeConfig): DiagnosticBridge {
  return new DiagnosticBridge(config);
}
