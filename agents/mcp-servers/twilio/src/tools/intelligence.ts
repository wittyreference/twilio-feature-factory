// ABOUTME: Twilio Intelligence v2 tools for conversation analysis.
// ABOUTME: Provides list_intelligence_services and list_transcripts tools.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
) {
  return { name, description, inputSchema: schema, handler };
}

/**
 * Returns all Intelligence-related tools configured with the given Twilio context.
 */
export function intelligenceTools(context: TwilioContext) {
  const { client } = context;

  const listIntelligenceServices = createTool(
    'list_intelligence_services',
    'List available Intelligence services in the account.',
    z.object({
      limit: z.number().min(1).max(50).default(20).describe('Maximum services to return'),
    }),
    async ({ limit }) => {
      const services = await client.intelligence.v2.services.list({ limit });

      const result = services.map(s => ({
        sid: s.sid,
        uniqueName: s.uniqueName,
        friendlyName: s.friendlyName,
        autoTranscribe: s.autoTranscribe,
        dataLogging: s.dataLogging,
        dateCreated: s.dateCreated,
        dateUpdated: s.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            services: result,
          }, null, 2),
        }],
      };
    }
  );

  const listTranscripts = createTool(
    'list_transcripts',
    'List transcripts in the account.',
    z.object({
      limit: z.number().min(1).max(50).default(20).describe('Maximum transcripts to return'),
    }),
    async ({ limit }) => {
      const transcripts = await client.intelligence.v2.transcripts.list({ limit });

      const result = transcripts.map(t => {
        const transcript = t as unknown as Record<string, unknown>;
        return {
          sid: transcript.sid,
          serviceSid: transcript.serviceSid,
          status: transcript.status,
          channel: transcript.channel,
          dateCreated: transcript.dateCreated,
          dateUpdated: transcript.dateUpdated,
        };
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            transcripts: result,
          }, null, 2),
        }],
      };
    }
  );

  const getTranscript = createTool(
    'get_transcript',
    'Get details of a specific transcript.',
    z.object({
      transcriptSid: z.string().startsWith('GT').describe('Transcript SID (starts with GT)'),
    }),
    async ({ transcriptSid }) => {
      const transcript = await client.intelligence.v2.transcripts(transcriptSid).fetch();

      const t = transcript as unknown as Record<string, unknown>;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: t.sid,
            serviceSid: t.serviceSid,
            status: t.status,
            channel: t.channel,
            dateCreated: t.dateCreated,
            dateUpdated: t.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const getIntelligenceService = createTool(
    'get_intelligence_service',
    'Get details of a specific Intelligence service.',
    z.object({
      serviceSid: z.string().startsWith('GA').describe('Intelligence Service SID (starts with GA)'),
    }),
    async ({ serviceSid }) => {
      const service = await client.intelligence.v2.services(serviceSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            uniqueName: service.uniqueName,
            friendlyName: service.friendlyName,
            autoTranscribe: service.autoTranscribe,
            dataLogging: service.dataLogging,
            languageCode: service.languageCode,
            dateCreated: service.dateCreated,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteTranscript = createTool(
    'delete_transcript',
    'Delete a transcript.',
    z.object({
      transcriptSid: z.string().startsWith('GT').describe('Transcript SID (starts with GT)'),
    }),
    async ({ transcriptSid }) => {
      await client.intelligence.v2.transcripts(transcriptSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            transcriptSid,
          }, null, 2),
        }],
      };
    }
  );

  const listSentences = createTool(
    'list_sentences',
    'List sentences (utterances) in a transcript.',
    z.object({
      transcriptSid: z.string().startsWith('GT').describe('Transcript SID (starts with GT)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum sentences to return'),
    }),
    async ({ transcriptSid, limit }) => {
      const sentences = await client.intelligence.v2
        .transcripts(transcriptSid)
        .sentences.list({ limit });

      const result = sentences.map(s => {
        const sentence = s as unknown as Record<string, unknown>;
        return {
          sid: sentence.sid,
          transcript: sentence.transcript,
          confidence: sentence.confidence,
          startTime: sentence.startTime,
          endTime: sentence.endTime,
          mediaChannel: sentence.mediaChannel,
        };
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            transcriptSid,
            count: result.length,
            sentences: result,
          }, null, 2),
        }],
      };
    }
  );

  const listOperatorResults = createTool(
    'list_operator_results',
    'List operator results (PII detection, sentiment, etc.) for a transcript.',
    z.object({
      transcriptSid: z.string().startsWith('GT').describe('Transcript SID (starts with GT)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum results to return'),
    }),
    async ({ transcriptSid, limit }) => {
      const results = await client.intelligence.v2
        .transcripts(transcriptSid)
        .operatorResults.list({ limit });

      const output = results.map(r => {
        const result = r as unknown as Record<string, unknown>;
        return {
          operatorSid: result.operatorSid,
          operatorType: result.operatorType,
          name: result.name,
          extractMatch: result.extractMatch,
          matchProbability: result.matchProbability,
          textGenerationResults: result.textGenerationResults,
          utteranceResults: result.utteranceResults,
        };
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            transcriptSid,
            count: output.length,
            operatorResults: output,
          }, null, 2),
        }],
      };
    }
  );

  const getTranscriptMedia = createTool(
    'get_transcript_media',
    'Get media information for a transcript.',
    z.object({
      transcriptSid: z.string().startsWith('GT').describe('Transcript SID (starts with GT)'),
    }),
    async ({ transcriptSid }) => {
      const media = await client.intelligence.v2
        .transcripts(transcriptSid)
        .media()
        .fetch();

      const mediaData = media as unknown as Record<string, unknown>;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            transcriptSid,
            mediaUrl: mediaData.mediaUrl,
            redactedMediaUrl: mediaData.redactedMediaUrl,
          }, null, 2),
        }],
      };
    }
  );

  const createTranscript = createTool(
    'create_transcript',
    'Create a transcript from a recording URL. Submits audio to Voice Intelligence for transcription and language operator processing.',
    z.object({
      serviceSid: z.string().startsWith('GA').describe('Intelligence Service SID (starts with GA)'),
      sourceSid: z.string().startsWith('RE').optional().describe('Recording SID (preferred over mediaUrl for Twilio recordings)'),
      mediaUrl: z.string().url().optional().describe('URL of the audio recording (use sourceSid instead for Twilio recordings)'),
      customerKey: z.string().optional().describe('Optional customer identifier for metadata (max 64 chars)'),
    }),
    async ({ serviceSid, sourceSid, mediaUrl, customerKey }) => {
      if (!sourceSid && !mediaUrl) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Either sourceSid or mediaUrl must be provided' }) }],
        };
      }

      // Channel format for Voice Intelligence API
      // Prefer source_sid for Twilio recordings (Intelligence API cannot authenticate to api.twilio.com for media_url)
      const mediaProperties: Record<string, string> = {};
      if (sourceSid) {
        mediaProperties.source_sid = sourceSid;
      } else if (mediaUrl) {
        mediaProperties.media_url = mediaUrl;
      }

      const channel = {
        media_properties: mediaProperties,
        participants: [
          { channel_participant: 1, user_id: 'caller' },
          { channel_participant: 2, user_id: 'agent' },
        ],
      };

      const transcript = await client.intelligence.v2.transcripts.create({
        serviceSid,
        channel,
        customerKey,
      });

      const t = transcript as unknown as Record<string, unknown>;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            transcriptSid: t.sid,
            serviceSid: t.serviceSid,
            status: t.status,
            dateCreated: t.dateCreated,
            message: 'Transcript creation initiated. Use get_transcript to check status (queued -> in-progress -> completed). Transcription typically takes 1-3 minutes.',
          }, null, 2),
        }],
      };
    }
  );

  return [
    listIntelligenceServices,
    getIntelligenceService,
    createTranscript,
    listTranscripts,
    getTranscript,
    deleteTranscript,
    listSentences,
    listOperatorResults,
    getTranscriptMedia,
  ];
}
