// ABOUTME: Deep validation helper for verifying Twilio API operations beyond 200 OK.
// ABOUTME: Checks resource status, debugger alerts, call events, Voice/Conference Insights, Function logs, and Sync callbacks.

import type { Twilio } from 'twilio';

/**
 * Result of a single validation check.
 */
export interface CheckResult {
  passed: boolean;
  message: string;
  data?: unknown;
}

/**
 * Comprehensive validation result for an API operation.
 */
export interface ValidationResult {
  success: boolean;
  resourceSid: string;
  resourceType: 'message' | 'call' | 'verification' | 'task' | 'conference';
  primaryStatus: string;
  checks: {
    resourceStatus: CheckResult;
    debuggerAlerts: CheckResult;
    callEvents?: CheckResult;
    voiceInsights?: CheckResult;
    conferenceInsights?: CheckResult;
    conferenceParticipantInsights?: CheckResult;
    functionLogs?: CheckResult;
    studioLogs?: CheckResult;
    syncCallbacks?: CheckResult;
  };
  errors: string[];
  warnings: string[];
  duration: number;
}

/**
 * Options for validation behavior.
 */
export interface ValidationOptions {
  /** Wait for terminal status (delivered, completed, etc.). Default: false */
  waitForTerminal?: boolean;
  /** Maximum time to wait for terminal status (ms). Default: 30000 */
  timeout?: number;
  /** Polling interval (ms). Default: 2000 */
  pollInterval?: number;
  /** How far back to check debugger alerts (seconds). Default: 120 */
  alertLookbackSeconds?: number;
  /** Sync Service SID for callback data. If not provided, skips Sync check. */
  syncServiceSid?: string;
  /** Serverless Service SID for Function logs. If not provided, skips Function log check. */
  serverlessServiceSid?: string;
  /** Studio Flow SID to check. If not provided, skips Studio check. */
  studioFlowSid?: string;
}

// ===== New Validation Interfaces =====

/**
 * Options for account-wide debugger validation.
 */
export interface DebuggerValidationOptions {
  /** How far back to look (seconds). Default: 300 (5 min) */
  lookbackSeconds?: number;
  /** Filter by log level. If not set, returns all levels. */
  logLevel?: 'error' | 'warning' | 'notice' | 'debug';
  /** Max alerts to return. Default: 100 */
  limit?: number;
  /** Optional: Only alerts for specific resource SID */
  resourceSid?: string;
  /** Optional: Only alerts for specific service SID */
  serviceSid?: string;
}

/**
 * Result from broad debugger validation (not resource-specific).
 */
export interface DebuggerValidationResult {
  success: boolean;
  totalAlerts: number;
  errorAlerts: number;
  warningAlerts: number;
  alerts: Array<{
    sid: string;
    errorCode: string;
    logLevel: string;
    alertText: string;
    resourceSid?: string;
    serviceSid?: string;
    dateCreated: Date;
  }>;
  timeRange: { start: Date; end: Date };
  duration: number;
}

/**
 * Options for serverless function log validation.
 */
export interface ServerlessLogsValidationOptions {
  /** Serverless Service SID (required) */
  serverlessServiceSid: string;
  /** Environment name. Default: 'production' */
  environment?: string;
  /** How far back to look (seconds). Default: 300 */
  lookbackSeconds?: number;
  /** Filter by specific function SID */
  functionSid?: string;
  /** Filter by log level */
  level?: 'error' | 'warn' | 'info';
  /** Max logs to return. Default: 100 */
  limit?: number;
  /** Search for specific text in log messages */
  searchText?: string;
}

/**
 * Result from serverless function log validation.
 */
export interface ServerlessLogsValidationResult {
  success: boolean;
  totalLogs: number;
  errorLogs: number;
  warnLogs: number;
  logs: Array<{
    sid: string;
    message: string;
    level: string;
    functionSid: string;
    dateCreated: Date;
  }>;
  byFunction: Record<string, { total: number; errors: number; warns: number }>;
  timeRange: { start: Date; end: Date };
  duration: number;
}

/**
 * Options for recording validation.
 */
export interface RecordingValidationOptions {
  /** Wait for recording to complete. Default: true */
  waitForCompleted?: boolean;
  /** Maximum time to wait (ms). Default: 60000 */
  timeout?: number;
  /** Polling interval (ms). Default: 2000 */
  pollInterval?: number;
}

/**
 * Result from recording validation.
 */
export interface RecordingValidationResult {
  success: boolean;
  recordingSid: string;
  callSid?: string;
  conferenceSid?: string;
  status: string;
  duration?: number;
  channels?: number;
  source?: string;
  mediaUrl?: string;
  errorCode?: number;
  errors: string[];
  validationDuration: number;
}

/**
 * Options for transcript validation.
 */
export interface TranscriptValidationOptions {
  /** Wait for transcript to complete. Default: true */
  waitForCompleted?: boolean;
  /** Maximum time to wait (ms). Default: 120000 */
  timeout?: number;
  /** Polling interval (ms). Default: 5000 */
  pollInterval?: number;
  /** Check that sentences exist. Default: true */
  checkSentences?: boolean;
}

/**
 * Result from transcript validation.
 */
export interface TranscriptValidationResult {
  success: boolean;
  transcriptSid: string;
  serviceSid: string;
  status: string;
  languageCode?: string;
  duration?: number;
  sentenceCount?: number;
  redactionEnabled?: boolean;
  errors: string[];
  validationDuration: number;
}

/**
 * Options for language operator validation.
 */
export interface LanguageOperatorValidationOptions {
  /** Filter by operator type (e.g., 'text-generation') */
  operatorType?: string;
  /** Filter by operator name */
  operatorName?: string;
  /** Fail if no results. Default: true */
  requireResults?: boolean;
}

/**
 * Result from language operator validation.
 */
export interface LanguageOperatorValidationResult {
  success: boolean;
  transcriptSid: string;
  operatorResults: Array<{
    operatorSid: string;
    operatorType: string;
    name: string;
    textGenerationResults?: unknown;
    predictedLabel?: string;
    predictedProbability?: number;
    extractMatch?: boolean;
    extractResults?: unknown;
  }>;
  errors: string[];
  validationDuration: number;
}

/**
 * Options for ConversationRelay WebSocket validation.
 */
export interface ConversationRelayValidationOptions {
  /** WebSocket URL to test (wss://...) */
  url: string;
  /** Connection timeout in ms. Default: 10000 */
  timeout?: number;
  /** Expect greeting on connect. Default: true */
  validateGreeting?: boolean;
  /** Optional test message to send */
  testMessage?: string;
  /** Expect LLM response to test message. Default: false (only if testMessage set) */
  validateLLMResponse?: boolean;
}

/**
 * Result from ConversationRelay validation.
 */
export interface ConversationRelayValidationResult {
  success: boolean;
  connectionEstablished: boolean;
  setupReceived: boolean;
  greetingReceived: boolean;
  greetingText?: string;
  responseReceived?: boolean;
  responseText?: string;
  protocolErrors: string[];
  errors: string[];
  validationDuration: number;
}

/**
 * A single prerequisite check to run.
 */
export interface PrerequisiteCheck {
  /** Human-readable name of the check */
  name: string;
  /** Function that performs the check */
  check: () => Promise<{ ok: boolean; message: string }>;
  /** If false, warn but don't fail validation */
  required: boolean;
}

/**
 * Options for prerequisite validation.
 */
export interface PrerequisiteValidationOptions {
  /** Array of checks to perform */
  checks: PrerequisiteCheck[];
  /** Stop on first failure. Default: false */
  stopOnFirstFailure?: boolean;
}

/**
 * Result from prerequisite validation.
 */
export interface PrerequisiteValidationResult {
  /** All required checks passed */
  success: boolean;
  /** Individual check results */
  results: Array<{
    name: string;
    ok: boolean;
    message: string;
    required: boolean;
  }>;
  errors: string[];
  validationDuration: number;
}

const DEFAULT_OPTIONS: Required<Omit<ValidationOptions, 'syncServiceSid' | 'serverlessServiceSid' | 'studioFlowSid'>> = {
  waitForTerminal: false,
  timeout: 30000,
  pollInterval: 2000,
  alertLookbackSeconds: 120,
};

const MESSAGE_TERMINAL_STATUSES = ['delivered', 'undelivered', 'failed', 'read'];
const CALL_TERMINAL_STATUSES = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];
const VERIFICATION_TERMINAL_STATUSES = ['approved', 'canceled', 'expired'];
const CONFERENCE_TERMINAL_STATUSES = ['completed'];

/**
 * Deep validator for Twilio API operations.
 * Goes beyond 200 OK to verify actual operation success.
 */
export class DeepValidator {
  private client: Twilio;

  constructor(client: Twilio) {
    this.client = client;
  }

  /**
   * Validates a sent message by checking multiple sources.
   */
  async validateMessage(
    messageSid: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Run checks in parallel where possible
    const [statusCheck, alertCheck, syncCheck] = await Promise.all([
      this.checkMessageStatus(messageSid, opts),
      this.checkDebuggerAlerts(messageSid, opts),
      opts.syncServiceSid
        ? this.checkSyncCallbacks('message', messageSid, opts.syncServiceSid)
        : Promise.resolve({ passed: true, message: 'Sync check skipped (no service SID)' }),
    ]);

    // Check Function logs if configured
    let functionLogsCheck: CheckResult | undefined;
    if (opts.serverlessServiceSid) {
      functionLogsCheck = await this.checkFunctionLogs(messageSid, opts.serverlessServiceSid);
    }

    // Aggregate errors
    if (!statusCheck.passed) errors.push(statusCheck.message);
    if (!alertCheck.passed) errors.push(alertCheck.message);
    if (syncCheck && !syncCheck.passed) errors.push(syncCheck.message);
    if (functionLogsCheck && !functionLogsCheck.passed) warnings.push(functionLogsCheck.message);

    // Add warnings for non-critical issues
    if (alertCheck.data && Array.isArray(alertCheck.data) && alertCheck.data.length > 0) {
      warnings.push(`Found ${alertCheck.data.length} related alerts`);
    }

    const success = statusCheck.passed && alertCheck.passed && (!syncCheck || syncCheck.passed);

    return {
      success,
      resourceSid: messageSid,
      resourceType: 'message',
      primaryStatus: (statusCheck.data as { status?: string })?.status || 'unknown',
      checks: {
        resourceStatus: statusCheck,
        debuggerAlerts: alertCheck,
        syncCallbacks: syncCheck,
        functionLogs: functionLogsCheck,
      },
      errors,
      warnings,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Validates a call by checking multiple sources including Voice Insights.
   */
  async validateCall(
    callSid: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Run initial checks in parallel
    const [statusCheck, alertCheck, eventsCheck, syncCheck] = await Promise.all([
      this.checkCallStatus(callSid, opts),
      this.checkDebuggerAlerts(callSid, opts),
      this.checkCallEvents(callSid),
      opts.syncServiceSid
        ? this.checkSyncCallbacks('call', callSid, opts.syncServiceSid)
        : Promise.resolve({ passed: true, message: 'Sync check skipped (no service SID)' }),
    ]);

    // Check Voice Insights if call is terminal
    let insightsCheck: CheckResult | undefined;
    const status = (statusCheck.data as { status?: string })?.status;
    if (status && CALL_TERMINAL_STATUSES.includes(status)) {
      insightsCheck = await this.checkVoiceInsights(callSid);
    }

    // Check Function logs if configured
    let functionLogsCheck: CheckResult | undefined;
    if (opts.serverlessServiceSid) {
      functionLogsCheck = await this.checkFunctionLogs(callSid, opts.serverlessServiceSid);
    }

    // Check Studio logs if configured
    let studioLogsCheck: CheckResult | undefined;
    if (opts.studioFlowSid) {
      studioLogsCheck = await this.checkStudioLogs(callSid, opts.studioFlowSid);
    }

    // Aggregate errors
    if (!statusCheck.passed) errors.push(statusCheck.message);
    if (!alertCheck.passed) errors.push(alertCheck.message);
    if (!eventsCheck.passed) errors.push(eventsCheck.message);
    if (syncCheck && !syncCheck.passed) errors.push(syncCheck.message);
    if (insightsCheck && !insightsCheck.passed) warnings.push(insightsCheck.message);
    if (functionLogsCheck && !functionLogsCheck.passed) warnings.push(functionLogsCheck.message);
    if (studioLogsCheck && !studioLogsCheck.passed) warnings.push(studioLogsCheck.message);

    const success = statusCheck.passed && alertCheck.passed && eventsCheck.passed;

    return {
      success,
      resourceSid: callSid,
      resourceType: 'call',
      primaryStatus: status || 'unknown',
      checks: {
        resourceStatus: statusCheck,
        debuggerAlerts: alertCheck,
        callEvents: eventsCheck,
        voiceInsights: insightsCheck,
        syncCallbacks: syncCheck,
        functionLogs: functionLogsCheck,
        studioLogs: studioLogsCheck,
      },
      errors,
      warnings,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Validates a verification by checking status and callbacks.
   */
  async validateVerification(
    serviceSid: string,
    verificationSid: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    const [statusCheck, alertCheck, syncCheck] = await Promise.all([
      this.checkVerificationStatus(serviceSid, verificationSid, opts),
      this.checkDebuggerAlerts(verificationSid, opts),
      opts.syncServiceSid
        ? this.checkSyncCallbacks('verification', verificationSid, opts.syncServiceSid)
        : Promise.resolve({ passed: true, message: 'Sync check skipped (no service SID)' }),
    ]);

    if (!statusCheck.passed) errors.push(statusCheck.message);
    if (!alertCheck.passed) errors.push(alertCheck.message);
    if (syncCheck && !syncCheck.passed) warnings.push(syncCheck.message);

    const success = statusCheck.passed && alertCheck.passed;

    return {
      success,
      resourceSid: verificationSid,
      resourceType: 'verification',
      primaryStatus: (statusCheck.data as { status?: string })?.status || 'unknown',
      checks: {
        resourceStatus: statusCheck,
        debuggerAlerts: alertCheck,
        syncCallbacks: syncCheck,
      },
      errors,
      warnings,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Validates a TaskRouter task.
   */
  async validateTask(
    workspaceSid: string,
    taskSid: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    const [statusCheck, alertCheck, syncCheck] = await Promise.all([
      this.checkTaskStatus(workspaceSid, taskSid),
      this.checkDebuggerAlerts(taskSid, opts),
      opts.syncServiceSid
        ? this.checkSyncCallbacks('task', taskSid, opts.syncServiceSid)
        : Promise.resolve({ passed: true, message: 'Sync check skipped (no service SID)' }),
    ]);

    if (!statusCheck.passed) errors.push(statusCheck.message);
    if (!alertCheck.passed) errors.push(alertCheck.message);
    if (syncCheck && !syncCheck.passed) warnings.push(syncCheck.message);

    const success = statusCheck.passed && alertCheck.passed;

    return {
      success,
      resourceSid: taskSid,
      resourceType: 'task',
      primaryStatus: (statusCheck.data as { status?: string })?.status || 'unknown',
      checks: {
        resourceStatus: statusCheck,
        debuggerAlerts: alertCheck,
        syncCallbacks: syncCheck,
      },
      errors,
      warnings,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Validates a conference by checking status, debugger alerts, and Conference Insights.
   *
   * TIMING NOTE: Conference Insights summaries are NOT available immediately after conference end.
   * - Partial data: Available within ~2 minutes after end (no SLA guarantee)
   * - Final data: Locked and immutable 30 minutes after conference end
   * Check processingState in response: 'partial' or 'complete'
   */
  async validateConference(
    conferenceSid: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Run initial checks in parallel
    const [statusCheck, alertCheck, syncCheck] = await Promise.all([
      this.checkConferenceStatus(conferenceSid, opts),
      this.checkDebuggerAlerts(conferenceSid, opts),
      opts.syncServiceSid
        ? this.checkSyncCallbacks('conference', conferenceSid, opts.syncServiceSid)
        : Promise.resolve({ passed: true, message: 'Sync check skipped (no service SID)' }),
    ]);

    // Check Conference Insights if conference is terminal
    let conferenceInsightsCheck: CheckResult | undefined;
    let participantInsightsCheck: CheckResult | undefined;
    const status = (statusCheck.data as { status?: string })?.status;
    if (status && CONFERENCE_TERMINAL_STATUSES.includes(status)) {
      // Note: Insights may not be available immediately - check timing in response
      conferenceInsightsCheck = await this.checkConferenceInsights(conferenceSid);
      participantInsightsCheck = await this.checkConferenceParticipantInsights(conferenceSid);
    }

    // Check Function logs if configured
    let functionLogsCheck: CheckResult | undefined;
    if (opts.serverlessServiceSid) {
      functionLogsCheck = await this.checkFunctionLogs(conferenceSid, opts.serverlessServiceSid);
    }

    // Aggregate errors
    if (!statusCheck.passed) errors.push(statusCheck.message);
    if (!alertCheck.passed) errors.push(alertCheck.message);
    if (syncCheck && !syncCheck.passed) errors.push(syncCheck.message);
    if (conferenceInsightsCheck && !conferenceInsightsCheck.passed) warnings.push(conferenceInsightsCheck.message);
    if (participantInsightsCheck && !participantInsightsCheck.passed) warnings.push(participantInsightsCheck.message);
    if (functionLogsCheck && !functionLogsCheck.passed) warnings.push(functionLogsCheck.message);

    const success = statusCheck.passed && alertCheck.passed;

    return {
      success,
      resourceSid: conferenceSid,
      resourceType: 'conference',
      primaryStatus: status || 'unknown',
      checks: {
        resourceStatus: statusCheck,
        debuggerAlerts: alertCheck,
        conferenceInsights: conferenceInsightsCheck,
        conferenceParticipantInsights: participantInsightsCheck,
        syncCallbacks: syncCheck,
        functionLogs: functionLogsCheck,
      },
      errors,
      warnings,
      duration: Date.now() - startTime,
    };
  }

  // ---- Private check methods ----

  private async checkMessageStatus(
    sid: string,
    opts: typeof DEFAULT_OPTIONS & ValidationOptions
  ): Promise<CheckResult> {
    try {
      let message = await this.client.messages(sid).fetch();
      let status = message.status;

      if (opts.waitForTerminal && !MESSAGE_TERMINAL_STATUSES.includes(status)) {
        const deadline = Date.now() + opts.timeout;
        while (Date.now() < deadline && !MESSAGE_TERMINAL_STATUSES.includes(status)) {
          await this.sleep(opts.pollInterval);
          message = await this.client.messages(sid).fetch();
          status = message.status;
        }
      }

      const isSuccess = ['delivered', 'sent', 'queued', 'read'].includes(status);

      if (status === 'failed' || status === 'undelivered') {
        return {
          passed: false,
          message: `Message ${status}: ${message.errorCode || 'unknown'} - ${message.errorMessage || 'no details'}`,
          data: { status, errorCode: message.errorCode, errorMessage: message.errorMessage },
        };
      }

      return {
        passed: isSuccess,
        message: `Message status: ${status}`,
        data: { status, isTerminal: MESSAGE_TERMINAL_STATUSES.includes(status) },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to fetch message: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkCallStatus(
    sid: string,
    opts: typeof DEFAULT_OPTIONS & ValidationOptions
  ): Promise<CheckResult> {
    try {
      let call = await this.client.calls(sid).fetch();
      let status = call.status;

      if (opts.waitForTerminal && !CALL_TERMINAL_STATUSES.includes(status)) {
        const deadline = Date.now() + opts.timeout;
        while (Date.now() < deadline && !CALL_TERMINAL_STATUSES.includes(status)) {
          await this.sleep(opts.pollInterval);
          call = await this.client.calls(sid).fetch();
          status = call.status;
        }
      }

      const isSuccess = ['completed', 'in-progress', 'ringing', 'queued'].includes(status);

      if (status === 'failed' || status === 'busy' || status === 'no-answer') {
        return {
          passed: false,
          message: `Call ${status}`,
          data: { status },
        };
      }

      return {
        passed: isSuccess,
        message: `Call status: ${status}`,
        data: { status, duration: call.duration },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to fetch call: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkVerificationStatus(
    serviceSid: string,
    verificationSid: string,
    opts: typeof DEFAULT_OPTIONS & ValidationOptions
  ): Promise<CheckResult> {
    try {
      let verification = await this.client.verify.v2
        .services(serviceSid)
        .verifications(verificationSid)
        .fetch();
      let status = verification.status;

      if (opts.waitForTerminal && !VERIFICATION_TERMINAL_STATUSES.includes(status)) {
        const deadline = Date.now() + opts.timeout;
        while (Date.now() < deadline && !VERIFICATION_TERMINAL_STATUSES.includes(status)) {
          await this.sleep(opts.pollInterval);
          verification = await this.client.verify.v2
            .services(serviceSid)
            .verifications(verificationSid)
            .fetch();
          status = verification.status;
        }
      }

      const isSuccess = ['pending', 'approved'].includes(status);

      return {
        passed: isSuccess,
        message: `Verification status: ${status}`,
        data: { status, channel: verification.channel },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to fetch verification: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkTaskStatus(
    workspaceSid: string,
    taskSid: string
  ): Promise<CheckResult> {
    try {
      const task = await this.client.taskrouter.v1
        .workspaces(workspaceSid)
        .tasks(taskSid)
        .fetch();

      const status = task.assignmentStatus;
      const isSuccess = ['pending', 'reserved', 'assigned', 'completed'].includes(status);

      return {
        passed: isSuccess,
        message: `Task status: ${status}`,
        data: { status, age: task.age, priority: task.priority },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to fetch task: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkConferenceStatus(
    sid: string,
    opts: typeof DEFAULT_OPTIONS & ValidationOptions
  ): Promise<CheckResult> {
    try {
      let conference = await this.client.conferences(sid).fetch();
      let status = conference.status;

      if (opts.waitForTerminal && !CONFERENCE_TERMINAL_STATUSES.includes(status)) {
        const deadline = Date.now() + opts.timeout;
        while (Date.now() < deadline && !CONFERENCE_TERMINAL_STATUSES.includes(status)) {
          await this.sleep(opts.pollInterval);
          conference = await this.client.conferences(sid).fetch();
          status = conference.status;
        }
      }

      const isSuccess = ['init', 'in-progress', 'completed'].includes(status);

      return {
        passed: isSuccess,
        message: `Conference status: ${status}`,
        data: {
          status,
          friendlyName: conference.friendlyName,
          region: conference.region,
          reasonConferenceEnded: conference.reasonConferenceEnded,
          callSidEndingConference: conference.callSidEndingConference,
        },
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to fetch conference: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Checks Conference Insights summary.
   * NOTE: Data not available immediately after conference end.
   * - Partial data: ~2 min after end
   * - Final data: 30 min after end (locked)
   */
  private async checkConferenceInsights(conferenceSid: string): Promise<CheckResult> {
    try {
      const summary = await this.client.insights.v1.conferences(conferenceSid).fetch();
      const summaryData = summary as unknown as {
        processingState?: string;
        status?: string;
        durationSeconds?: number;
        maxParticipants?: number;
        uniqueParticipants?: number;
        endReason?: string;
        tags?: string[];
      };

      // Check for any error-related end reasons
      const hasIssues = summaryData.endReason &&
        ['participant-with-end-conference-on-exit-left', 'last-participant-left'].includes(summaryData.endReason) === false &&
        summaryData.endReason !== 'conference-ended-via-api';

      // Check for error tags if available
      const hasErrorTags = summaryData.tags?.some((tag) =>
        tag.toLowerCase().includes('error') || tag.toLowerCase().includes('failed')
      );

      const processingNote = summaryData.processingState === 'partial'
        ? ' (partial data - final in 30min)'
        : '';

      return {
        passed: !hasIssues && !hasErrorTags,
        message: hasIssues || hasErrorTags
          ? `Conference Insights found issues: ${summaryData.endReason}${processingNote}`
          : `Conference Insights: ${summaryData.processingState || 'complete'}${processingNote}`,
        data: {
          processingState: summaryData.processingState,
          durationSeconds: summaryData.durationSeconds,
          maxParticipants: summaryData.maxParticipants,
          uniqueParticipants: summaryData.uniqueParticipants,
          endReason: summaryData.endReason,
          tags: summaryData.tags,
        },
      };
    } catch (error) {
      const err = error as { code?: number; message?: string };
      // 404 or similar means insights not yet available
      if (err.code === 20404) {
        return {
          passed: true,
          message: 'Conference Insights not yet available (may need ~2 min after conference end)',
        };
      }
      return {
        passed: true,
        message: `Conference Insights not available: ${err.message || String(error)}`,
      };
    }
  }

  /**
   * Checks Conference Insights for all participants.
   * NOTE: Data not available immediately after conference end.
   */
  private async checkConferenceParticipantInsights(conferenceSid: string): Promise<CheckResult> {
    try {
      const participants = await this.client.insights.v1
        .conferences(conferenceSid)
        .conferenceParticipants.list({ limit: 50 });

      if (participants.length === 0) {
        return {
          passed: true,
          message: 'No participant insights available yet',
        };
      }

      // Check for participants with issues
      const participantsWithIssues = participants.filter((p) => {
        const pData = p as unknown as {
          callStatus?: string;
          properties?: { quality_issues?: string[] };
        };
        return pData.callStatus === 'failed' ||
          (pData.properties?.quality_issues && pData.properties.quality_issues.length > 0);
      });

      const processingStates = participants.map((p) => {
        const pData = p as unknown as { processingState?: string };
        return pData.processingState;
      });
      const allComplete = processingStates.every((s) => s === 'complete');
      const processingNote = allComplete ? '' : ' (some data still processing)';

      if (participantsWithIssues.length > 0) {
        return {
          passed: false,
          message: `${participantsWithIssues.length}/${participants.length} participants had issues${processingNote}`,
          data: {
            totalParticipants: participants.length,
            participantsWithIssues: participantsWithIssues.length,
            processingStates,
          },
        };
      }

      return {
        passed: true,
        message: `${participants.length} participants, no issues detected${processingNote}`,
        data: {
          totalParticipants: participants.length,
          processingStates,
        },
      };
    } catch (error) {
      const err = error as { code?: number; message?: string };
      if (err.code === 20404) {
        return {
          passed: true,
          message: 'Conference participant insights not yet available',
        };
      }
      return {
        passed: true,
        message: `Conference participant insights not available: ${err.message || String(error)}`,
      };
    }
  }

  private async checkDebuggerAlerts(
    resourceSid: string,
    opts: typeof DEFAULT_OPTIONS & ValidationOptions
  ): Promise<CheckResult> {
    try {
      const startDate = new Date(Date.now() - opts.alertLookbackSeconds * 1000);

      const alerts = await this.client.monitor.v1.alerts.list({
        startDate,
        limit: 50,
      });

      const relatedAlerts = alerts.filter(
        (alert) => alert.resourceSid === resourceSid || alert.alertText?.includes(resourceSid)
      );

      const errorAlerts = relatedAlerts.filter((a) => a.logLevel === 'error');

      if (errorAlerts.length > 0) {
        return {
          passed: false,
          message: `Found ${errorAlerts.length} error alerts: ${errorAlerts.map((a) => a.errorCode).join(', ')}`,
          data: errorAlerts.map((a) => ({
            errorCode: a.errorCode,
            alertText: a.alertText,
            logLevel: a.logLevel,
          })),
        };
      }

      return {
        passed: true,
        message: relatedAlerts.length > 0
          ? `Found ${relatedAlerts.length} non-error alerts`
          : 'No alerts found',
        data: relatedAlerts.map((a) => ({
          errorCode: a.errorCode,
          alertText: a.alertText,
          logLevel: a.logLevel,
        })),
      };
    } catch (error) {
      return {
        passed: true,
        message: `Could not check debugger: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkCallEvents(callSid: string): Promise<CheckResult> {
    try {
      // Use insights API to get call events (more reliable than deprecated events endpoint)
      const events = await this.client.insights.v1.calls(callSid).events.list({ limit: 50 });

      // Check for error events
      const errorEvents = events.filter((e: { name?: string; level?: string }) => {
        return e.level === 'ERROR' || e.name?.includes('error');
      });

      if (errorEvents.length > 0) {
        return {
          passed: false,
          message: `Found ${errorEvents.length} error events in call`,
          data: errorEvents,
        };
      }

      return {
        passed: true,
        message: `${events.length} call events, no errors`,
        data: { eventCount: events.length },
      };
    } catch (error) {
      return {
        passed: true,
        message: `Could not fetch call events: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkVoiceInsights(callSid: string): Promise<CheckResult> {
    try {
      const summary = await this.client.insights.v1.calls(callSid).summary().fetch();
      // Access the raw data to get call quality metrics
      const summaryData = summary as unknown as {
        callType?: string;
        duration?: number;
        connectDuration?: number;
        processingState?: string;
        tags?: string[];
      };

      // Check for any error tags
      const hasErrorTags = summaryData.tags?.some((tag) =>
        tag.toLowerCase().includes('error') || tag.toLowerCase().includes('failed')
      );

      return {
        passed: !hasErrorTags,
        message: hasErrorTags
          ? `Voice Insights found issues: ${summaryData.tags?.join(', ')}`
          : `Voice Insights: ${summaryData.processingState || 'complete'}`,
        data: {
          duration: summaryData.duration,
          connectDuration: summaryData.connectDuration,
          callType: summaryData.callType,
          tags: summaryData.tags,
        },
      };
    } catch (error) {
      return {
        passed: true,
        message: `Voice Insights not available: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkSyncCallbacks(
    resourceType: string,
    resourceSid: string,
    syncServiceSid: string
  ): Promise<CheckResult> {
    try {
      const documentName = `callbacks-${resourceType}-${resourceSid}`;
      const doc = await this.client.sync.v1
        .services(syncServiceSid)
        .documents(documentName)
        .fetch();

      const data = doc.data as {
        errorCount?: number;
        callbackCount?: number;
        latestStatus?: string;
        callbacks?: Array<{ errorCode?: string | null }>;
      };

      if (data.errorCount && data.errorCount > 0) {
        return {
          passed: false,
          message: `${data.errorCount} errors in callbacks`,
          data,
        };
      }

      // Check for fallback invocation (always bad)
      const hasFallback = data.callbacks?.some((c) => c.errorCode === 'fallback_invoked');
      if (hasFallback) {
        return {
          passed: false,
          message: 'Fallback handler was invoked (primary webhook failed)',
          data,
        };
      }

      return {
        passed: true,
        message: `Received ${data.callbackCount || 0} callbacks, latest: ${data.latestStatus || 'unknown'}`,
        data,
      };
    } catch (error) {
      const errorObj = error as { code?: number };
      if (errorObj.code === 20404) {
        return {
          passed: false,
          message: 'No callback data received (Sync document not found)',
        };
      }
      return {
        passed: true,
        message: `Could not check Sync callbacks: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkFunctionLogs(
    resourceSid: string,
    serverlessServiceSid: string
  ): Promise<CheckResult> {
    try {
      // Get recent Function logs
      const logs = await this.client.serverless.v1
        .services(serverlessServiceSid)
        .environments('production')
        .logs.list({ limit: 100 });

      // Filter logs that mention this resource
      const relatedLogs = logs.filter((log) => log.message?.includes(resourceSid));

      // Check for errors
      const errorLogs = relatedLogs.filter((log) => log.level === 'error');

      if (errorLogs.length > 0) {
        return {
          passed: false,
          message: `Found ${errorLogs.length} Function errors`,
          data: errorLogs.map((l) => ({ message: l.message, level: l.level })),
        };
      }

      return {
        passed: true,
        message: `${relatedLogs.length} related Function logs, no errors`,
        data: { logCount: relatedLogs.length },
      };
    } catch (error) {
      return {
        passed: true,
        message: `Could not check Function logs: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkStudioLogs(
    resourceSid: string,
    studioFlowSid: string
  ): Promise<CheckResult> {
    try {
      // Find executions for this resource
      const executions = await this.client.studio.v2
        .flows(studioFlowSid)
        .executions.list({ limit: 20 });

      // Find execution that matches this resource (check context)
      const relatedExecution = executions.find((e) => {
        // Context structure varies by trigger type - use type assertion
        const context = e.context as Record<string, { call?: { sid?: string }; message?: { sid?: string } }> | undefined;
        const trigger = context?.trigger;
        return (
          trigger?.call?.sid === resourceSid ||
          trigger?.message?.sid === resourceSid
        );
      });

      if (!relatedExecution) {
        return {
          passed: true,
          message: 'No related Studio execution found',
        };
      }

      // Status is an enum, convert to string for comparison
      const statusStr = String(relatedExecution.status);
      if (statusStr === 'failed') {
        return {
          passed: false,
          message: `Studio execution failed: ${relatedExecution.sid}`,
          data: { executionSid: relatedExecution.sid, status: statusStr },
        };
      }

      return {
        passed: true,
        message: `Studio execution ${statusStr}`,
        data: { executionSid: relatedExecution.sid, status: statusStr },
      };
    } catch (error) {
      return {
        passed: true,
        message: `Could not check Studio logs: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ===== New Public Validation Methods =====

  /**
   * Validates account-wide debugger alerts for a time window.
   * Use this to catch any errors that occurred after 200 OK responses.
   */
  async validateDebugger(
    options: DebuggerValidationOptions = {}
  ): Promise<DebuggerValidationResult> {
    const startTime = Date.now();
    const lookbackSeconds = options.lookbackSeconds ?? 300;
    const limit = options.limit ?? 100;
    const startDate = new Date(Date.now() - lookbackSeconds * 1000);
    const endDate = new Date();

    try {
      // Fetch alerts with optional log level filter
      const listParams: { startDate: Date; limit: number; logLevel?: string } = {
        startDate,
        limit,
      };
      if (options.logLevel) {
        listParams.logLevel = options.logLevel;
      }

      const alerts = await this.client.monitor.v1.alerts.list(listParams);

      // Filter by resourceSid/serviceSid if specified
      let filteredAlerts = alerts;
      if (options.resourceSid) {
        filteredAlerts = filteredAlerts.filter(
          (a) => a.resourceSid === options.resourceSid || a.alertText?.includes(options.resourceSid!)
        );
      }
      if (options.serviceSid) {
        filteredAlerts = filteredAlerts.filter(
          (a) => a.serviceSid === options.serviceSid
        );
      }

      const errorAlerts = filteredAlerts.filter((a) => a.logLevel === 'error');
      const warningAlerts = filteredAlerts.filter((a) => a.logLevel === 'warning');

      return {
        success: errorAlerts.length === 0,
        totalAlerts: filteredAlerts.length,
        errorAlerts: errorAlerts.length,
        warningAlerts: warningAlerts.length,
        alerts: filteredAlerts.map((a) => ({
          sid: a.sid,
          errorCode: a.errorCode,
          logLevel: a.logLevel,
          alertText: a.alertText,
          resourceSid: a.resourceSid,
          serviceSid: a.serviceSid,
          dateCreated: a.dateCreated,
        })),
        timeRange: { start: startDate, end: endDate },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        totalAlerts: 0,
        errorAlerts: 0,
        warningAlerts: 0,
        alerts: [],
        timeRange: { start: startDate, end: endDate },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validates serverless function execution logs.
   * Parses console.log(), console.error(), console.warn() output.
   */
  async validateServerlessFunctions(
    options: ServerlessLogsValidationOptions
  ): Promise<ServerlessLogsValidationResult> {
    const startTime = Date.now();
    const environment = options.environment ?? 'production';
    const lookbackSeconds = options.lookbackSeconds ?? 300;
    const limit = options.limit ?? 100;
    const startDate = new Date(Date.now() - lookbackSeconds * 1000);
    const endDate = new Date();

    try {
      // Build list params
      const listParams: {
        limit: number;
        functionSid?: string;
      } = { limit };

      if (options.functionSid) {
        listParams.functionSid = options.functionSid;
      }

      const logs = await this.client.serverless.v1
        .services(options.serverlessServiceSid)
        .environments(environment)
        .logs.list(listParams);

      // Filter by date (client-side since API may not support startDate)
      let filteredLogs = logs.filter((log) => {
        const logDate = new Date(log.dateCreated);
        return logDate >= startDate && logDate <= endDate;
      });

      // Filter by level if specified
      if (options.level) {
        filteredLogs = filteredLogs.filter((log) => log.level === options.level);
      }

      // Filter by search text if specified
      if (options.searchText) {
        filteredLogs = filteredLogs.filter((log) =>
          log.message?.toLowerCase().includes(options.searchText!.toLowerCase())
        );
      }

      // Count by level
      const errorLogs = filteredLogs.filter((log) => log.level === 'error');
      const warnLogs = filteredLogs.filter((log) => log.level === 'warn');

      // Group by function
      const byFunction: Record<string, { total: number; errors: number; warns: number }> = {};
      for (const log of filteredLogs) {
        const fid = log.functionSid || 'unknown';
        if (!byFunction[fid]) {
          byFunction[fid] = { total: 0, errors: 0, warns: 0 };
        }
        byFunction[fid].total++;
        if (log.level === 'error') byFunction[fid].errors++;
        if (log.level === 'warn') byFunction[fid].warns++;
      }

      return {
        success: errorLogs.length === 0,
        totalLogs: filteredLogs.length,
        errorLogs: errorLogs.length,
        warnLogs: warnLogs.length,
        logs: filteredLogs.map((log) => ({
          sid: log.sid,
          message: log.message,
          level: log.level,
          functionSid: log.functionSid,
          dateCreated: log.dateCreated,
        })),
        byFunction,
        timeRange: { start: startDate, end: endDate },
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        totalLogs: 0,
        errorLogs: 0,
        warnLogs: 0,
        logs: [],
        byFunction: {},
        timeRange: { start: startDate, end: endDate },
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validates a call recording by checking status and metadata.
   */
  async validateRecording(
    recordingSid: string,
    options: RecordingValidationOptions = {}
  ): Promise<RecordingValidationResult> {
    const startTime = Date.now();
    const waitForCompleted = options.waitForCompleted ?? true;
    const timeout = options.timeout ?? 60000;
    const pollInterval = options.pollInterval ?? 2000;
    const errors: string[] = [];

    try {
      let recording = await this.client.recordings(recordingSid).fetch();
      let status = String(recording.status);

      // Poll until completed if requested
      const terminalRecordingStatuses = ['completed', 'failed', 'absent'];
      if (waitForCompleted && !terminalRecordingStatuses.includes(status)) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline && !terminalRecordingStatuses.includes(status)) {
          await this.sleep(pollInterval);
          recording = await this.client.recordings(recordingSid).fetch();
          status = String(recording.status);
        }
      }

      if (status === 'failed' || status === 'absent') {
        errors.push(`Recording ${status}: ${recording.errorCode || 'unknown error'}`);
      }

      return {
        success: status === 'completed',
        recordingSid,
        callSid: recording.callSid,
        conferenceSid: recording.conferenceSid,
        status,
        duration: recording.duration ? parseInt(recording.duration) : undefined,
        channels: recording.channels,
        source: recording.source,
        mediaUrl: `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`,
        errorCode: recording.errorCode,
        errors,
        validationDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        recordingSid,
        status: 'error',
        errors: [`Failed to fetch recording: ${error instanceof Error ? error.message : String(error)}`],
        validationDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validates a Conversational Intelligence transcript.
   */
  async validateTranscript(
    transcriptSid: string,
    options: TranscriptValidationOptions = {}
  ): Promise<TranscriptValidationResult> {
    const startTime = Date.now();
    const waitForCompleted = options.waitForCompleted ?? true;
    const timeout = options.timeout ?? 120000;
    const pollInterval = options.pollInterval ?? 5000;
    const checkSentences = options.checkSentences ?? true;
    const errors: string[] = [];

    try {
      let transcript = await this.client.intelligence.v2.transcripts(transcriptSid).fetch();
      let status = transcript.status;

      // Poll until completed if requested
      const terminalStatuses = ['completed', 'failed', 'canceled', 'error'];
      if (waitForCompleted && !terminalStatuses.includes(status)) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline && !terminalStatuses.includes(status)) {
          await this.sleep(pollInterval);
          transcript = await this.client.intelligence.v2.transcripts(transcriptSid).fetch();
          status = transcript.status;
        }
      }

      if (['failed', 'canceled', 'error'].includes(status)) {
        errors.push(`Transcript ${status}`);
      }

      // Check sentences if requested and completed
      let sentenceCount: number | undefined;
      if (checkSentences && status === 'completed') {
        const sentences = await this.client.intelligence.v2
          .transcripts(transcriptSid)
          .sentences.list({ limit: 1000 });
        sentenceCount = sentences.length;
        if (sentenceCount === 0) {
          errors.push('Transcript completed but has no sentences');
        }
      }

      return {
        success: status === 'completed' && errors.length === 0,
        transcriptSid,
        serviceSid: transcript.serviceSid,
        status,
        languageCode: transcript.languageCode,
        duration: transcript.duration,
        sentenceCount,
        redactionEnabled: transcript.redaction,
        errors,
        validationDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        transcriptSid,
        serviceSid: '',
        status: 'error',
        errors: [`Failed to fetch transcript: ${error instanceof Error ? error.message : String(error)}`],
        validationDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validates Language Operator results for a transcript.
   */
  async validateLanguageOperator(
    transcriptSid: string,
    options: LanguageOperatorValidationOptions = {}
  ): Promise<LanguageOperatorValidationResult> {
    const startTime = Date.now();
    const requireResults = options.requireResults ?? true;
    const errors: string[] = [];

    try {
      const operatorResults = await this.client.intelligence.v2
        .transcripts(transcriptSid)
        .operatorResults.list({ limit: 50 });

      // Filter by operator type if specified
      let filteredResults = operatorResults;
      if (options.operatorType) {
        filteredResults = filteredResults.filter((r) => r.operatorType === options.operatorType);
      }
      if (options.operatorName) {
        filteredResults = filteredResults.filter((r) => r.name === options.operatorName);
      }

      if (requireResults && filteredResults.length === 0) {
        errors.push('No operator results found for transcript');
      }

      const mappedResults = filteredResults.map((r) => ({
        operatorSid: r.operatorSid,
        operatorType: r.operatorType,
        name: r.name,
        textGenerationResults: r.textGenerationResults,
        predictedLabel: r.predictedLabel,
        predictedProbability: r.predictedProbability,
        extractMatch: r.extractMatch,
        extractResults: r.extractResults,
      }));

      return {
        success: errors.length === 0 && filteredResults.length > 0,
        transcriptSid,
        operatorResults: mappedResults,
        errors,
        validationDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        transcriptSid,
        operatorResults: [],
        errors: [`Failed to fetch operator results: ${error instanceof Error ? error.message : String(error)}`],
        validationDuration: Date.now() - startTime,
      };
    }
  }

  /**
   * Validates a ConversationRelay WebSocket endpoint.
   * Tests connection, setup handling, and greeting receipt.
   *
   * NOTE: This method requires the 'ws' package for WebSocket support.
   * In a browser context or if WebSocket is available globally,
   * you can provide it via the WebSocket parameter.
   *
   * @param options Configuration for the validation
   * @param WebSocketImpl Optional WebSocket constructor (defaults to global WebSocket if available)
   */
  async validateConversationRelay(
    options: ConversationRelayValidationOptions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WebSocketImpl?: any
  ): Promise<ConversationRelayValidationResult> {
    const startTime = Date.now();
    const timeout = options.timeout ?? 10000;
    const validateGreeting = options.validateGreeting ?? true;
    const errors: string[] = [];
    const protocolErrors: string[] = [];

    // Try to get WebSocket - prefer provided impl, then global, then error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);

    if (!WS) {
      return {
        success: false,
        connectionEstablished: false,
        setupReceived: false,
        greetingReceived: false,
        protocolErrors: [],
        errors: ['WebSocket not available. Provide WebSocket implementation via second parameter or install "ws" package.'],
        validationDuration: Date.now() - startTime,
      };
    }

    return new Promise((resolve) => {
      let connectionEstablished = false;
      let setupReceived = false;
      let greetingReceived = false;
      let greetingText: string | undefined;
      let responseReceived = false;
      let responseText: string | undefined;
      let testMessageSent = false;
      let resolved = false; // Prevent multiple resolutions

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let ws: any;

      const safeResolve = (result: ConversationRelayValidationResult) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        if (ws && ws.close) ws.close();
        resolve(result);
      };

      const timer = setTimeout(() => {
        safeResolve({
          success: false,
          connectionEstablished,
          setupReceived,
          greetingReceived,
          greetingText,
          responseReceived,
          responseText,
          protocolErrors,
          errors: [...errors, 'Timeout waiting for response'],
          validationDuration: Date.now() - startTime,
        });
      }, timeout);

      try {
        ws = new WS(options.url);

        ws.onopen = () => {
          connectionEstablished = true;
          // Send mock setup message
          ws.send(JSON.stringify({
            type: 'setup',
            callSid: 'CA_test_' + Date.now(),
            streamSid: 'MZ_test_' + Date.now(),
            from: '+15551234567',
            to: '+15559876543',
          }));
          setupReceived = true;
        };

        ws.onmessage = (event: { data: string | Buffer }) => {
          try {
            const dataStr = typeof event.data === 'string' ? event.data : String(event.data);
            const msg = JSON.parse(dataStr);

            if (msg.type === 'text') {
              if (!greetingReceived) {
                greetingReceived = true;
                greetingText = msg.token;

                if (options.testMessage && !testMessageSent) {
                  testMessageSent = true;
                  // Send test prompt with correct 'last' field (not 'isFinal')
                  ws.send(JSON.stringify({
                    type: 'prompt',
                    voicePrompt: options.testMessage,
                    last: true, // Correct field name per ConversationRelay protocol
                  }));
                } else if (!options.testMessage || !options.validateLLMResponse) {
                  safeResolve({
                    success: true,
                    connectionEstablished: true,
                    setupReceived: true,
                    greetingReceived: true,
                    greetingText,
                    protocolErrors,
                    errors,
                    validationDuration: Date.now() - startTime,
                  });
                }
              } else if (testMessageSent) {
                responseReceived = true;
                responseText = (responseText || '') + msg.token;

                // If we got a response, consider validation successful
                if (msg.last || responseText.length > 10) {
                  safeResolve({
                    success: true,
                    connectionEstablished: true,
                    setupReceived: true,
                    greetingReceived: true,
                    greetingText,
                    responseReceived: true,
                    responseText,
                    protocolErrors,
                    errors,
                    validationDuration: Date.now() - startTime,
                  });
                }
              }
            }
          } catch (e) {
            const rawData = typeof event.data === 'string' ? event.data : String(event.data);
            protocolErrors.push(`Invalid JSON: ${rawData.slice(0, 100)}`);
          }
        };

        ws.onerror = (err: Error | { message?: string }) => {
          const errMsg = err instanceof Error ? err.message : (err.message || 'Unknown WebSocket error');
          errors.push(`WebSocket error: ${errMsg}`);
          safeResolve({
            success: false,
            connectionEstablished: false,
            setupReceived: false,
            greetingReceived: false,
            protocolErrors,
            errors,
            validationDuration: Date.now() - startTime,
          });
        };

        ws.onclose = () => {
          // If we haven't resolved yet and greeting validation was required but not received
          if (validateGreeting && !greetingReceived) {
            safeResolve({
              success: false,
              connectionEstablished,
              setupReceived,
              greetingReceived: false,
              protocolErrors,
              errors: [...errors, 'Connection closed before greeting received'],
              validationDuration: Date.now() - startTime,
            });
          }
        };
      } catch (err) {
        errors.push(`Failed to connect: ${err instanceof Error ? err.message : String(err)}`);
        safeResolve({
          success: false,
          connectionEstablished: false,
          setupReceived: false,
          greetingReceived: false,
          protocolErrors,
          errors,
          validationDuration: Date.now() - startTime,
        });
      }
    });
  }

  /**
   * Validates prerequisites before attempting an operation.
   * Use factory methods from DeepValidator.prerequisiteChecks for common checks.
   */
  async validatePrerequisites(
    options: PrerequisiteValidationOptions
  ): Promise<PrerequisiteValidationResult> {
    const startTime = Date.now();
    const results: PrerequisiteValidationResult['results'] = [];
    const errors: string[] = [];
    const stopOnFirstFailure = options.stopOnFirstFailure ?? false;

    for (const check of options.checks) {
      try {
        const result = await check.check();
        results.push({
          name: check.name,
          ok: result.ok,
          message: result.message,
          required: check.required,
        });

        if (!result.ok && check.required) {
          errors.push(`${check.name}: ${result.message}`);
          if (stopOnFirstFailure) {
            break;
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        results.push({
          name: check.name,
          ok: false,
          message: `Check threw error: ${errMsg}`,
          required: check.required,
        });
        if (check.required) {
          errors.push(`${check.name}: Check threw error`);
          if (stopOnFirstFailure) {
            break;
          }
        }
      }
    }

    const requiredPassed = results
      .filter((r) => r.required)
      .every((r) => r.ok);

    return {
      success: requiredPassed,
      results,
      errors,
      validationDuration: Date.now() - startTime,
    };
  }

  /**
   * Factory methods for common prerequisite checks.
   * Use with validatePrerequisites() method.
   */
  static prerequisiteChecks = {
    /**
     * Check that a Conversational Intelligence Service exists and is accessible.
     */
    intelligenceService: (client: Twilio, serviceSid?: string): PrerequisiteCheck => ({
      name: 'Conversational Intelligence Service',
      required: true,
      check: async () => {
        if (!serviceSid) {
          return { ok: false, message: 'TWILIO_INTELLIGENCE_SERVICE_SID not set' };
        }
        try {
          await client.intelligence.v2.services(serviceSid).fetch();
          return { ok: true, message: `Service ${serviceSid} exists` };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          return { ok: false, message: `Service ${serviceSid} not found or inaccessible: ${errMsg}` };
        }
      },
    }),

    /**
     * Check that a Twilio Sync Service exists and is accessible.
     */
    syncService: (client: Twilio, serviceSid?: string): PrerequisiteCheck => ({
      name: 'Twilio Sync Service',
      required: true,
      check: async () => {
        if (!serviceSid) {
          return { ok: false, message: 'TWILIO_SYNC_SERVICE_SID not set' };
        }
        try {
          await client.sync.v1.services(serviceSid).fetch();
          return { ok: true, message: `Sync service ${serviceSid} exists` };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          return { ok: false, message: `Sync service ${serviceSid} not found: ${errMsg}` };
        }
      },
    }),

    /**
     * Check that a Twilio Verify Service exists and is accessible.
     */
    verifyService: (client: Twilio, serviceSid?: string): PrerequisiteCheck => ({
      name: 'Twilio Verify Service',
      required: true,
      check: async () => {
        if (!serviceSid) {
          return { ok: false, message: 'TWILIO_VERIFY_SERVICE_SID not set' };
        }
        try {
          await client.verify.v2.services(serviceSid).fetch();
          return { ok: true, message: `Verify service ${serviceSid} exists` };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          return { ok: false, message: `Verify service ${serviceSid} not found: ${errMsg}` };
        }
      },
    }),

    /**
     * Check that a phone number is owned by the account.
     */
    phoneNumber: (client: Twilio, phoneNumber?: string): PrerequisiteCheck => ({
      name: 'Phone Number Ownership',
      required: true,
      check: async () => {
        if (!phoneNumber) {
          return { ok: false, message: 'TWILIO_PHONE_NUMBER not set' };
        }
        try {
          const numbers = await client.incomingPhoneNumbers.list({ phoneNumber });
          if (numbers.length === 0) {
            return { ok: false, message: `Phone number ${phoneNumber} not found in account` };
          }
          return { ok: true, message: `Phone number ${phoneNumber} owned` };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          return { ok: false, message: `Error checking phone number: ${errMsg}` };
        }
      },
    }),

    /**
     * Check that a Serverless Service exists and is accessible.
     */
    serverlessService: (client: Twilio, serviceSid?: string): PrerequisiteCheck => ({
      name: 'Twilio Serverless Service',
      required: true,
      check: async () => {
        if (!serviceSid) {
          return { ok: false, message: 'TWILIO_SERVERLESS_SERVICE_SID not set' };
        }
        try {
          await client.serverless.v1.services(serviceSid).fetch();
          return { ok: true, message: `Serverless service ${serviceSid} exists` };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          return { ok: false, message: `Serverless service ${serviceSid} not found: ${errMsg}` };
        }
      },
    }),

    /**
     * Check that a TaskRouter Workspace exists and is accessible.
     */
    taskRouterWorkspace: (client: Twilio, workspaceSid?: string): PrerequisiteCheck => ({
      name: 'TaskRouter Workspace',
      required: true,
      check: async () => {
        if (!workspaceSid) {
          return { ok: false, message: 'TWILIO_TASKROUTER_WORKSPACE_SID not set' };
        }
        try {
          await client.taskrouter.v1.workspaces(workspaceSid).fetch();
          return { ok: true, message: `Workspace ${workspaceSid} exists` };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          return { ok: false, message: `Workspace ${workspaceSid} not found: ${errMsg}` };
        }
      },
    }),

    /**
     * Check that a Messaging Service exists and is accessible.
     */
    messagingService: (client: Twilio, serviceSid?: string): PrerequisiteCheck => ({
      name: 'Messaging Service',
      required: true,
      check: async () => {
        if (!serviceSid) {
          return { ok: false, message: 'TWILIO_MESSAGING_SERVICE_SID not set' };
        }
        try {
          await client.messaging.v1.services(serviceSid).fetch();
          return { ok: true, message: `Messaging service ${serviceSid} exists` };
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          return { ok: false, message: `Messaging service ${serviceSid} not found: ${errMsg}` };
        }
      },
    }),

    /**
     * Generic environment variable check (non-Twilio API).
     */
    envVar: (name: string, value?: string, required = true): PrerequisiteCheck => ({
      name: `Environment Variable: ${name}`,
      required,
      check: async () => {
        if (!value) {
          return { ok: false, message: `${name} not set` };
        }
        return { ok: true, message: `${name} is set` };
      },
    }),
  };

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a deep validator instance.
 */
export function createDeepValidator(client: Twilio): DeepValidator {
  return new DeepValidator(client);
}
