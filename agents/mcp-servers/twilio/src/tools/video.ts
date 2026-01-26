// ABOUTME: Twilio Video tools for programmable video rooms.
// ABOUTME: Provides comprehensive room, participant, and recording management.

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
 * Returns all Video-related tools configured with the given Twilio context.
 */
export function videoTools(context: TwilioContext) {
  const { client } = context;

  const createVideoRoom = createTool(
    'create_video_room',
    'Create a new video room for real-time video communication.',
    z.object({
      uniqueName: z.string().optional().describe('Unique name for the room'),
      type: z.enum(['go', 'peer-to-peer', 'group', 'group-small']).default('group').describe('Room type'),
      maxParticipants: z.number().min(1).max(50).optional().describe('Maximum participants allowed'),
      statusCallback: z.string().url().optional().describe('Webhook URL for room status events'),
      recordParticipantsOnConnect: z.boolean().default(false).describe('Auto-record when participants connect'),
      maxParticipantDuration: z.number().optional().describe('Max duration per participant in seconds'),
      emptyRoomTimeout: z.number().optional().describe('Minutes to keep empty room before closing'),
    }),
    async ({ uniqueName, type, maxParticipants, statusCallback, recordParticipantsOnConnect, maxParticipantDuration, emptyRoomTimeout }) => {
      const roomParams: Record<string, unknown> = {
        type,
        recordParticipantsOnConnect,
      };

      if (uniqueName) roomParams.uniqueName = uniqueName;
      if (maxParticipants) roomParams.maxParticipants = maxParticipants;
      if (statusCallback) roomParams.statusCallback = statusCallback;
      if (maxParticipantDuration) roomParams.maxParticipantDuration = maxParticipantDuration;
      if (emptyRoomTimeout) roomParams.emptyRoomTimeout = emptyRoomTimeout;

      const room = await client.video.v1.rooms.create(roomParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: room.sid,
            uniqueName: room.uniqueName,
            status: room.status,
            type: room.type,
            maxParticipants: room.maxParticipants,
            recordParticipantsOnConnect: room.recordParticipantsOnConnect,
            duration: room.duration,
            dateCreated: room.dateCreated,
            dateUpdated: room.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listVideoRooms = createTool(
    'list_video_rooms',
    'List video rooms in the account.',
    z.object({
      status: z.enum(['in-progress', 'completed', 'failed']).optional().describe('Filter by room status'),
      uniqueName: z.string().optional().describe('Filter by unique name'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum rooms to return'),
    }),
    async ({ status, uniqueName, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) params.status = status;
      if (uniqueName) params.uniqueName = uniqueName;

      const rooms = await client.video.v1.rooms.list(params);

      const result = rooms.map(room => ({
        sid: room.sid,
        uniqueName: room.uniqueName,
        status: room.status,
        type: room.type,
        maxParticipants: room.maxParticipants,
        duration: room.duration,
        dateCreated: room.dateCreated,
        endTime: room.endTime,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            rooms: result,
          }, null, 2),
        }],
      };
    }
  );

  const listRoomParticipants = createTool(
    'list_room_participants',
    'List participants in a video room.',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Video Room SID (starts with RM)'),
      status: z.enum(['connected', 'disconnected']).optional().describe('Filter by participant status'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum participants to return'),
    }),
    async ({ roomSid, status, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) params.status = status;

      const participants = await client.video.v1
        .rooms(roomSid)
        .participants.list(params);

      const result = participants.map(p => ({
        sid: p.sid,
        identity: p.identity,
        status: p.status,
        startTime: p.startTime,
        endTime: p.endTime,
        duration: p.duration,
        dateCreated: p.dateCreated,
        dateUpdated: p.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            roomSid,
            count: result.length,
            participants: result,
          }, null, 2),
        }],
      };
    }
  );

  const getRoom = createTool(
    'get_room',
    'Get details of a specific video room.',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Video Room SID (starts with RM)'),
    }),
    async ({ roomSid }) => {
      const room = await client.video.v1.rooms(roomSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: room.sid,
            uniqueName: room.uniqueName,
            status: room.status,
            type: room.type,
            maxParticipants: room.maxParticipants,
            maxParticipantDuration: room.maxParticipantDuration,
            recordParticipantsOnConnect: room.recordParticipantsOnConnect,
            videoCodecs: room.videoCodecs,
            mediaRegion: room.mediaRegion,
            audioOnly: room.audioOnly,
            duration: room.duration,
            dateCreated: room.dateCreated,
            dateUpdated: room.dateUpdated,
            endTime: room.endTime,
          }, null, 2),
        }],
      };
    }
  );

  const updateRoom = createTool(
    'update_room',
    'Update a video room (e.g., end it).',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Video Room SID (starts with RM)'),
      status: z.enum(['completed']).describe('Set to "completed" to end the room'),
    }),
    async ({ roomSid, status }) => {
      const room = await client.video.v1.rooms(roomSid).update({ status });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: room.sid,
            uniqueName: room.uniqueName,
            status: room.status,
            duration: room.duration,
            endTime: room.endTime,
            dateUpdated: room.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const getParticipant = createTool(
    'get_participant',
    'Get details of a specific room participant.',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Video Room SID (starts with RM)'),
      participantSid: z.string().startsWith('PA').describe('Participant SID (starts with PA)'),
    }),
    async ({ roomSid, participantSid }) => {
      const participant = await client.video.v1
        .rooms(roomSid)
        .participants(participantSid)
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: participant.sid,
            roomSid: participant.roomSid,
            identity: participant.identity,
            status: participant.status,
            startTime: participant.startTime,
            endTime: participant.endTime,
            duration: participant.duration,
            dateCreated: participant.dateCreated,
            dateUpdated: participant.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateParticipant = createTool(
    'update_participant',
    'Update a participant (e.g., disconnect them).',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Video Room SID (starts with RM)'),
      participantSid: z.string().startsWith('PA').describe('Participant SID (starts with PA)'),
      status: z.enum(['disconnected']).describe('Set to "disconnected" to remove participant'),
    }),
    async ({ roomSid, participantSid, status }) => {
      const participant = await client.video.v1
        .rooms(roomSid)
        .participants(participantSid)
        .update({ status });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: participant.sid,
            identity: participant.identity,
            status: participant.status,
            endTime: participant.endTime,
            duration: participant.duration,
          }, null, 2),
        }],
      };
    }
  );

  const listRoomRecordings = createTool(
    'list_room_recordings',
    'List recordings for a specific video room.',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Video Room SID (starts with RM)'),
      status: z.enum(['processing', 'completed', 'deleted', 'failed']).optional().describe('Filter by status'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum recordings to return'),
    }),
    async ({ roomSid, status, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) params.status = status;

      const recordings = await client.video.v1
        .rooms(roomSid)
        .recordings.list(params);

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
            roomSid,
            count: result.length,
            recordings: result,
          }, null, 2),
        }],
      };
    }
  );

  const listSubscribedTracks = createTool(
    'list_subscribed_tracks',
    'List tracks a participant is subscribed to.',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Video Room SID (starts with RM)'),
      participantSid: z.string().startsWith('PA').describe('Participant SID (starts with PA)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum tracks to return'),
    }),
    async ({ roomSid, participantSid, limit }) => {
      const tracks = await client.video.v1
        .rooms(roomSid)
        .participants(participantSid)
        .subscribedTracks.list({ limit });

      const result = tracks.map(t => ({
        sid: t.sid,
        kind: t.kind,
        name: t.name,
        enabled: t.enabled,
        publisherSid: t.publisherSid,
        dateCreated: t.dateCreated,
        dateUpdated: t.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            roomSid,
            participantSid,
            count: result.length,
            subscribedTracks: result,
          }, null, 2),
        }],
      };
    }
  );

  const listPublishedTracks = createTool(
    'list_published_tracks',
    'List tracks published by a participant.',
    z.object({
      roomSid: z.string().startsWith('RM').describe('Video Room SID (starts with RM)'),
      participantSid: z.string().startsWith('PA').describe('Participant SID (starts with PA)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum tracks to return'),
    }),
    async ({ roomSid, participantSid, limit }) => {
      const tracks = await client.video.v1
        .rooms(roomSid)
        .participants(participantSid)
        .publishedTracks.list({ limit });

      const result = tracks.map(t => ({
        sid: t.sid,
        kind: t.kind,
        name: t.name,
        enabled: t.enabled,
        dateCreated: t.dateCreated,
        dateUpdated: t.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            roomSid,
            participantSid,
            count: result.length,
            publishedTracks: result,
          }, null, 2),
        }],
      };
    }
  );

  return [
    createVideoRoom,
    listVideoRooms,
    getRoom,
    updateRoom,
    listRoomParticipants,
    getParticipant,
    updateParticipant,
    listRoomRecordings,
    listSubscribedTracks,
    listPublishedTracks,
  ];
}
