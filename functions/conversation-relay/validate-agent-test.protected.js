// ABOUTME: Validates agent-to-agent test results after call completion.
// ABOUTME: Retrieves transcripts from Sync and runs comprehensive validation.

/**
 * Agent-to-Agent Test Validator
 *
 * This function validates the results of an agent-to-agent test:
 * 1. Checks call status and duration
 * 2. Retrieves transcripts from Sync
 * 3. Validates conversation quality
 * 4. Reports pass/fail with details
 *
 * GET /validate-agent-test?sessionId=xxx&callSid=CAxxx
 *
 * Environment Variables:
 *   TWILIO_SYNC_SERVICE_SID - Sync Service SID for transcript storage
 */

exports.handler = async function (context, event, callback) {
  const client = context.getTwilioClient();
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  const sessionId = event.sessionId;
  const callSid = event.callSid;

  if (!sessionId) {
    return callback(null, {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'sessionId is required' }),
    });
  }

  console.log('=== Validating Agent-to-Agent Test ===');
  console.log(`Session ID: ${sessionId}`);
  console.log(`Call SID: ${callSid || '(not provided)'}`);

  const results = {
    success: false,
    sessionId: sessionId,
    callSid: callSid,
    validation: {
      callStatus: null,
      callDuration: null,
      agentATranscript: null,
      agentBTranscript: null,
      conversationQuality: null,
    },
    errors: [],
    warnings: [],
  };

  try {
    // 1. Check call status if callSid provided
    if (callSid) {
      try {
        const call = await client.calls(callSid).fetch();
        results.validation.callStatus = {
          status: call.status,
          duration: parseInt(call.duration || '0', 10),
          direction: call.direction,
          answeredBy: call.answeredBy,
        };

        if (call.status !== 'completed') {
          results.errors.push(`Call status is ${call.status}, expected completed`);
        }

        if (parseInt(call.duration || '0', 10) < 10) {
          results.warnings.push(`Call duration (${call.duration}s) is suspiciously short`);
        }

        // Check for call notifications (errors during call)
        const notifications = await client.calls(callSid).notifications.list({ limit: 50 });
        const errorNotifications = notifications.filter(n => {
          const logLevel = n.log;
          return logLevel === '0' || logLevel === '1'; // Error or Warning
        });

        if (errorNotifications.length > 0) {
          results.errors.push(`Call had ${errorNotifications.length} error notification(s): ${errorNotifications.map(n => n.errorCode).join(', ')}`);
        }
      } catch (error) {
        results.errors.push(`Could not fetch call: ${error.message}`);
      }
    }

    // 2. Retrieve Agent A transcript from Sync
    if (syncServiceSid) {
      const agentADocName = `agent-test-${sessionId}-agent-questioner`;
      try {
        const doc = await client.sync.v1
          .services(syncServiceSid)
          .documents(agentADocName)
          .fetch();

        results.validation.agentATranscript = {
          found: true,
          turnCount: doc.data.turnCount,
          duration: doc.data.duration,
          messageCount: doc.data.messages?.length || 0,
          testResults: doc.data.testResults,
        };
      } catch (error) {
        if (error.code === 20404) {
          results.validation.agentATranscript = { found: false };
          results.warnings.push('Agent A transcript not found in Sync');
        } else {
          results.errors.push(`Error fetching Agent A transcript: ${error.message}`);
        }
      }

      // 3. Retrieve Agent B transcript from Sync
      const agentBDocName = `agent-test-${sessionId}-agent-answerer`;
      try {
        const doc = await client.sync.v1
          .services(syncServiceSid)
          .documents(agentBDocName)
          .fetch();

        results.validation.agentBTranscript = {
          found: true,
          turnCount: doc.data.turnCount,
          duration: doc.data.duration,
          messageCount: doc.data.messages?.length || 0,
          testResults: doc.data.testResults,
        };
      } catch (error) {
        if (error.code === 20404) {
          results.validation.agentBTranscript = { found: false };
          results.warnings.push('Agent B transcript not found in Sync');
        } else {
          results.errors.push(`Error fetching Agent B transcript: ${error.message}`);
        }
      }
    } else {
      results.warnings.push('Sync not configured - transcript validation skipped');
    }

    // 4. Validate conversation quality
    const agentA = results.validation.agentATranscript;
    const agentB = results.validation.agentBTranscript;

    if (agentA?.found && agentB?.found) {
      const qualityChecks = [];

      // Check both agents had meaningful turns
      if (agentA.turnCount >= 2 && agentB.turnCount >= 2) {
        qualityChecks.push({ check: 'turn_count', passed: true });
      } else {
        qualityChecks.push({ check: 'turn_count', passed: false, reason: 'Insufficient turns' });
        results.errors.push('Conversation had insufficient turns');
      }

      // Check for errors in test results
      const agentAErrors = agentA.testResults?.errors || [];
      const agentBErrors = agentB.testResults?.errors || [];

      if (agentAErrors.length === 0 && agentBErrors.length === 0) {
        qualityChecks.push({ check: 'no_errors', passed: true });
      } else {
        qualityChecks.push({ check: 'no_errors', passed: false, reason: 'Agents reported errors' });
        results.errors.push(`Agents reported errors: ${[...agentAErrors, ...agentBErrors].join(', ')}`);
      }

      // Check duration is reasonable
      const minDuration = 10;
      const maxDuration = 300;
      const avgDuration = (agentA.duration + agentB.duration) / 2;

      if (avgDuration >= minDuration && avgDuration <= maxDuration) {
        qualityChecks.push({ check: 'duration', passed: true });
      } else {
        qualityChecks.push({ check: 'duration', passed: false, reason: `Duration ${avgDuration}s outside expected range` });
        results.warnings.push(`Conversation duration (${avgDuration}s) outside expected range`);
      }

      results.validation.conversationQuality = {
        checks: qualityChecks,
        allPassed: qualityChecks.every(c => c.passed),
      };
    }

    // Determine overall success
    results.success = results.errors.length === 0 &&
      results.validation.callStatus?.status === 'completed' &&
      (results.validation.conversationQuality?.allPassed ?? false);

    return callback(null, {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results, null, 2),
    });

  } catch (error) {
    console.log('Error validating agent test:', error.message);
    results.errors.push(error.message);

    return callback(null, {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results, null, 2),
    });
  }
};
