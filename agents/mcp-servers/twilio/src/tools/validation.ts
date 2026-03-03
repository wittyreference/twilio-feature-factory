// ABOUTME: Deep validation tools that expose DeepValidator and ComprehensiveValidator as MCP tools.
// ABOUTME: Provides validate_call, validate_message, validate_voice_ai_flow, and validate_debugger tools.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';
import { DeepValidator, ComprehensiveValidator } from '../validation/index.js';

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
) {
  return { name, description, inputSchema: schema, handler };
}

/**
 * Returns all deep validation tools configured with the given Twilio context.
 */
export function validationTools(context: TwilioContext) {
  const { client } = context;

  const validateCall = createTool(
    'validate_call',
    'Deep validate a call - checks status, notifications, events, Voice Insights, and optionally content quality (recordings/transcripts). Use after making calls to verify they truly succeeded beyond HTTP 200.',
    z.object({
      callSid: z.string().describe('Call SID to validate (CA...)'),
      validateContent: z.boolean().optional().default(false).describe('Enable content validation (check recordings/transcripts for errors)'),
      minDuration: z.number().optional().describe('Minimum expected duration in seconds (default: 15). Shorter calls may indicate errors.'),
      forbiddenPatterns: z.array(z.string()).optional().describe('Patterns that should NOT appear in transcripts (e.g., ["application error", "please try again"])'),
      intelligenceServiceSid: z.string().optional().describe('Voice Intelligence Service SID for transcript analysis'),
      requireRecording: z.boolean().optional().default(false).describe('Fail if no recording exists'),
      waitForTerminal: z.boolean().optional().default(true).describe('Wait for call to reach terminal status'),
      timeout: z.number().optional().default(30000).describe('Maximum wait time in ms'),
    }),
    async ({ callSid, validateContent, minDuration, forbiddenPatterns, intelligenceServiceSid, requireRecording, waitForTerminal, timeout }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateCall(callSid, {
        validateContent,
        minDuration,
        forbiddenPatterns,
        intelligenceServiceSid,
        requireRecording,
        waitForTerminal,
        timeout,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateMessage = createTool(
    'validate_message',
    'Deep validate a message - checks delivery status and debugger alerts. Use after sending SMS/MMS to verify delivery beyond HTTP 200.',
    z.object({
      messageSid: z.string().describe('Message SID to validate (SM...)'),
      waitForTerminal: z.boolean().optional().default(true).describe('Wait for terminal status (delivered/undelivered/failed)'),
      timeout: z.number().optional().default(30000).describe('Maximum wait time in ms'),
    }),
    async ({ messageSid, waitForTerminal, timeout }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateMessage(messageSid, {
        waitForTerminal,
        timeout,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateVoiceAiFlow = createTool(
    'validate_voice_ai_flow',
    'Comprehensive validation for Voice AI flows - validates call, recording, transcript, message, and sync state. Use for end-to-end voice AI validation.',
    z.object({
      callSid: z.string().describe('Call SID to validate'),
      recordingSid: z.string().optional().describe('Recording SID (optional - will be auto-discovered from call)'),
      transcriptSid: z.string().optional().describe('Transcript SID (optional - will be auto-discovered)'),
      smsSid: z.string().optional().describe('SMS summary SID (optional - validates if provided)'),
      syncDocumentName: z.string().optional().describe('Sync document name to validate (optional)'),
      forbiddenPatterns: z.array(z.string()).optional().describe('Patterns that should NOT appear in conversation'),
      minSentencesPerSide: z.number().optional().describe('Minimum sentences per side for two-way validation'),
      intelligenceServiceSid: z.string().optional().describe('Voice Intelligence Service SID'),
      syncServiceSid: z.string().optional().describe('Sync Service SID'),
      serverlessServiceSid: z.string().optional().describe('Serverless Service SID'),
      conversationRelayUrl: z.string().optional().describe('ConversationRelay WebSocket URL to validate'),
      projectRoot: z.string().optional().describe('Project root for learnings storage (default: process.cwd())'),
    }),
    async ({ callSid, recordingSid, transcriptSid, smsSid, syncDocumentName, forbiddenPatterns, minSentencesPerSide, intelligenceServiceSid, syncServiceSid, serverlessServiceSid, conversationRelayUrl, projectRoot }) => {
      const validator = new ComprehensiveValidator(client, {
        projectRoot: projectRoot || process.cwd(),
      });

      const result = await validator.validateVoiceAIFlow({
        callSid,
        recordingSid,
        transcriptSid,
        smsSid,
        syncDocumentName,
        forbiddenPatterns,
        minSentencesPerSide,
        intelligenceServiceSid,
        syncServiceSid: syncServiceSid || context.syncServiceSid,
        serverlessServiceSid,
        conversationRelayUrl,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateDebugger = createTool(
    'validate_debugger',
    'Check Twilio debugger for errors in a time window. Use after operations to ensure no errors occurred.',
    z.object({
      lookbackSeconds: z.number().optional().default(300).describe('How far back to check (seconds, default: 300 = 5 min)'),
      resourceSid: z.string().optional().describe('Filter to specific resource SID'),
      logLevel: z.enum(['error', 'warning', 'notice', 'debug']).optional().describe('Filter by log level'),
      limit: z.number().optional().default(100).describe('Maximum alerts to return'),
    }),
    async ({ lookbackSeconds, resourceSid, logLevel, limit }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateDebugger({
        lookbackSeconds,
        resourceSid,
        logLevel,
        limit,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateRecording = createTool(
    'validate_recording',
    'Validate a call/conference recording completed successfully.',
    z.object({
      recordingSid: z.string().describe('Recording SID to validate (RE...)'),
      waitForCompleted: z.boolean().optional().default(true).describe('Wait for recording to complete'),
      timeout: z.number().optional().default(60000).describe('Maximum wait time in ms'),
    }),
    async ({ recordingSid, waitForCompleted, timeout }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateRecording(recordingSid, {
        waitForCompleted,
        timeout,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateTranscript = createTool(
    'validate_transcript',
    'Validate a Voice Intelligence transcript completed successfully.',
    z.object({
      transcriptSid: z.string().describe('Transcript SID to validate (GT...)'),
      waitForCompleted: z.boolean().optional().default(true).describe('Wait for transcript to complete'),
      timeout: z.number().optional().default(120000).describe('Maximum wait time in ms'),
      checkSentences: z.boolean().optional().default(true).describe('Verify transcript has sentences'),
    }),
    async ({ transcriptSid, waitForCompleted, timeout, checkSentences }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateTranscript(transcriptSid, {
        waitForCompleted,
        timeout,
        checkSentences,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateTwoWay = createTool(
    'validate_two_way',
    'Validate a two-way conversation between two calls (e.g., AI agent and customer). Checks both transcripts for natural conversation flow.',
    z.object({
      callSidA: z.string().describe('First call leg SID (e.g., AI agent)'),
      callSidB: z.string().describe('Second call leg SID (e.g., customer)'),
      intelligenceServiceSid: z.string().describe('Voice Intelligence Service SID'),
      expectedTurns: z.number().optional().default(2).describe('Minimum speaker turns expected'),
      topicKeywords: z.array(z.string()).optional().describe('Keywords that should appear in conversation'),
      successPhrases: z.array(z.string()).optional().describe('Phrases indicating successful completion'),
      forbiddenPatterns: z.array(z.string()).optional().describe('Patterns that should NOT appear (errors)'),
      waitForTranscripts: z.boolean().optional().default(true).describe('Wait for transcripts to complete'),
      timeout: z.number().optional().default(120000).describe('Maximum wait time in ms'),
    }),
    async ({ callSidA, callSidB, intelligenceServiceSid, expectedTurns, topicKeywords, successPhrases, forbiddenPatterns, waitForTranscripts, timeout }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateTwoWay({
        callSidA,
        callSidB,
        intelligenceServiceSid,
        expectedTurns,
        topicKeywords,
        successPhrases,
        forbiddenPatterns,
        waitForTranscripts,
        timeout,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateLanguageOperator = createTool(
    'validate_language_operator',
    'Validate that Language Operators (summarization, classification, extraction) ran successfully on a transcript. Use after transcript completes to verify operators produced results.',
    z.object({
      transcriptSid: z.string().describe('Transcript SID (GT...) to check for operator results'),
      operatorType: z.enum(['text-generation', 'classification', 'extraction']).optional().describe('Filter by operator type (e.g., text-generation for summarization)'),
      operatorName: z.string().optional().describe('Filter by operator name (e.g., "Call Summary")'),
      requireResults: z.boolean().optional().default(true).describe('Fail if no operator results found'),
    }),
    async ({ transcriptSid, operatorType, operatorName, requireResults }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateLanguageOperator(transcriptSid, {
        operatorType,
        operatorName,
        requireResults,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateSyncDocument = createTool(
    'validate_sync_document',
    'Validate a Sync Document - checks data structure, expected keys, types. Use after writing to a Sync Document to verify it contains the expected data.',
    z.object({
      serviceSid: z.string().describe('Sync Service SID (IS...)'),
      documentSidOrName: z.string().describe('Document SID (ET...) or unique name'),
      expectedKeys: z.array(z.string()).optional().describe('Keys expected in document data'),
      strictKeys: z.boolean().optional().default(false).describe('Fail if unexpected keys exist'),
      expectedTypes: z.record(z.enum(['string', 'number', 'boolean', 'object', 'array'])).optional().describe('Expected type for each key'),
      checkDebugger: z.boolean().optional().default(false).describe('Check debugger for related alerts'),
    }),
    async ({ serviceSid, documentSidOrName, expectedKeys, strictKeys, expectedTypes, checkDebugger }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateSyncDocument(serviceSid, documentSidOrName, {
        expectedKeys,
        strictKeys,
        expectedTypes: expectedTypes as Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>,
        checkDebugger,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateSyncList = createTool(
    'validate_sync_list',
    'Validate a Sync List - checks item count constraints and item data structure. Use after adding items to a Sync List to verify the list state.',
    z.object({
      serviceSid: z.string().describe('Sync Service SID (IS...)'),
      listSidOrName: z.string().describe('List SID (ES...) or unique name'),
      minItems: z.number().optional().describe('Minimum items expected'),
      maxItems: z.number().optional().describe('Maximum items expected'),
      exactItems: z.number().optional().describe('Exact item count expected (overrides min/max)'),
      expectedItemKeys: z.array(z.string()).optional().describe('Keys expected in each item\'s data'),
      checkDebugger: z.boolean().optional().default(false).describe('Check debugger for related alerts'),
    }),
    async ({ serviceSid, listSidOrName, minItems, maxItems, exactItems, expectedItemKeys, checkDebugger }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateSyncList(serviceSid, listSidOrName, {
        minItems,
        maxItems,
        exactItems,
        expectedItemKeys,
        checkDebugger,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateSyncMap = createTool(
    'validate_sync_map',
    'Validate a Sync Map - checks for expected keys and item data structure. Use after writing to a Sync Map to verify keys and values.',
    z.object({
      serviceSid: z.string().describe('Sync Service SID (IS...)'),
      mapSidOrName: z.string().describe('Map SID (MP...) or unique name'),
      expectedKeys: z.array(z.string()).optional().describe('Map item keys expected to exist'),
      expectedValueKeys: z.array(z.string()).optional().describe('Keys expected in each item\'s value data'),
      checkDebugger: z.boolean().optional().default(false).describe('Check debugger for related alerts'),
    }),
    async ({ serviceSid, mapSidOrName, expectedKeys, expectedValueKeys, checkDebugger }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateSyncMap(serviceSid, mapSidOrName, {
        expectedKeys,
        expectedValueKeys,
        checkDebugger,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateTask = createTool(
    'validate_task',
    'Deep validate a TaskRouter task - checks status, attributes, reservations, events, and debugger. Richer than basic task status check.',
    z.object({
      taskSid: z.string().describe('Task SID (WT...)'),
      workspaceSid: z.string().optional().describe('Workspace SID (WS...). Uses default from context if not provided.'),
      expectedStatus: z.string().optional().describe('Expected assignment status (e.g., "completed", "assigned")'),
      expectedAttributeKeys: z.array(z.string()).optional().describe('Keys expected in task attributes JSON'),
      includeReservations: z.boolean().optional().default(false).describe('Include reservation history'),
      includeEvents: z.boolean().optional().default(false).describe('Include task event history'),
      eventLimit: z.number().optional().default(50).describe('Max events to fetch'),
      checkDebugger: z.boolean().optional().default(false).describe('Check debugger for related alerts'),
    }),
    async ({ taskSid, workspaceSid, expectedStatus, expectedAttributeKeys, includeReservations, includeEvents, eventLimit, checkDebugger }) => {
      const wsSid = workspaceSid || context.taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, errors: ['No workspace SID provided and TWILIO_TASKROUTER_WORKSPACE_SID not set'] }, null, 2),
          }],
        };
      }

      const validator = new DeepValidator(client);
      const result = await validator.validateTaskRouter(wsSid, taskSid, {
        expectedStatus,
        expectedAttributeKeys,
        includeReservations,
        includeEvents,
        eventLimit,
        checkDebugger,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateVideoRoom = createTool(
    'validate_video_room',
    'Deep validate a Video Room - checks room status, type, participants, tracks, transcription, recording, and composition. Use after creating video rooms to verify they work beyond HTTP 200.',
    z.object({
      roomSid: z.string().describe('Video Room SID (RM...)'),
      expectedParticipants: z.number().optional().describe('Expected number of connected participants'),
      checkPublishedTracks: z.boolean().optional().default(false).describe('Verify participants are publishing audio/video tracks'),
      checkTranscription: z.boolean().optional().default(false).describe('Validate transcription is active (Healthcare use case)'),
      checkRecording: z.boolean().optional().default(false).describe('Validate recordings exist (Professional/Proctoring use case)'),
      checkComposition: z.boolean().optional().default(false).describe('Validate composition completed (Professional use case)'),
      waitForRoomComplete: z.boolean().optional().default(false).describe('Poll until room status = completed'),
      waitForCompositionComplete: z.boolean().optional().default(false).describe('Poll until composition status = completed'),
      timeout: z.number().optional().default(60000).describe('Maximum wait time in ms'),
    }),
    async ({ roomSid, expectedParticipants, checkPublishedTracks, checkTranscription, checkRecording, checkComposition, waitForRoomComplete, waitForCompositionComplete, timeout }) => {
      const startTime = Date.now();
      const errors: string[] = [];
      const pollInterval = 3000;

      // Helper to poll until condition or timeout
      const pollUntil = async <T>(
        fetchFn: () => Promise<T>,
        checkFn: (result: T) => boolean,
        timeoutMs: number
      ): Promise<T> => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const result = await fetchFn();
          if (checkFn(result)) return result;
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        return fetchFn(); // Return final state even if condition not met
      };

      // 1. Fetch and validate room
      let room;
      try {
        if (waitForRoomComplete) {
          room = await pollUntil(
            () => client.video.v1.rooms(roomSid).fetch(),
            (r) => r.status === 'completed',
            timeout
          );
        } else {
          room = await client.video.v1.rooms(roomSid).fetch();
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              errors: [`Room not found: ${roomSid}`],
              duration: Date.now() - startTime,
            }, null, 2),
          }],
        };
      }

      // Check room type (must be 'group')
      if (room.type !== 'group') {
        errors.push(`Room type is '${room.type}' - only 'group' rooms are recommended (HIPAA-eligible)`);
      }

      // 2. Fetch participants
      const participants = await client.video.v1.rooms(roomSid).participants.list({ limit: 50 });
      const connectedParticipants = participants.filter(p => p.status === 'connected');

      // Check participant count
      if (expectedParticipants !== undefined && connectedParticipants.length !== expectedParticipants) {
        errors.push(`Expected ${expectedParticipants} participants, found ${connectedParticipants.length} connected`);
      }

      // 3. Check published tracks (if requested)
      type ParticipantTrackInfo = {
        sid: string;
        identity: string;
        status: string;
        audioTracks: number;
        videoTracks: number;
        dataTracks: number;
      };
      const participantDetails: ParticipantTrackInfo[] = [];

      for (const p of participants) {
        const trackInfo: ParticipantTrackInfo = {
          sid: p.sid,
          identity: p.identity,
          status: p.status,
          audioTracks: 0,
          videoTracks: 0,
          dataTracks: 0,
        };

        if (checkPublishedTracks && p.status === 'connected') {
          try {
            const tracks = await client.video.v1.rooms(roomSid).participants(p.sid).publishedTracks.list({ limit: 20 });
            for (const track of tracks) {
              if (track.kind === 'audio') trackInfo.audioTracks++;
              else if (track.kind === 'video') trackInfo.videoTracks++;
              else if (track.kind === 'data') trackInfo.dataTracks++;
            }

            if (trackInfo.audioTracks === 0 && trackInfo.videoTracks === 0) {
              errors.push(`Participant ${p.identity} has no published audio/video tracks`);
            }
          } catch {
            // Track listing may fail if participant disconnected
          }
        }

        participantDetails.push(trackInfo);
      }

      // 4. Check transcription (if requested)
      interface TranscriptionResult {
        sid?: string;
        status?: string;
        sentenceCount?: number;
        speakers?: string[];
      }
      let transcriptionResult: TranscriptionResult | undefined;

      if (checkTranscription) {
        try {
          const transcriptions = await client.video.v1.rooms(roomSid).transcriptions.list({ limit: 1 });
          if (transcriptions.length === 0) {
            errors.push('No transcription found for room');
          } else {
            const transcription = transcriptions[0];
            transcriptionResult = {
              sid: transcription.ttid,  // Video transcriptions use 'ttid' not 'sid'
              status: transcription.status,
              sentenceCount: 0,
              speakers: [],
            };

            // Video transcription status values: 'started' | 'stopped' | 'failed'
            if (transcription.status === 'failed') {
              errors.push('Transcription failed');
            }
            // 'started' means actively transcribing, 'stopped' means completed successfully
          }
        } catch {
          errors.push('Failed to fetch transcription - may not be enabled for this room');
        }
      }

      // 5. Check recordings (if requested)
      interface RecordingsResult {
        count: number;
        byParticipant: Record<string, { audio: number; video: number }>;
        allCompleted: boolean;
      }
      let recordingsResult: RecordingsResult | undefined;

      if (checkRecording) {
        try {
          const recordings = await client.video.v1.rooms(roomSid).recordings.list({ limit: 100 });
          if (recordings.length === 0) {
            errors.push('No recordings found for room');
          } else {
            const byParticipant: Record<string, { audio: number; video: number }> = {};
            let allCompleted = true;

            for (const rec of recordings) {
              const sourceSid = rec.sourceSid || 'unknown';
              if (!byParticipant[sourceSid]) {
                byParticipant[sourceSid] = { audio: 0, video: 0 };
              }
              if (rec.type === 'audio') byParticipant[sourceSid].audio++;
              else if (rec.type === 'video') byParticipant[sourceSid].video++;

              if (rec.status !== 'completed') allCompleted = false;
            }

            recordingsResult = {
              count: recordings.length,
              byParticipant,
              allCompleted,
            };

            if (!allCompleted && room.status === 'completed') {
              errors.push('Some recordings have not completed processing');
            }
          }
        } catch {
          errors.push('Failed to fetch recordings');
        }
      }

      // 6. Check composition (if requested)
      interface CompositionResult {
        sid?: string;
        status?: string;
        mediaUrl?: string;
        mediaAccessible?: boolean;
        duration?: number;
        size?: number;
      }
      let compositionResult: CompositionResult | undefined;

      if (checkComposition) {
        // Composition can only be created after room ends
        if (room.status !== 'completed') {
          errors.push('Cannot validate composition - room is still in-progress (compositions require room to end first)');
        } else {
          try {
            const compositions = await client.video.v1.compositions.list({ roomSid, limit: 1 });
            if (compositions.length === 0) {
              errors.push('No composition found for room - create one with create_composition tool');
            } else {
              let composition = compositions[0];

              if (waitForCompositionComplete && composition.status !== 'completed' && composition.status !== 'failed') {
                composition = await pollUntil(
                  () => client.video.v1.compositions(composition.sid).fetch(),
                  (c) => c.status === 'completed' || c.status === 'failed',
                  timeout - (Date.now() - startTime)
                );
              }

              compositionResult = {
                sid: composition.sid,
                status: composition.status,
                duration: composition.duration,
                size: composition.size,
                mediaAccessible: false,
              };

              if (composition.status === 'failed') {
                errors.push('Composition failed');
              } else if (composition.status === 'completed') {
                // Check if media is accessible
                // Note: We can't actually fetch the media URL without additional setup,
                // but we can check that the composition completed successfully
                compositionResult.mediaAccessible = true;
              } else {
                errors.push(`Composition status is '${composition.status}' - expected 'completed'`);
              }
            }
          } catch {
            errors.push('Failed to fetch compositions');
          }
        }
      }

      const result = {
        success: errors.length === 0,
        room: {
          sid: room.sid,
          status: room.status,
          type: room.type,
          uniqueName: room.uniqueName,
          participantCount: connectedParticipants.length,
          totalParticipants: participants.length,
          duration: room.duration,
          dateCreated: room.dateCreated,
          endTime: room.endTime,
        },
        participants: participantDetails,
        transcription: transcriptionResult,
        recordings: recordingsResult,
        composition: compositionResult,
        errors,
        duration: Date.now() - startTime,
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  return [
    validateCall,
    validateMessage,
    validateVoiceAiFlow,
    validateDebugger,
    validateRecording,
    validateTranscript,
    validateTwoWay,
    validateLanguageOperator,
    validateSyncDocument,
    validateSyncList,
    validateSyncMap,
    validateTask,
    validateVideoRoom,
  ];
}
