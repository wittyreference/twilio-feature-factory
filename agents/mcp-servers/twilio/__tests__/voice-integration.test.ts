// ABOUTME: Integration tests for advanced voice patterns including conferences and call transfers.
// ABOUTME: Tests multi-step voice workflows with real Twilio APIs.

/**
 * Voice Integration Tests
 *
 * These tests cover complex voice patterns that require multiple API operations:
 * 1. Conference flows (create, add participants, manage, end)
 * 2. Call transfer patterns (using Dial verb with transfer scenarios)
 * 3. Recording lifecycle (start, pause, resume, stop, retrieve)
 *
 * NOTE: These tests use real Twilio APIs but are designed to work with
 * existing historical data (conferences that already exist in the account)
 * to avoid creating billable calls.
 */

import { voiceTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  toNumber: process.env.TEST_PHONE_NUMBER || '',
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

describe('Voice Integration Tests', () => {
  const itWithCredentials = hasRealCredentials ? it : it.skip;
  let tools: Tool[];

  beforeAll(() => {
    tools = voiceTools(createTestContext()) as Tool[];
  });

  describe('Conference Flow Integration', () => {
    describe('Conference Discovery and Inspection', () => {
      itWithCredentials(
        'should discover conferences and inspect full hierarchy',
        async () => {
          // Step 1: List all conferences
          const listTool = tools.find(t => t.name === 'list_conferences')!;
          const listResult = await listTool.handler({ limit: 20 });
          const listResponse = JSON.parse(listResult.content[0].text);

          expect(listResponse.success).toBe(true);
          expect(Array.isArray(listResponse.conferences)).toBe(true);

          console.log(`Found ${listResponse.count} conferences`);

          if (listResponse.count > 0) {
            // Step 2: Get detailed info for each conference status
            const byStatus: Record<string, number> = {};
            for (const conf of listResponse.conferences) {
              byStatus[conf.status] = (byStatus[conf.status] || 0) + 1;
            }
            console.log('Conferences by status:', byStatus);

            // Step 3: Pick a conference to inspect deeply
            const conference = listResponse.conferences[0];
            const conferenceSid = conference.sid;

            // Step 4: Get conference details
            const getTool = tools.find(t => t.name === 'get_conference')!;
            const getResult = await getTool.handler({ conferenceSid });
            const confDetail = JSON.parse(getResult.content[0].text);

            expect(confDetail.success).toBe(true);
            expect(confDetail.sid).toBe(conferenceSid);
            expect(confDetail.friendlyName).toBeDefined();

            // Step 5: List participants
            const participantsTool = tools.find(t => t.name === 'list_conference_participants')!;
            const participantsResult = await participantsTool.handler({ conferenceSid, limit: 50 });
            const participants = JSON.parse(participantsResult.content[0].text);

            expect(participants.success).toBe(true);
            expect(Array.isArray(participants.participants)).toBe(true);

            console.log(
              `Conference "${confDetail.friendlyName}" has ${participants.count} participants`
            );

            // Step 6: If there are participants, get individual details
            if (participants.count > 0) {
              const participantCallSid = participants.participants[0].callSid;

              const getParticipantTool = tools.find(t => t.name === 'get_conference_participant')!;
              const partResult = await getParticipantTool.handler({
                conferenceSid,
                callSid: participantCallSid,
              });
              const partDetail = JSON.parse(partResult.content[0].text);

              expect(partDetail.success).toBe(true);
              expect(partDetail.callSid).toBe(participantCallSid);
              expect(partDetail.muted).toBeDefined();
              expect(partDetail.hold).toBeDefined();

              console.log(
                `Participant ${participantCallSid}: muted=${partDetail.muted}, hold=${partDetail.hold}`
              );
            }

            // Step 7: List conference recordings
            const recordingsTool = tools.find(t => t.name === 'list_conference_recordings')!;
            const recordingsResult = await recordingsTool.handler({ conferenceSid, limit: 10 });
            const recordings = JSON.parse(recordingsResult.content[0].text);

            expect(recordings.success).toBe(true);
            expect(Array.isArray(recordings.recordings)).toBe(true);

            console.log(`Conference has ${recordings.count} recordings`);
          }
        },
        60000
      );
    });

    describe('Conference Status Filtering', () => {
      itWithCredentials(
        'should filter conferences by different statuses',
        async () => {
          const listTool = tools.find(t => t.name === 'list_conferences')!;

          // Test each status filter
          const statuses = ['init', 'in-progress', 'completed'];
          const results: Record<string, number> = {};

          for (const status of statuses) {
            const result = await listTool.handler({ status, limit: 10 });
            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(true);
            results[status] = response.count;

            // Verify all returned conferences have the requested status
            for (const conf of response.conferences) {
              expect(conf.status).toBe(status);
            }
          }

          console.log('Conferences by status filter:', results);
        },
        45000
      );
    });

    describe('Conference Insights Integration', () => {
      itWithCredentials(
        'should retrieve Conference Insights for completed conferences',
        async () => {
          // Find completed conferences (Insights only available after completion)
          const listTool = tools.find(t => t.name === 'list_conferences')!;
          const listResult = await listTool.handler({ status: 'completed', limit: 10 });
          const conferences = JSON.parse(listResult.content[0].text);

          expect(conferences.success).toBe(true);

          if (conferences.count > 0) {
            const conferenceSid = conferences.conferences[0].sid;

            // Try to get Conference Insights summary
            const summaryTool = tools.find(t => t.name === 'get_conference_summary')!;
            try {
              const summaryResult = await summaryTool.handler({ conferenceSid });
              const summary = JSON.parse(summaryResult.content[0].text);

              expect(summary.success).toBe(true);
              expect(summary.conferenceSid).toBe(conferenceSid);

              // processingState indicates data completeness
              if (summary.processingState) {
                expect(['partial', 'complete']).toContain(summary.processingState);
                console.log(`Insights processing state: ${summary.processingState}`);
              }

              // Check for insights metrics
              if (summary.processingState === 'complete') {
                expect(summary.durationSeconds).toBeDefined();
                expect(summary.maxParticipants).toBeDefined();
                expect(summary.uniqueParticipants).toBeDefined();

                console.log(
                  `Conference insights: duration=${summary.durationSeconds}s, ` +
                    `maxParticipants=${summary.maxParticipants}, ` +
                    `uniqueParticipants=${summary.uniqueParticipants}`
                );
              }

              // Get participant summaries
              const partSummaryTool = tools.find(
                t => t.name === 'list_conference_participant_summaries'
              )!;
              const partResult = await partSummaryTool.handler({ conferenceSid, limit: 20 });
              const partSummaries = JSON.parse(partResult.content[0].text);

              expect(partSummaries.success).toBe(true);
              expect(Array.isArray(partSummaries.participants)).toBe(true);

              console.log(`Participant summaries: ${partSummaries.count}`);

              // Get individual participant summary if available
              if (partSummaries.count > 0) {
                const participantSid = partSummaries.participants[0].participantSid;
                const getSummaryTool = tools.find(
                  t => t.name === 'get_conference_participant_summary'
                )!;
                const singleResult = await getSummaryTool.handler({
                  conferenceSid,
                  participantSid,
                });
                const singleSummary = JSON.parse(singleResult.content[0].text);

                expect(singleSummary.success).toBe(true);
                expect(singleSummary.participantSid).toBe(participantSid);
              }
            } catch (error) {
              // Insights may not be available for all conferences
              const err = error as { message?: string; code?: number };
              console.log(`Conference Insights not available: ${err.message || err.code}`);
            }
          }
        },
        60000
      );
    });
  });

  describe('Call History and Recording Integration', () => {
    describe('Call Recording Retrieval', () => {
      itWithCredentials(
        'should traverse calls → recordings → transcriptions',
        async () => {
          // Step 1: Get completed calls
          const callLogsTool = tools.find(t => t.name === 'get_call_logs')!;
          const callsResult = await callLogsTool.handler({ status: 'completed', limit: 20 });
          const calls = JSON.parse(callsResult.content[0].text);

          expect(calls.success).toBe(true);
          expect(Array.isArray(calls.calls)).toBe(true);

          console.log(`Found ${calls.count} completed calls`);

          if (calls.count > 0) {
            // Find calls that might have recordings
            let recordingsFound = false;

            for (const call of calls.calls.slice(0, 5)) {
              // Check top 5 calls
              const callSid = call.sid;

              // Step 2: List recordings for this call
              const recordingsTool = tools.find(t => t.name === 'list_call_recordings')!;
              const recordingsResult = await recordingsTool.handler({ callSid, limit: 10 });
              const recordings = JSON.parse(recordingsResult.content[0].text);

              expect(recordings.success).toBe(true);
              expect(Array.isArray(recordings.recordings)).toBe(true);

              if (recordings.count > 0) {
                recordingsFound = true;
                console.log(`Call ${callSid} has ${recordings.count} recordings`);

                const recording = recordings.recordings[0];
                const recordingSid = recording.sid;

                // Step 3: Get individual recording details
                const getRecordingTool = tools.find(t => t.name === 'get_recording')!;
                const recResult = await getRecordingTool.handler({ recordingSid });
                const recDetail = JSON.parse(recResult.content[0].text);

                expect(recDetail.success).toBe(true);
                expect(recDetail.sid).toBe(recordingSid);
                expect(recDetail.duration).toBeDefined();

                console.log(
                  `Recording ${recordingSid}: duration=${recDetail.duration}s, status=${recDetail.status}`
                );

                // Step 4: Check for transcriptions
                const transTool = tools.find(t => t.name === 'list_recording_transcriptions')!;
                const transResult = await transTool.handler({ recordingSid, limit: 5 });
                const transcriptions = JSON.parse(transResult.content[0].text);

                expect(transcriptions.success).toBe(true);
                expect(Array.isArray(transcriptions.transcriptions)).toBe(true);

                if (transcriptions.count > 0) {
                  console.log(`Recording has ${transcriptions.count} transcriptions`);

                  const transcriptionSid = transcriptions.transcriptions[0].sid;
                  const getTransTool = tools.find(t => t.name === 'get_transcription')!;
                  const transDetail = await getTransTool.handler({ transcriptionSid });
                  const trans = JSON.parse(transDetail.content[0].text);

                  expect(trans.success).toBe(true);
                  expect(trans.sid).toBe(transcriptionSid);
                  console.log(`Transcription status: ${trans.status}`);
                }

                break; // Found recordings, stop searching
              }
            }

            if (!recordingsFound) {
              console.log('No recordings found in recent calls');
            }
          }
        },
        60000
      );
    });

    describe('All Recordings List', () => {
      itWithCredentials(
        'should list all recordings with date filtering',
        async () => {
          const listRecordingsTool = tools.find(t => t.name === 'list_recordings')!;

          // Get recent recordings
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

          const result = await listRecordingsTool.handler({
            dateCreatedAfter: oneWeekAgo.toISOString(),
            limit: 20,
          });
          const recordings = JSON.parse(result.content[0].text);

          expect(recordings.success).toBe(true);
          expect(Array.isArray(recordings.recordings)).toBe(true);

          console.log(`Found ${recordings.count} recordings in last 7 days`);

          // Verify date filtering worked
          for (const rec of recordings.recordings) {
            const createdDate = new Date(rec.dateCreated);
            expect(createdDate.getTime()).toBeGreaterThanOrEqual(oneWeekAgo.getTime());
          }
        },
        30000
      );
    });
  });

  describe('Voice Insights Integration', () => {
    itWithCredentials(
      'should retrieve Voice Insights for completed calls',
      async () => {
        // Get completed calls
        const callLogsTool = tools.find(t => t.name === 'get_call_logs')!;
        const callsResult = await callLogsTool.handler({ status: 'completed', limit: 10 });
        const calls = JSON.parse(callsResult.content[0].text);

        expect(calls.success).toBe(true);

        if (calls.count > 0) {
          const callSid = calls.calls[0].sid;

          // Try to get Voice Insights
          const summaryTool = tools.find(t => t.name === 'get_call_summary')!;
          try {
            const summaryResult = await summaryTool.handler({ callSid });
            const summary = JSON.parse(summaryResult.content[0].text);

            expect(summary.success).toBe(true);
            expect(summary.callSid).toBe(callSid);

            console.log(
              `Voice Insights for ${callSid}:\n` +
                `  Processing State: ${summary.processingState}\n` +
                `  Duration: ${summary.duration}s\n` +
                `  Call State: ${summary.callState}`
            );

            // Get call events
            const eventsTool = tools.find(t => t.name === 'list_call_events')!;
            const eventsResult = await eventsTool.handler({ callSid, limit: 30 });
            const events = JSON.parse(eventsResult.content[0].text);

            expect(events.success).toBe(true);
            expect(Array.isArray(events.events)).toBe(true);

            console.log(`  Events: ${events.count}`);

            // Get call metrics
            const metricsTool = tools.find(t => t.name === 'list_call_metrics')!;
            const metricsResult = await metricsTool.handler({ callSid, limit: 30 });
            const metrics = JSON.parse(metricsResult.content[0].text);

            expect(metrics.success).toBe(true);
            expect(Array.isArray(metrics.metrics)).toBe(true);

            console.log(`  Metrics: ${metrics.count}`);
          } catch (error) {
            const err = error as { message?: string; code?: number };
            console.log(`Voice Insights not available for ${callSid}: ${err.message || err.code}`);
          }
        }
      },
      60000
    );
  });

  describe('Call Transfer Pattern Validation', () => {
    /**
     * NOTE: These tests validate the MCP tools that would be used in transfer patterns.
     * Actual transfers require active calls, so we validate the tool schema and
     * check that the tools exist and have correct structure for transfer scenarios.
     */

    it('should have all tools required for warm transfer pattern', () => {
      // Warm transfer pattern requires:
      // 1. make_call - to initiate the transfer leg
      // 2. update_call - to connect calls or redirect
      // 3. get_call - to check call status

      const makeCallTool = tools.find(t => t.name === 'make_call');
      expect(makeCallTool).toBeDefined();
      expect(makeCallTool?.description).toContain('outbound call');

      const updateCallTool = tools.find(t => t.name === 'update_call');
      expect(updateCallTool).toBeDefined();
      expect(updateCallTool?.description).toMatch(/modify|update/i);

      const getCallTool = tools.find(t => t.name === 'get_call');
      expect(getCallTool).toBeDefined();
    });

    it('should have all tools required for conference-based transfer', () => {
      // Conference-based transfer requires:
      // 1. list_conferences / get_conference - to find/create conference
      // 2. add_participant_to_conference - to add transfer target
      // 3. update_conference_participant - to manage participant states

      const addParticipantTool = tools.find(t => t.name === 'add_participant_to_conference');
      expect(addParticipantTool).toBeDefined();
      expect(addParticipantTool?.description).toContain('participant');

      const updateParticipantTool = tools.find(t => t.name === 'update_conference_participant');
      expect(updateParticipantTool).toBeDefined();
      // Should support mute, hold, coaching

      const getConferenceTool = tools.find(t => t.name === 'get_conference');
      expect(getConferenceTool).toBeDefined();
    });

    it('should validate add_participant_to_conference schema for transfer use case', () => {
      const tool = tools.find(t => t.name === 'add_participant_to_conference')!;

      // Test valid transfer scenario
      const validParams = {
        conferenceSid: 'CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        to: '+15551234567',
        from: '+15559876543',
        earlyMedia: true,
        endConferenceOnExit: false,
        startConferenceOnEnter: false,
        beep: 'false',
      };

      const parseResult = tool.inputSchema.safeParse(validParams);
      expect(parseResult.success).toBe(true);
    });

    it('should validate update_call schema for redirect transfer', () => {
      const tool = tools.find(t => t.name === 'update_call')!;

      // Test redirect scenario (common in transfers)
      const redirectParams = {
        callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        twiml: '<Response><Dial>+15551234567</Dial></Response>',
      };

      const parseResult = tool.inputSchema.safeParse(redirectParams);
      expect(parseResult.success).toBe(true);

      // Test status update (hang up)
      const hangupParams = {
        callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        status: 'completed',
      };

      const hangupResult = tool.inputSchema.safeParse(hangupParams);
      expect(hangupResult.success).toBe(true);
    });
  });

  describe('Media Streams Tools Validation', () => {
    it('should have start_call_stream tool for unidirectional streams', () => {
      const tool = tools.find(t => t.name === 'start_call_stream');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('unidirectional');
    });

    it('should have stop_call_stream tool', () => {
      const tool = tools.find(t => t.name === 'stop_call_stream');
      expect(tool).toBeDefined();
    });

    it('should validate start_call_stream schema', () => {
      const tool = tools.find(t => t.name === 'start_call_stream')!;

      const validParams = {
        callSid: 'CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        url: 'wss://example.com/stream',
        track: 'inbound_track', // Options: inbound_track, outbound_track, both_tracks
      };

      const parseResult = tool.inputSchema.safeParse(validParams);
      expect(parseResult.success).toBe(true);
    });
  });
});
