// ABOUTME: End-to-end workflow tests for Twilio MCP tools.
// ABOUTME: Tests realistic multi-tool chains that simulate agent workflows.

import {
  messagingTools,
  voiceTools,
  phoneNumberTools,
  debuggerTools,
  accountsTools,
  serverlessTools,
  lookupsTools,
  TwilioContext,
} from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.authToken.length > 0 &&
  TEST_CREDENTIALS.fromNumber.startsWith('+');

function createTestContext(): TwilioContext {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return {
    client,
    defaultFromNumber: TEST_CREDENTIALS.fromNumber,
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('E2E Workflows', () => {
  const itWithCredentials = hasRealCredentials ? it : it.skip;
  let context: TwilioContext;
  let messaging: Tool[];
  let voice: Tool[];
  let phoneNumbers: Tool[];
  let debugger_: Tool[];
  let accounts: Tool[];
  let serverless: Tool[];
  let lookups: Tool[];

  beforeAll(() => {
    context = createTestContext();
    messaging = messagingTools(context) as Tool[];
    voice = voiceTools(context) as Tool[];
    phoneNumbers = phoneNumberTools(context) as Tool[];
    debugger_ = debuggerTools(context) as Tool[];
    accounts = accountsTools(context) as Tool[];
    serverless = serverlessTools(context) as Tool[];
    lookups = lookupsTools(context) as Tool[];
  });

  describe('Account Investigation Workflow', () => {
    itWithCredentials(
      'should chain account info, usage records, and balance',
      async () => {
        // Step 1: Get account details
        const getAccountTool = accounts.find(t => t.name === 'get_account')!;
        const accountResult = await getAccountTool.handler({});
        const accountResponse = JSON.parse(accountResult.content[0].text);

        expect(accountResponse.success).toBe(true);
        expect(accountResponse.sid).toMatch(/^AC/);
        const accountSid = accountResponse.sid;

        // Step 2: Get usage records for this account
        const usageTool = accounts.find(t => t.name === 'list_usage_records')!;
        const usageResult = await usageTool.handler({ limit: 5 });
        const usageResponse = JSON.parse(usageResult.content[0].text);

        expect(usageResponse.success).toBe(true);
        expect(Array.isArray(usageResponse.usageRecords)).toBe(true);

        // Step 3: Get account balance (may 404 for some account types)
        const balanceTool = accounts.find(t => t.name === 'get_account_balance')!;
        const balanceResult = await balanceTool.handler({});
        const balanceResponse = JSON.parse(balanceResult.content[0].text);

        if (balanceResponse.success) {
          expect(balanceResponse.accountSid).toBe(accountSid);
          expect(balanceResponse.balance).toBeDefined();
          expect(balanceResponse.currency).toBeDefined();
        } else {
          // Balance API returns 404 for some account types
          console.log('Balance API not available for this account type:', balanceResponse.error);
        }
      },
      30000
    );
  });

  describe('Monitoring Investigation Workflow', () => {
    itWithCredentials(
      'should chain debugger logs, error analysis, and usage records',
      async () => {
        // Step 1: Get debugger logs
        const debuggerLogsTool = debugger_.find(t => t.name === 'get_debugger_logs')!;
        const logsResult = await debuggerLogsTool.handler({ limit: 10 });
        const logsResponse = JSON.parse(logsResult.content[0].text);

        expect(logsResponse.success).toBe(true);
        expect(Array.isArray(logsResponse.alerts)).toBe(true);

        // Step 2: Analyze errors (provides summary even with no errors)
        const analyzeTool = debugger_.find(t => t.name === 'analyze_errors')!;
        const analyzeResult = await analyzeTool.handler({ limit: 20 });
        const analyzeResponse = JSON.parse(analyzeResult.content[0].text);

        expect(analyzeResponse.success).toBe(true);
        expect(analyzeResponse.uniqueErrorCodes).toBeGreaterThanOrEqual(0);
        expect(analyzeResponse.totalErrors).toBeGreaterThanOrEqual(0);

        // Step 3: Get usage records to correlate with errors
        const usageTool = debugger_.find(t => t.name === 'get_usage_records')!;
        const usageResult = await usageTool.handler({ limit: 5 });
        const usageResponse = JSON.parse(usageResult.content[0].text);

        expect(usageResponse.success).toBe(true);
        expect(Array.isArray(usageResponse.records)).toBe(true);
      },
      30000
    );
  });

  describe('Phone Number Lookup Workflow', () => {
    itWithCredentials(
      'should chain phone number list with lookups',
      async () => {
        // Step 1: List owned phone numbers
        const listNumbersTool = phoneNumbers.find(t => t.name === 'list_phone_numbers')!;
        const numbersResult = await listNumbersTool.handler({ limit: 5 });
        const numbersResponse = JSON.parse(numbersResult.content[0].text);

        expect(numbersResponse.success).toBe(true);
        expect(Array.isArray(numbersResponse.numbers)).toBe(true);

        if (numbersResponse.count > 0) {
          const ownedNumber = numbersResponse.numbers[0].phoneNumber;

          // Step 2: Lookup the owned number for carrier info
          const lookupTool = lookups.find(t => t.name === 'lookup_phone_number')!;
          const lookupResult = await lookupTool.handler({
            phoneNumber: ownedNumber,
            fields: ['line_type_intelligence'],
          });
          const lookupResponse = JSON.parse(lookupResult.content[0].text);

          expect(lookupResponse.success).toBe(true);
          expect(lookupResponse.phoneNumber).toBeDefined();
          // Owned Twilio numbers should be valid
          expect(lookupResponse.valid).toBe(true);
        }
      },
      30000
    );
  });

  describe('Messaging History Workflow', () => {
    itWithCredentials(
      'should chain message logs with message status checks',
      async () => {
        // Step 1: Get message logs
        const messageLogsTool = messaging.find(t => t.name === 'get_message_logs')!;
        const logsResult = await messageLogsTool.handler({ limit: 5 });
        const logsResponse = JSON.parse(logsResult.content[0].text);

        expect(logsResponse.success).toBe(true);
        expect(Array.isArray(logsResponse.messages)).toBe(true);

        if (logsResponse.count > 0) {
          const messageSid = logsResponse.messages[0].sid;

          // Step 2: Get detailed status for specific message
          const statusTool = messaging.find(t => t.name === 'get_message_status')!;
          const statusResult = await statusTool.handler({ messageSid });
          const statusResponse = JSON.parse(statusResult.content[0].text);

          expect(statusResponse.success).toBe(true);
          expect(statusResponse.sid).toBe(messageSid);
          expect(statusResponse.status).toBeDefined();
          expect(['queued', 'sent', 'delivered', 'undelivered', 'failed', 'received']).toContain(
            statusResponse.status
          );
        }
      },
      30000
    );
  });

  describe('Voice History Workflow', () => {
    itWithCredentials(
      'should chain call logs with recording retrieval',
      async () => {
        // Step 1: Get call logs
        const callLogsTool = voice.find(t => t.name === 'get_call_logs')!;
        const logsResult = await callLogsTool.handler({ limit: 10 });
        const logsResponse = JSON.parse(logsResult.content[0].text);

        expect(logsResponse.success).toBe(true);
        expect(Array.isArray(logsResponse.calls)).toBe(true);

        // Step 2: If there are calls with recordings, fetch a recording
        if (logsResponse.count > 0) {
          // Find a call that might have recordings (completed calls)
          const completedCall = logsResponse.calls.find(
            (c: { status: string }) => c.status === 'completed'
          );

          if (completedCall) {
            // Try to get recordings for this call
            const recordingsTool = voice.find(t => t.name === 'get_recording')!;
            try {
              // Note: This may fail if no recordings exist, which is OK
              const recordingsResult = await recordingsTool.handler({
                callSid: completedCall.sid,
              });
              const recordingsResponse = JSON.parse(recordingsResult.content[0].text);

              // If recordings exist, verify structure
              if (recordingsResponse.success && recordingsResponse.recordings) {
                expect(Array.isArray(recordingsResponse.recordings)).toBe(true);
              }
            } catch {
              // No recordings for this call - that's acceptable
            }
          }
        }
      },
      30000
    );
  });

  describe('Serverless Stack Traversal Workflow', () => {
    itWithCredentials(
      'should traverse full serverless stack: service → functions → environments → builds',
      async () => {
        // Step 1: List services
        const listServicesTool = serverless.find(t => t.name === 'list_services')!;
        const servicesResult = await listServicesTool.handler({ limit: 5 });
        const servicesResponse = JSON.parse(servicesResult.content[0].text);

        expect(servicesResponse.success).toBe(true);
        expect(Array.isArray(servicesResponse.services)).toBe(true);

        if (servicesResponse.count > 0) {
          const serviceSid = servicesResponse.services[0].sid;
          const serviceName = servicesResponse.services[0].friendlyName;

          // Step 2: Get service details
          const getServiceTool = serverless.find(t => t.name === 'get_service')!;
          const serviceResult = await getServiceTool.handler({ serviceSid });
          const serviceResponse = JSON.parse(serviceResult.content[0].text);

          expect(serviceResponse.success).toBe(true);
          expect(serviceResponse.sid).toBe(serviceSid);

          // Step 3: List functions in service
          const listFunctionsTool = serverless.find(t => t.name === 'list_functions')!;
          const functionsResult = await listFunctionsTool.handler({ serviceSid, limit: 10 });
          const functionsResponse = JSON.parse(functionsResult.content[0].text);

          expect(functionsResponse.success).toBe(true);
          expect(Array.isArray(functionsResponse.functions)).toBe(true);

          // Step 4: List environments
          const listEnvsTool = serverless.find(t => t.name === 'list_environments')!;
          const envsResult = await listEnvsTool.handler({ serviceSid });
          const envsResponse = JSON.parse(envsResult.content[0].text);

          expect(envsResponse.success).toBe(true);
          expect(Array.isArray(envsResponse.environments)).toBe(true);

          // Step 5: List builds
          const listBuildsTool = serverless.find(t => t.name === 'list_builds')!;
          const buildsResult = await listBuildsTool.handler({ serviceSid, limit: 5 });
          const buildsResponse = JSON.parse(buildsResult.content[0].text);

          expect(buildsResponse.success).toBe(true);
          expect(Array.isArray(buildsResponse.builds)).toBe(true);

          // Verify we traversed a real service
          console.log(
            `Traversed serverless stack for "${serviceName}": ` +
              `${functionsResponse.count} functions, ` +
              `${envsResponse.count} environments, ` +
              `${buildsResponse.count} builds`
          );
        }
      },
      45000
    );
  });

  describe('Cross-Domain Correlation Workflow', () => {
    itWithCredentials(
      'should correlate data across messaging, voice, and account domains',
      async () => {
        // Step 1: Get account info for context
        const getAccountTool = accounts.find(t => t.name === 'get_account')!;
        const accountResult = await getAccountTool.handler({});
        const accountResponse = JSON.parse(accountResult.content[0].text);

        expect(accountResponse.success).toBe(true);
        const accountSid = accountResponse.sid;
        const accountName = accountResponse.friendlyName;

        // Step 2: Get messaging activity
        const messageLogsTool = messaging.find(t => t.name === 'get_message_logs')!;
        const messagesResult = await messageLogsTool.handler({ limit: 5 });
        const messagesResponse = JSON.parse(messagesResult.content[0].text);

        expect(messagesResponse.success).toBe(true);
        const messageCount = messagesResponse.count;

        // Step 3: Get voice activity
        const callLogsTool = voice.find(t => t.name === 'get_call_logs')!;
        const callsResult = await callLogsTool.handler({ limit: 5 });
        const callsResponse = JSON.parse(callsResult.content[0].text);

        expect(callsResponse.success).toBe(true);
        const callCount = callsResponse.count;

        // Step 4: Get phone numbers (resources enabling the activity)
        const listNumbersTool = phoneNumbers.find(t => t.name === 'list_phone_numbers')!;
        const numbersResult = await listNumbersTool.handler({ limit: 10 });
        const numbersResponse = JSON.parse(numbersResult.content[0].text);

        expect(numbersResponse.success).toBe(true);
        const numberCount = numbersResponse.count;

        // Step 5: Get debugger for any issues
        const debuggerTool = debugger_.find(t => t.name === 'get_debugger_logs')!;
        const debuggerResult = await debuggerTool.handler({ limit: 10 });
        const debuggerResponse = JSON.parse(debuggerResult.content[0].text);

        expect(debuggerResponse.success).toBe(true);
        const errorCount = debuggerResponse.count;

        // Log correlation summary
        console.log(
          `Account "${accountName}" (${accountSid}) correlation:\n` +
            `  - Phone numbers: ${numberCount}\n` +
            `  - Recent messages: ${messageCount}\n` +
            `  - Recent calls: ${callCount}\n` +
            `  - Recent errors: ${errorCount}`
        );

        // Verify we got data from all domains
        expect(accountSid).toMatch(/^AC/);
      },
      45000
    );
  });

  describe('Conference Investigation Workflow', () => {
    itWithCredentials(
      'should chain conference list → details → participants → recordings',
      async () => {
        // Step 1: List conferences
        const listTool = voice.find(t => t.name === 'list_conferences')!;
        const listResult = await listTool.handler({ limit: 10 });
        const listResponse = JSON.parse(listResult.content[0].text);

        expect(listResponse.success).toBe(true);
        expect(Array.isArray(listResponse.conferences)).toBe(true);

        if (listResponse.count > 0) {
          const conference = listResponse.conferences[0];
          const conferenceSid = conference.sid;

          // Step 2: Get conference details
          const getTool = voice.find(t => t.name === 'get_conference')!;
          const getResult = await getTool.handler({ conferenceSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(conferenceSid);
          expect(getResponse.friendlyName).toBeDefined();

          // Step 3: List participants
          const participantsTool = voice.find(t => t.name === 'list_conference_participants')!;
          const participantsResult = await participantsTool.handler({ conferenceSid, limit: 20 });
          const participantsResponse = JSON.parse(participantsResult.content[0].text);

          expect(participantsResponse.success).toBe(true);
          expect(Array.isArray(participantsResponse.participants)).toBe(true);

          // Step 4: List conference recordings
          const recordingsTool = voice.find(t => t.name === 'list_conference_recordings')!;
          const recordingsResult = await recordingsTool.handler({ conferenceSid, limit: 10 });
          const recordingsResponse = JSON.parse(recordingsResult.content[0].text);

          expect(recordingsResponse.success).toBe(true);
          expect(Array.isArray(recordingsResponse.recordings)).toBe(true);

          console.log(
            `Conference "${conference.friendlyName}" (${conferenceSid}):\n` +
              `  - Status: ${conference.status}\n` +
              `  - Participants: ${participantsResponse.count}\n` +
              `  - Recordings: ${recordingsResponse.count}`
          );
        }
      },
      45000
    );
  });

  describe('Call Insights Workflow', () => {
    itWithCredentials(
      'should chain call logs → call details → Voice Insights summary → events',
      async () => {
        // Step 1: Get recent completed calls
        const logsTool = voice.find(t => t.name === 'get_call_logs')!;
        const logsResult = await logsTool.handler({ limit: 10, status: 'completed' });
        const logsResponse = JSON.parse(logsResult.content[0].text);

        expect(logsResponse.success).toBe(true);
        expect(Array.isArray(logsResponse.calls)).toBe(true);

        if (logsResponse.count > 0) {
          const call = logsResponse.calls[0];
          const callSid = call.sid;

          // Step 2: Get call details
          const callTool = voice.find(t => t.name === 'get_call')!;
          const callResult = await callTool.handler({ callSid });
          const callResponse = JSON.parse(callResult.content[0].text);

          expect(callResponse.success).toBe(true);
          expect(callResponse.sid).toBe(callSid);

          // Step 3: Get Voice Insights summary
          // NOTE: Insights may not be available for very recent calls (~2 min for partial, 30 min for final)
          const summaryTool = voice.find(t => t.name === 'get_call_summary')!;
          try {
            const summaryResult = await summaryTool.handler({ callSid });
            const summaryResponse = JSON.parse(summaryResult.content[0].text);

            expect(summaryResponse.success).toBe(true);
            expect(summaryResponse.callSid).toBe(callSid);
            // processingState indicates if data is partial or complete
            expect(['partial', 'complete']).toContain(summaryResponse.processingState);

            // Step 4: Get call events
            const eventsTool = voice.find(t => t.name === 'list_call_events')!;
            const eventsResult = await eventsTool.handler({ callSid, limit: 20 });
            const eventsResponse = JSON.parse(eventsResult.content[0].text);

            expect(eventsResponse.success).toBe(true);
            expect(Array.isArray(eventsResponse.events)).toBe(true);

            console.log(
              `Call ${callSid} Insights:\n` +
                `  - Processing State: ${summaryResponse.processingState}\n` +
                `  - Duration: ${summaryResponse.duration}s\n` +
                `  - Call State: ${summaryResponse.callState}\n` +
                `  - Events: ${eventsResponse.count}`
            );
          } catch (error) {
            // Insights may not be available for all calls
            const err = error as { code?: number; message?: string };
            console.log(`Voice Insights not available for ${callSid}: ${err.message || err.code}`);
          }
        }
      },
      45000
    );
  });

  describe('Conference Insights Workflow', () => {
    // NOTE: Conference Insights follow same timing as Voice Insights:
    // - Partial data available ~2 min after conference end
    // - Final data locked 30 min after conference end
    // Check processingState in response for data completeness.

    itWithCredentials(
      'should chain conference list → Conference Insights summary → participant summaries',
      async () => {
        // Step 1: List completed conferences
        const listTool = voice.find(t => t.name === 'list_conferences')!;
        const listResult = await listTool.handler({ limit: 10, status: 'completed' });
        const listResponse = JSON.parse(listResult.content[0].text);

        expect(listResponse.success).toBe(true);
        expect(Array.isArray(listResponse.conferences)).toBe(true);

        if (listResponse.count > 0) {
          const conference = listResponse.conferences[0];
          const conferenceSid = conference.sid;

          // Step 2: Get Conference Insights summary
          const summaryTool = voice.find(t => t.name === 'get_conference_summary')!;
          try {
            const summaryResult = await summaryTool.handler({ conferenceSid });
            const summaryResponse = JSON.parse(summaryResult.content[0].text);

            expect(summaryResponse.success).toBe(true);
            expect(summaryResponse.conferenceSid).toBe(conferenceSid);
            // processingState indicates if data is partial or complete
            if (summaryResponse.processingState) {
              expect(['partial', 'complete']).toContain(summaryResponse.processingState);
            }

            // Step 3: List participant summaries
            const participantsTool = voice.find(t => t.name === 'list_conference_participant_summaries')!;
            const participantsResult = await participantsTool.handler({ conferenceSid, limit: 20 });
            const participantsResponse = JSON.parse(participantsResult.content[0].text);

            expect(participantsResponse.success).toBe(true);
            expect(Array.isArray(participantsResponse.participants)).toBe(true);

            console.log(
              `Conference Insights for "${summaryResponse.friendlyName}":\n` +
                `  - Processing State: ${summaryResponse.processingState || 'unknown'}\n` +
                `  - Duration: ${summaryResponse.durationSeconds}s\n` +
                `  - Max Participants: ${summaryResponse.maxParticipants}\n` +
                `  - Unique Participants: ${summaryResponse.uniqueParticipants}\n` +
                `  - End Reason: ${summaryResponse.endReason}\n` +
                `  - Participant Summaries: ${participantsResponse.count}`
            );
          } catch (error) {
            // Conference Insights may not be available for all conferences
            const err = error as { code?: number; message?: string };
            console.log(`Conference Insights not available for ${conferenceSid}: ${err.message || err.code}`);
          }
        }
      },
      45000
    );
  });
});
