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
