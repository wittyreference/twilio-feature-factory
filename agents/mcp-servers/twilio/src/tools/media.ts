// ABOUTME: Twilio Video Recording tools for media management.
// ABOUTME: Provides list_video_recordings and get_video_recording tools via video API.

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
 * Returns Video Recording tools configured with the given Twilio context.
 * Note: Media v1 API is not exposed in the Node SDK, so we use Video recordings instead.
 */
export function mediaTools(context: TwilioContext) {
  const { client } = context;

  const listVideoRecordings = createTool(
    'list_video_recordings',
    'List video room recordings.',
    z.object({
      status: z.enum(['processing', 'completed', 'deleted', 'failed']).optional().describe('Filter by status'),
      sourceSid: z.string().optional().describe('Filter by source SID (room or participant)'),
      groupingSid: z.string().optional().describe('Filter by grouping SID'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum recordings to return'),
    }),
    async ({ status, sourceSid, groupingSid, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) params.status = status;
      if (sourceSid) params.sourceSid = sourceSid;
      if (groupingSid) params.groupingSid = groupingSid;

      const recordings = await client.video.v1.recordings.list(params);

      const result = recordings.map(r => ({
        sid: r.sid,
        status: r.status,
        sourceSid: r.sourceSid,
        groupingSids: r.groupingSids,
        codec: r.codec,
        type: r.type,
        size: r.size,
        duration: r.duration,
        containerFormat: r.containerFormat,
        dateCreated: r.dateCreated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            recordings: result,
          }, null, 2),
        }],
      };
    }
  );

  const getVideoRecording = createTool(
    'get_video_recording',
    'Get details of a specific video recording.',
    z.object({
      recordingSid: z.string().startsWith('RT').describe('Recording SID (starts with RT)'),
    }),
    async ({ recordingSid }) => {
      const recording = await client.video.v1.recordings(recordingSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: recording.sid,
            status: recording.status,
            sourceSid: recording.sourceSid,
            groupingSids: recording.groupingSids,
            codec: recording.codec,
            type: recording.type,
            size: recording.size,
            duration: recording.duration,
            containerFormat: recording.containerFormat,
            dateCreated: recording.dateCreated,
            mediaExternalLocation: recording.mediaExternalLocation,
          }, null, 2),
        }],
      };
    }
  );

  const listCompositions = createTool(
    'list_compositions',
    'List video room compositions (combined recordings).',
    z.object({
      status: z.enum(['enqueued', 'processing', 'completed', 'deleted', 'failed']).optional().describe('Filter by status'),
      roomSid: z.string().startsWith('RM').optional().describe('Filter by Room SID'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum compositions to return'),
    }),
    async ({ status, roomSid, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) params.status = status;
      if (roomSid) params.roomSid = roomSid;

      const compositions = await client.video.v1.compositions.list(params);

      const result = compositions.map(c => ({
        sid: c.sid,
        status: c.status,
        roomSid: c.roomSid,
        audioSources: c.audioSources,
        videoLayout: c.videoLayout,
        resolution: c.resolution,
        format: c.format,
        bitrate: c.bitrate,
        size: c.size,
        duration: c.duration,
        dateCreated: c.dateCreated,
        dateCompleted: c.dateCompleted,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            compositions: result,
          }, null, 2),
        }],
      };
    }
  );

  const deleteVideoRecording = createTool(
    'delete_video_recording',
    'Delete a video recording.',
    z.object({
      recordingSid: z.string().startsWith('RT').describe('Recording SID (starts with RT)'),
    }),
    async ({ recordingSid }) => {
      await client.video.v1.recordings(recordingSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            recordingSid,
          }, null, 2),
        }],
      };
    }
  );

  const getComposition = createTool(
    'get_composition',
    'Get details of a specific video composition.',
    z.object({
      compositionSid: z.string().startsWith('CJ').describe('Composition SID (starts with CJ)'),
    }),
    async ({ compositionSid }) => {
      const composition = await client.video.v1.compositions(compositionSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: composition.sid,
            status: composition.status,
            roomSid: composition.roomSid,
            audioSources: composition.audioSources,
            videoLayout: composition.videoLayout,
            resolution: composition.resolution,
            format: composition.format,
            bitrate: composition.bitrate,
            size: composition.size,
            duration: composition.duration,
            mediaExternalLocation: composition.mediaExternalLocation,
            dateCreated: composition.dateCreated,
            dateCompleted: composition.dateCompleted,
          }, null, 2),
        }],
      };
    }
  );

  const createComposition = createTool(
    'create_composition',
    'Create a video composition from room recordings.',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Room SID to compose recordings from'),
      audioSources: z.array(z.string()).optional().describe('Audio source SIDs to include'),
      videoLayout: z.record(z.unknown()).optional().describe('Video layout configuration'),
      resolution: z.enum(['640x480', '1280x720', '1920x1080']).default('1280x720').describe('Output resolution'),
      format: z.enum(['mp4', 'webm']).default('mp4').describe('Output format'),
      statusCallback: z.string().url().optional().describe('Webhook URL for status updates'),
      statusCallbackMethod: z.enum(['GET', 'POST']).default('POST').describe('HTTP method for status callback'),
      trim: z.boolean().default(true).describe('Trim empty space from beginning/end'),
    }),
    async ({ roomSid, audioSources, videoLayout, resolution, format, statusCallback, statusCallbackMethod, trim }) => {
      const composition = await client.video.v1.compositions.create({
        roomSid,
        resolution,
        format,
        statusCallbackMethod,
        trim,
        ...(audioSources && { audioSources }),
        ...(videoLayout && { videoLayout }),
        ...(statusCallback && { statusCallback }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: composition.sid,
            status: composition.status,
            roomSid: composition.roomSid,
            resolution: composition.resolution,
            format: composition.format,
            dateCreated: composition.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteComposition = createTool(
    'delete_composition',
    'Delete a video composition.',
    z.object({
      compositionSid: z.string().startsWith('CJ').describe('Composition SID (starts with CJ)'),
    }),
    async ({ compositionSid }) => {
      await client.video.v1.compositions(compositionSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            compositionSid,
          }, null, 2),
        }],
      };
    }
  );

  const listCompositionHooks = createTool(
    'list_composition_hooks',
    'List composition hooks (automatic composition rules).',
    z.object({
      enabled: z.boolean().optional().describe('Filter by enabled status'),
      friendlyName: z.string().optional().describe('Filter by friendly name'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum hooks to return'),
    }),
    async ({ enabled, friendlyName, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (enabled !== undefined) params.enabled = enabled;
      if (friendlyName) params.friendlyName = friendlyName;

      const hooks = await client.video.v1.compositionHooks.list(params);

      const result = hooks.map(h => ({
        sid: h.sid,
        friendlyName: h.friendlyName,
        enabled: h.enabled,
        audioSources: h.audioSources,
        videoLayout: h.videoLayout,
        resolution: h.resolution,
        format: h.format,
        statusCallback: h.statusCallback,
        dateCreated: h.dateCreated,
        dateUpdated: h.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            compositionHooks: result,
          }, null, 2),
        }],
      };
    }
  );

  const createCompositionHook = createTool(
    'create_composition_hook',
    'Create a composition hook for automatic room composition.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the hook'),
      enabled: z.boolean().default(true).describe('Whether the hook is enabled'),
      audioSources: z.array(z.string()).optional().describe('Audio source wildcards'),
      videoLayout: z.record(z.unknown()).optional().describe('Video layout configuration'),
      resolution: z.enum(['640x480', '1280x720', '1920x1080']).default('1280x720').describe('Output resolution'),
      format: z.enum(['mp4', 'webm']).default('mp4').describe('Output format'),
      statusCallback: z.string().url().optional().describe('Webhook URL for status updates'),
    }),
    async ({ friendlyName, enabled, audioSources, videoLayout, resolution, format, statusCallback }) => {
      const hook = await client.video.v1.compositionHooks.create({
        friendlyName,
        enabled,
        resolution,
        format,
        ...(audioSources && { audioSources }),
        ...(videoLayout && { videoLayout }),
        ...(statusCallback && { statusCallback }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: hook.sid,
            friendlyName: hook.friendlyName,
            enabled: hook.enabled,
            resolution: hook.resolution,
            format: hook.format,
            dateCreated: hook.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteCompositionHook = createTool(
    'delete_composition_hook',
    'Delete a composition hook.',
    z.object({
      compositionHookSid: z.string().startsWith('HK').describe('Composition Hook SID (starts with HK)'),
    }),
    async ({ compositionHookSid }) => {
      await client.video.v1.compositionHooks(compositionHookSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            compositionHookSid,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listVideoRecordings,
    getVideoRecording,
    deleteVideoRecording,
    listCompositions,
    getComposition,
    createComposition,
    deleteComposition,
    listCompositionHooks,
    createCompositionHook,
    deleteCompositionHook,
  ];
}
