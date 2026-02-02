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
 * Error code patterns for classification.
 */
const ERROR_CODE_PATTERNS: Record<string, { category: RootCauseCategory; description: string }> = {
  // Configuration errors
  '20404': { category: 'configuration', description: 'Resource not found - check SID or resource may not exist' },
  '20003': { category: 'configuration', description: 'Authentication error - check credentials' },
  '21211': { category: 'configuration', description: 'Invalid phone number format' },
  '21212': { category: 'configuration', description: 'Phone number not valid' },
  '21614': { category: 'configuration', description: 'Phone number not SMS-capable' },

  // External/carrier errors
  '30003': { category: 'external', description: 'Unreachable destination - carrier issue' },
  '30004': { category: 'external', description: 'Message blocked - carrier filtering' },
  '30005': { category: 'external', description: 'Unknown destination - invalid number' },
  '30006': { category: 'external', description: 'Landline or unreachable carrier' },
  '30007': { category: 'external', description: 'Carrier violation - message blocked' },
  '30008': { category: 'external', description: 'Unknown error from carrier' },
  '30034': { category: 'external', description: 'Message filtered by carrier' },

  // Code/TwiML errors
  '11200': { category: 'code', description: 'HTTP retrieval failure - check webhook URL' },
  '11205': { category: 'code', description: 'HTTP connection failure - webhook unreachable' },
  '11206': { category: 'code', description: 'HTTP protocol violation - webhook error' },
  '12100': { category: 'code', description: 'TwiML document missing - no content' },
  '12200': { category: 'code', description: 'Invalid TwiML schema' },
  '12300': { category: 'code', description: 'Invalid TwiML Content-Type' },
  '21609': { category: 'code', description: 'From number not owned - check phone number ownership' },
};

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
 * Classifies root cause from validation result.
 */
function classifyRootCause(result: ValidationResult): Diagnosis['rootCause'] {
  const errorCodes = extractErrorCodes(result);

  // Check error codes first (most specific)
  for (const code of errorCodes) {
    const pattern = ERROR_CODE_PATTERNS[code];
    if (pattern) {
      return {
        category: pattern.category,
        description: `Error ${code}: ${pattern.description}`,
        confidence: 0.9,
      };
    }
  }

  // Check status patterns
  const statusPattern = STATUS_PATTERNS[result.primaryStatus];
  if (statusPattern) {
    return {
      category: statusPattern.category,
      description: `Status '${result.primaryStatus}': ${statusPattern.description}`,
      confidence: 0.8,
    };
  }

  // Check for timing issues
  if (result.errors.some(e => e.includes('not yet available') || e.includes('not found'))) {
    return {
      category: 'timing',
      description: 'Resource or data not yet available - may need to wait',
      confidence: 0.7,
    };
  }

  // Check for webhook/function issues
  if (result.checks.functionLogs && !result.checks.functionLogs.passed) {
    return {
      category: 'code',
      description: 'Function execution errors detected',
      confidence: 0.8,
    };
  }

  // Check for callback issues
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

  // Check for Voice Insights issues
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
 * Generates fix suggestions based on root cause.
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
        description: 'Verify environment variables are correctly set',
        actionType: 'config',
        confidence: 0.8,
        automated: false,
        steps: [
          'Check .env file for required variables',
          'Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN',
          'Ensure all service SIDs are valid',
        ],
      });

      if (errorCodes.includes('21211') || errorCodes.includes('21212')) {
        fixes.push({
          description: 'Verify phone number is in E.164 format (+1XXXXXXXXXX)',
          actionType: 'config',
          confidence: 0.9,
          automated: false,
          steps: [
            'Check phone number format in request',
            'Ensure country code is included',
            'Remove any formatting characters (spaces, dashes)',
          ],
        });
      }
      break;

    case 'external':
      fixes.push({
        description: 'Wait and retry - carrier issue may be temporary',
        actionType: 'wait',
        confidence: 0.6,
        automated: true,
        steps: [
          'Wait 30-60 seconds',
          'Retry the operation',
          'If persists, check Twilio Status page',
        ],
      });

      if (errorCodes.includes('30007') || errorCodes.includes('30034')) {
        fixes.push({
          description: 'Message may be filtered - review content for compliance',
          actionType: 'code',
          confidence: 0.7,
          automated: false,
          steps: [
            'Review message content for spam indicators',
            'Check A2P 10DLC registration status',
            'Consider using a Messaging Service for better deliverability',
          ],
        });
      }
      break;

    case 'code':
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

      if (errorCodes.some(c => c.startsWith('11') || c.startsWith('12'))) {
        fixes.push({
          description: 'Check webhook URL and TwiML response',
          actionType: 'code',
          confidence: 0.9,
          automated: false,
          steps: [
            'Verify webhook URL is accessible',
            'Check TwiML syntax is valid',
            'Test webhook with curl or Postman',
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
        description: 'Review error details and investigate manually',
        actionType: 'escalate',
        confidence: 0.3,
        automated: false,
        steps: [
          'Review full validation result',
          'Check Twilio Console logs',
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
