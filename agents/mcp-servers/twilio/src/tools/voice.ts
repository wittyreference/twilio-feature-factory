// ABOUTME: Twilio voice tools for call operations.
// ABOUTME: Provides call management, conferences, recordings, media streams, insights, and transcriptions.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';

const e164Pattern = /^\+[1-9]\d{1,14}$/;
const phoneNumberSchema = z.string().regex(e164Pattern, {
  message: 'Phone number must be in E.164 format (e.g., +15551234567)',
});

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
) {
  return { name, description, inputSchema: schema, handler };
}

/**
 * Returns all voice-related tools configured with the given Twilio context.
 */
export function voiceTools(context: TwilioContext) {
  const { client, defaultFromNumber } = context;

  const getCallLogs = createTool(
    'get_call_logs',
    'Retrieve recent call logs with optional filtering.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      status: z.enum(['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled']).optional(),
      to: phoneNumberSchema.optional().describe('Filter by destination number'),
      from: phoneNumberSchema.optional().describe('Filter by caller number'),
      startTimeAfter: z.string().datetime().optional().describe('Filter calls started after this ISO datetime'),
      startTimeBefore: z.string().datetime().optional().describe('Filter calls started before this ISO datetime'),
    }),
    async ({ limit, status, to, from, startTimeAfter, startTimeBefore }) => {
      const filters: {
        limit: number;
        status?: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
        to?: string;
        from?: string;
        startTimeAfter?: Date;
        startTimeBefore?: Date;
      } = { limit: limit || 20 };

      if (status) filters.status = status as typeof filters.status;
      if (to) filters.to = to;
      if (from) filters.from = from;
      if (startTimeAfter) filters.startTimeAfter = new Date(startTimeAfter);
      if (startTimeBefore) filters.startTimeBefore = new Date(startTimeBefore);

      const calls = await client.calls.list(filters);

      const formattedCalls = calls.map((c) => ({
        sid: c.sid,
        to: c.to,
        from: c.from,
        status: c.status,
        direction: c.direction,
        duration: c.duration,
        startTime: c.startTime,
        endTime: c.endTime,
        price: c.price,
        priceUnit: c.priceUnit,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedCalls.length, calls: formattedCalls }, null, 2),
        }],
      };
    }
  );

  const makeCall = createTool(
    'make_call',
    'Initiate an outbound call. Requires a TwiML URL or application SID.',
    z.object({
      to: phoneNumberSchema.describe('Destination phone number in E.164 format'),
      from: phoneNumberSchema.optional().describe('Caller ID (defaults to configured number)'),
      url: z.string().url().optional().describe('TwiML URL for call handling'),
      twiml: z.string().optional().describe('Raw TwiML to execute'),
    }).refine((data) => data.url || data.twiml, {
      message: 'Either url or twiml must be provided',
    }),
    async ({ to, from, url, twiml }) => {
      const callParams: { to: string; from: string; url?: string; twiml?: string } = {
        to,
        from: from || defaultFromNumber,
      };

      if (url) callParams.url = url;
      if (twiml) callParams.twiml = twiml;

      const call = await client.calls.create(callParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: call.sid,
            status: call.status,
            to: call.to,
            from: call.from,
            direction: call.direction,
            dateCreated: call.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const getRecording = createTool(
    'get_recording',
    'Fetch details and download URL for a call recording.',
    z.object({
      recordingSid: z.string().startsWith('RE').describe('Recording SID (starts with RE)'),
    }),
    async ({ recordingSid }) => {
      const recording = await client.recordings(recordingSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: recording.sid,
            callSid: recording.callSid,
            duration: recording.duration,
            channels: recording.channels,
            dateCreated: recording.dateCreated,
            status: recording.status,
            mediaUrl: `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Conference Tools
  // ============================================

  const listConferences = createTool(
    'list_conferences',
    'List conferences with optional filtering by status, friendly name, or date range.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      status: z.enum(['init', 'in-progress', 'completed']).optional().describe('Filter by conference status'),
      friendlyName: z.string().optional().describe('Filter by exact friendly name'),
      dateCreatedAfter: z.string().datetime().optional().describe('Filter conferences created after this ISO datetime'),
      dateCreatedBefore: z.string().datetime().optional().describe('Filter conferences created before this ISO datetime'),
    }),
    async ({ limit, status, friendlyName, dateCreatedAfter, dateCreatedBefore }) => {
      const filters: {
        limit: number;
        status?: 'init' | 'in-progress' | 'completed';
        friendlyName?: string;
        dateCreatedAfter?: Date;
        dateCreatedBefore?: Date;
      } = { limit: limit || 20 };

      if (status) filters.status = status;
      if (friendlyName) filters.friendlyName = friendlyName;
      if (dateCreatedAfter) filters.dateCreatedAfter = new Date(dateCreatedAfter);
      if (dateCreatedBefore) filters.dateCreatedBefore = new Date(dateCreatedBefore);

      const conferences = await client.conferences.list(filters);

      const formatted = conferences.map((c) => ({
        sid: c.sid,
        friendlyName: c.friendlyName,
        status: c.status,
        region: c.region,
        dateCreated: c.dateCreated,
        dateUpdated: c.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, conferences: formatted }, null, 2),
        }],
      };
    }
  );

  const getConference = createTool(
    'get_conference',
    'Get detailed information about a specific conference.',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
    }),
    async ({ conferenceSid }) => {
      const conference = await client.conferences(conferenceSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: conference.sid,
            friendlyName: conference.friendlyName,
            status: conference.status,
            region: conference.region,
            reasonConferenceEnded: conference.reasonConferenceEnded,
            callSidEndingConference: conference.callSidEndingConference,
            dateCreated: conference.dateCreated,
            dateUpdated: conference.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateConference = createTool(
    'update_conference',
    'Update a conference (e.g., end it by setting status to completed).',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
      status: z.enum(['completed']).describe('Set to completed to end the conference'),
      announceUrl: z.string().url().optional().describe('URL for announcement TwiML to play to all participants'),
      announceMethod: z.enum(['GET', 'POST']).optional().describe('HTTP method for announceUrl'),
    }),
    async ({ conferenceSid, status, announceUrl, announceMethod }) => {
      const updateParams: {
        status: 'completed';
        announceUrl?: string;
        announceMethod?: 'GET' | 'POST';
      } = { status };

      if (announceUrl) updateParams.announceUrl = announceUrl;
      if (announceMethod) updateParams.announceMethod = announceMethod;

      const conference = await client.conferences(conferenceSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: conference.sid,
            status: conference.status,
            friendlyName: conference.friendlyName,
          }, null, 2),
        }],
      };
    }
  );

  const listConferenceParticipants = createTool(
    'list_conference_participants',
    'List participants in a conference.',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Max results (1-100, default 50)'),
      muted: z.boolean().optional().describe('Filter by muted status'),
      hold: z.boolean().optional().describe('Filter by hold status'),
    }),
    async ({ conferenceSid, limit, muted, hold }) => {
      const filters: {
        limit: number;
        muted?: boolean;
        hold?: boolean;
      } = { limit: limit || 50 };

      if (muted !== undefined) filters.muted = muted;
      if (hold !== undefined) filters.hold = hold;

      const participants = await client.conferences(conferenceSid).participants.list(filters);

      const formatted = participants.map((p) => ({
        callSid: p.callSid,
        label: p.label,
        muted: p.muted,
        hold: p.hold,
        coaching: p.coaching,
        status: p.status,
        startConferenceOnEnter: p.startConferenceOnEnter,
        endConferenceOnExit: p.endConferenceOnExit,
        dateCreated: p.dateCreated,
        dateUpdated: p.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, participants: formatted }, null, 2),
        }],
      };
    }
  );

  const getConferenceParticipant = createTool(
    'get_conference_participant',
    'Get details about a specific participant in a conference.',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
      callSid: z.string().startsWith('CA').describe('Call SID of the participant (starts with CA)'),
    }),
    async ({ conferenceSid, callSid }) => {
      const participant = await client.conferences(conferenceSid).participants(callSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            callSid: participant.callSid,
            conferenceSid: participant.conferenceSid,
            label: participant.label,
            muted: participant.muted,
            hold: participant.hold,
            coaching: participant.coaching,
            status: participant.status,
            startConferenceOnEnter: participant.startConferenceOnEnter,
            endConferenceOnExit: participant.endConferenceOnExit,
            dateCreated: participant.dateCreated,
            dateUpdated: participant.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateConferenceParticipant = createTool(
    'update_conference_participant',
    'Update a participant (mute, hold, or coach).',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
      callSid: z.string().startsWith('CA').describe('Call SID of the participant (starts with CA)'),
      muted: z.boolean().optional().describe('Mute or unmute the participant'),
      hold: z.boolean().optional().describe('Place on hold or resume'),
      holdUrl: z.string().url().optional().describe('URL for hold music TwiML'),
      holdMethod: z.enum(['GET', 'POST']).optional().describe('HTTP method for holdUrl'),
      coaching: z.boolean().optional().describe('Enable coaching mode (hear without being heard by others)'),
      callSidToCoach: z.string().startsWith('CA').optional().describe('Call SID to coach (required when coaching=true)'),
      endConferenceOnExit: z.boolean().optional().describe('End conference when participant leaves'),
    }),
    async ({ conferenceSid, callSid, muted, hold, holdUrl, holdMethod, coaching, callSidToCoach, endConferenceOnExit }) => {
      const updateParams: {
        muted?: boolean;
        hold?: boolean;
        holdUrl?: string;
        holdMethod?: 'GET' | 'POST';
        coaching?: boolean;
        callSidToCoach?: string;
        endConferenceOnExit?: boolean;
      } = {};

      if (muted !== undefined) updateParams.muted = muted;
      if (hold !== undefined) updateParams.hold = hold;
      if (holdUrl) updateParams.holdUrl = holdUrl;
      if (holdMethod) updateParams.holdMethod = holdMethod;
      if (coaching !== undefined) updateParams.coaching = coaching;
      if (callSidToCoach) updateParams.callSidToCoach = callSidToCoach;
      if (endConferenceOnExit !== undefined) updateParams.endConferenceOnExit = endConferenceOnExit;

      const participant = await client.conferences(conferenceSid).participants(callSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            callSid: participant.callSid,
            muted: participant.muted,
            hold: participant.hold,
            coaching: participant.coaching,
            status: participant.status,
          }, null, 2),
        }],
      };
    }
  );

  const addParticipantToConference = createTool(
    'add_participant_to_conference',
    'Add a new participant to an existing conference using the Participants API.',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
      to: phoneNumberSchema.describe('Phone number to dial in E.164 format'),
      from: phoneNumberSchema.optional().describe('Caller ID (defaults to configured number)'),
      label: z.string().optional().describe('Label for the participant'),
      earlyMedia: z.boolean().optional().default(true).describe('Enable early media (ringback tones)'),
      beep: z.enum(['true', 'false', 'onEnter', 'onExit']).optional().describe('Play beep on join/leave'),
      muted: z.boolean().optional().default(false).describe('Join muted'),
      hold: z.boolean().optional().default(false).describe('Join on hold'),
      startConferenceOnEnter: z.boolean().optional().default(true).describe('Start conference when this participant joins'),
      endConferenceOnExit: z.boolean().optional().default(false).describe('End conference when this participant leaves'),
      coaching: z.boolean().optional().describe('Join in coaching mode'),
      callSidToCoach: z.string().startsWith('CA').optional().describe('Call SID to coach'),
      record: z.boolean().optional().describe('Record participant audio'),
    }),
    async ({ conferenceSid, to, from, label, earlyMedia, beep, muted, hold, startConferenceOnEnter, endConferenceOnExit, coaching, callSidToCoach, record }) => {
      const createParams: {
        to: string;
        from: string;
        label?: string;
        earlyMedia?: boolean;
        beep?: string;
        muted?: boolean;
        hold?: boolean;
        startConferenceOnEnter?: boolean;
        endConferenceOnExit?: boolean;
        coaching?: boolean;
        callSidToCoach?: string;
        record?: boolean;
      } = {
        to,
        from: from || defaultFromNumber,
      };

      if (label) createParams.label = label;
      if (earlyMedia !== undefined) createParams.earlyMedia = earlyMedia;
      if (beep) createParams.beep = beep;
      if (muted !== undefined) createParams.muted = muted;
      if (hold !== undefined) createParams.hold = hold;
      if (startConferenceOnEnter !== undefined) createParams.startConferenceOnEnter = startConferenceOnEnter;
      if (endConferenceOnExit !== undefined) createParams.endConferenceOnExit = endConferenceOnExit;
      if (coaching !== undefined) createParams.coaching = coaching;
      if (callSidToCoach) createParams.callSidToCoach = callSidToCoach;
      if (record !== undefined) createParams.record = record;

      const participant = await client.conferences(conferenceSid).participants.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            callSid: participant.callSid,
            conferenceSid: participant.conferenceSid,
            label: participant.label,
            muted: participant.muted,
            hold: participant.hold,
            status: participant.status,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Call Control Tools
  // ============================================

  const getCall = createTool(
    'get_call',
    'Get detailed information about a specific call.',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
    }),
    async ({ callSid }) => {
      const call = await client.calls(callSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: call.sid,
            parentCallSid: call.parentCallSid,
            to: call.to,
            from: call.from,
            status: call.status,
            direction: call.direction,
            duration: call.duration,
            answeredBy: call.answeredBy,
            callerName: call.callerName,
            startTime: call.startTime,
            endTime: call.endTime,
            forwardedFrom: call.forwardedFrom,
            price: call.price,
            priceUnit: call.priceUnit,
            groupSid: call.groupSid,
            trunkSid: call.trunkSid,
          }, null, 2),
        }],
      };
    }
  );

  const updateCall = createTool(
    'update_call',
    'Modify an in-progress call (redirect, end, or play announcement).',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      status: z.enum(['completed', 'canceled']).optional().describe('Set to completed/canceled to end the call'),
      url: z.string().url().optional().describe('URL for new TwiML to execute'),
      method: z.enum(['GET', 'POST']).optional().describe('HTTP method for URL'),
      twiml: z.string().optional().describe('Raw TwiML to execute'),
    }).refine((data) => data.status || data.url || data.twiml, {
      message: 'At least one of status, url, or twiml must be provided',
    }),
    async ({ callSid, status, url, method, twiml }) => {
      const updateParams: {
        status?: 'completed' | 'canceled';
        url?: string;
        method?: 'GET' | 'POST';
        twiml?: string;
      } = {};

      if (status) updateParams.status = status;
      if (url) updateParams.url = url;
      if (method) updateParams.method = method;
      if (twiml) updateParams.twiml = twiml;

      const call = await client.calls(callSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: call.sid,
            status: call.status,
            to: call.to,
            from: call.from,
          }, null, 2),
        }],
      };
    }
  );

  const listCallRecordings = createTool(
    'list_call_recordings',
    'List all recordings for a specific call.',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
    }),
    async ({ callSid, limit }) => {
      const recordings = await client.calls(callSid).recordings.list({ limit: limit || 20 });

      const formatted = recordings.map((r) => ({
        sid: r.sid,
        callSid: r.callSid,
        duration: r.duration,
        channels: r.channels,
        status: r.status,
        source: r.source,
        dateCreated: r.dateCreated,
        mediaUrl: `https://api.twilio.com${r.uri.replace('.json', '.mp3')}`,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, recordings: formatted }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Account-Level Recording Tools
  // ============================================
  // RECORDING SOURCES:
  // - DialVerb: From <Dial> verb
  // - Conference: From conference recording
  // - OutboundAPI: From Calls API with record parameter
  // - Trunking: From Elastic SIP Trunking
  // - RecordVerb: From <Record> verb
  // - StartCallRecordingAPI: From this API (start_call_recording)
  // - StartConferenceRecordingAPI: From conference recording API

  const listRecordings = createTool(
    'list_recordings',
    'List all recordings in the account with optional filtering by date, call, or conference. ' +
      'For recordings from a specific call, use list_call_recordings instead.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      callSid: z.string().startsWith('CA').optional().describe('Filter by Call SID'),
      conferenceSid: z.string().startsWith('CF').optional().describe('Filter by Conference SID'),
      dateCreatedAfter: z.string().datetime().optional().describe('Filter recordings created after this ISO datetime'),
      dateCreatedBefore: z.string().datetime().optional().describe('Filter recordings created before this ISO datetime'),
      includeSoftDeleted: z.boolean().optional().default(false).describe('Include soft-deleted recordings (retained 40 days)'),
    }),
    async ({ limit, callSid, conferenceSid, dateCreatedAfter, dateCreatedBefore, includeSoftDeleted }) => {
      const filters: {
        limit: number;
        callSid?: string;
        conferenceSid?: string;
        dateCreatedAfter?: Date;
        dateCreatedBefore?: Date;
        includeSoftDeleted?: boolean;
      } = { limit: limit || 20 };

      if (callSid) filters.callSid = callSid;
      if (conferenceSid) filters.conferenceSid = conferenceSid;
      if (dateCreatedAfter) filters.dateCreatedAfter = new Date(dateCreatedAfter);
      if (dateCreatedBefore) filters.dateCreatedBefore = new Date(dateCreatedBefore);
      if (includeSoftDeleted) filters.includeSoftDeleted = includeSoftDeleted;

      const recordings = await client.recordings.list(filters);

      const formatted = recordings.map((r) => ({
        sid: r.sid,
        callSid: r.callSid,
        conferenceSid: r.conferenceSid,
        duration: r.duration,
        channels: r.channels,
        status: r.status,
        source: r.source,
        startTime: r.startTime,
        dateCreated: r.dateCreated,
        price: r.price,
        priceUnit: r.priceUnit,
        errorCode: r.errorCode,
        mediaUrl: r.mediaUrl || `https://api.twilio.com${r.uri.replace('.json', '.mp3')}`,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, recordings: formatted }, null, 2),
        }],
      };
    }
  );

  const deleteRecording = createTool(
    'delete_recording',
    'Delete a recording. Recordings are soft-deleted and metadata is retained for 40 days. ' +
      'Use includeSoftDeleted in list_recordings to see deleted recordings.',
    z.object({
      recordingSid: z.string().startsWith('RE').describe('Recording SID (starts with RE)'),
    }),
    async ({ recordingSid }) => {
      const deleted = await client.recordings(recordingSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: deleted,
            message: deleted ? 'Recording deleted (soft delete, metadata retained 40 days)' : 'Failed to delete recording',
            recordingSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Active Call Recording Control
  // ============================================
  // Use these to start/pause/resume/stop recordings on active calls.
  // Different from recordings created via TwiML (<Record>, <Dial record=...>).

  const startCallRecording = createTool(
    'start_call_recording',
    'Start recording an active call. Creates a recording with source "StartCallRecordingAPI". ' +
      'For TwiML-based recording, use <Record> verb or record attribute on <Dial>. ' +
      'Recording can be paused/resumed using update_call_recording.',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID of the active call (starts with CA)'),
      recordingChannels: z.enum(['mono', 'dual']).optional().default('mono')
        .describe('mono=all parties in one channel, dual=separate channels per party'),
      recordingTrack: z.enum(['inbound', 'outbound', 'both']).optional().default('both')
        .describe('Which audio tracks to record. inbound=received by Twilio, outbound=generated by Twilio'),
      trim: z.enum(['trim-silence', 'do-not-trim']).optional().default('do-not-trim')
        .describe('Trim silence from beginning and end of recording'),
      recordingStatusCallback: z.string().url().optional()
        .describe('URL for recording status callbacks'),
      recordingStatusCallbackMethod: z.enum(['GET', 'POST']).optional().default('POST')
        .describe('HTTP method for status callbacks'),
      recordingStatusCallbackEvent: z.array(z.enum(['in-progress', 'completed', 'absent'])).optional()
        .describe('Events to trigger callbacks. Default: completed'),
    }),
    async ({
      callSid, recordingChannels, recordingTrack, trim,
      recordingStatusCallback, recordingStatusCallbackMethod, recordingStatusCallbackEvent
    }) => {
      const createParams: {
        recordingChannels?: string;
        recordingTrack?: string;
        trim?: string;
        recordingStatusCallback?: string;
        recordingStatusCallbackMethod?: string;
        recordingStatusCallbackEvent?: string[];
      } = {};

      if (recordingChannels) createParams.recordingChannels = recordingChannels;
      if (recordingTrack) createParams.recordingTrack = recordingTrack;
      if (trim) createParams.trim = trim;
      if (recordingStatusCallback) createParams.recordingStatusCallback = recordingStatusCallback;
      if (recordingStatusCallbackMethod) createParams.recordingStatusCallbackMethod = recordingStatusCallbackMethod;
      if (recordingStatusCallbackEvent) createParams.recordingStatusCallbackEvent = recordingStatusCallbackEvent;

      const recording = await client.calls(callSid).recordings.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: 'Recording started',
            sid: recording.sid,
            callSid: recording.callSid,
            status: recording.status,
            channels: recording.channels,
            source: recording.source,
            track: recording.track,
            dateCreated: recording.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateCallRecording = createTool(
    'update_call_recording',
    'Pause, resume, or stop a recording on an active call. ' +
      'Use status "paused" to pause, "in-progress" to resume, "stopped" to stop. ' +
      'When pausing, pauseBehavior controls whether to skip or insert silence.',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      recordingSid: z.string().startsWith('RE').describe('Recording SID (starts with RE)'),
      status: z.enum(['in-progress', 'paused', 'stopped']).describe(
        'in-progress=resume, paused=pause, stopped=stop (cannot resume after stopped)'
      ),
      pauseBehavior: z.enum(['skip', 'silence']).optional().default('silence').describe(
        'When pausing: skip=no audio recorded during pause, silence=insert silence'
      ),
    }),
    async ({ callSid, recordingSid, status, pauseBehavior }) => {
      const updateParams: {
        status: 'in-progress' | 'paused' | 'stopped';
        pauseBehavior?: string;
      } = { status };

      if (status === 'paused' && pauseBehavior) {
        updateParams.pauseBehavior = pauseBehavior;
      }

      const recording = await client.calls(callSid).recordings(recordingSid).update(updateParams);

      const statusMessage = {
        'in-progress': 'Recording resumed',
        'paused': 'Recording paused',
        'stopped': 'Recording stopped',
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: statusMessage[status],
            sid: recording.sid,
            callSid: recording.callSid,
            status: recording.status,
            dateUpdated: recording.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteCallRecording = createTool(
    'delete_call_recording',
    'Delete a specific recording from a call. Same as delete_recording but scoped to a call.',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      recordingSid: z.string().startsWith('RE').describe('Recording SID (starts with RE)'),
    }),
    async ({ callSid, recordingSid }) => {
      const deleted = await client.calls(callSid).recordings(recordingSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: deleted,
            message: deleted ? 'Recording deleted' : 'Failed to delete recording',
            callSid,
            recordingSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Voice Insights Tools
  // ============================================
  // TIMING NOTE: Voice Insights summaries are NOT available immediately after call end.
  // - Partial data (partial=true): Available within ~2 minutes (no SLA)
  // - Final data (partial=false): Locked and immutable 30 minutes after call end
  // Check processingState in response: 'partial' or 'complete'

  const getCallSummary = createTool(
    'get_call_summary',
    'Get Voice Insights summary for a call (quality metrics, edge location, etc.). ' +
      'NOTE: Summaries are not immediately available after call end. ' +
      'Use partial=true for early access (~2 min), final data is locked 30 min after call end. ' +
      'Check processingState in response for data completeness.',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      processingState: z.enum(['partial', 'complete']).optional().describe(
        'Request partial (early, may change) or complete (final, locked 30min after call) data'
      ),
    }),
    async ({ callSid, processingState }) => {
      const fetchOptions: { processingState?: 'partial' | 'complete' } = {};
      if (processingState) fetchOptions.processingState = processingState;

      const summary = await client.insights.v1.calls(callSid).summary().fetch(fetchOptions);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            callSid: summary.callSid,
            callType: summary.callType,
            callState: summary.callState,
            processingState: summary.processingState,
            duration: summary.duration,
            connectDuration: summary.connectDuration,
            from: summary.from,
            to: summary.to,
            carrierEdge: summary.carrierEdge,
            clientEdge: summary.clientEdge,
            sdkEdge: summary.sdkEdge,
            sipEdge: summary.sipEdge,
            tags: summary.tags,
            attributes: summary.attributes,
            properties: summary.properties,
            startTime: summary.startTime,
            endTime: summary.endTime,
          }, null, 2),
        }],
      };
    }
  );

  const listCallEvents = createTool(
    'list_call_events',
    'List Voice Insights events for a call (ringing, answered, etc.).',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Max results (1-100, default 50)'),
      edge: z.enum(['unknown_edge', 'carrier_edge', 'sip_edge', 'sdk_edge', 'client_edge']).optional().describe('Filter by edge'),
    }),
    async ({ callSid, limit, edge }) => {
      const filters: {
        limit: number;
        edge?: 'unknown_edge' | 'carrier_edge' | 'sip_edge' | 'sdk_edge' | 'client_edge';
      } = { limit: limit || 50 };

      if (edge) filters.edge = edge;

      const events = await client.insights.v1.calls(callSid).events.list(filters);

      const formatted = events.map((e) => ({
        timestamp: e.timestamp,
        callSid: e.callSid,
        accountSid: e.accountSid,
        edge: e.edge,
        group: e.group,
        level: e.level,
        name: e.name,
        carrierEdge: e.carrierEdge,
        sipEdge: e.sipEdge,
        sdkEdge: e.sdkEdge,
        clientEdge: e.clientEdge,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, events: formatted }, null, 2),
        }],
      };
    }
  );

  const listCallMetrics = createTool(
    'list_call_metrics',
    'List Voice Insights metrics for a call (jitter, packet loss, latency).',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Max results (1-100, default 50)'),
      edge: z.enum(['unknown_edge', 'carrier_edge', 'sip_edge', 'sdk_edge', 'client_edge']).optional().describe('Filter by edge'),
      direction: z.enum(['unknown', 'inbound', 'outbound', 'both']).optional().describe('Filter by direction'),
    }),
    async ({ callSid, limit, edge, direction }) => {
      const filters: {
        limit: number;
        edge?: 'unknown_edge' | 'carrier_edge' | 'sip_edge' | 'sdk_edge' | 'client_edge';
        direction?: 'unknown' | 'inbound' | 'outbound' | 'both';
      } = { limit: limit || 50 };

      if (edge) filters.edge = edge;
      if (direction) filters.direction = direction;

      const metrics = await client.insights.v1.calls(callSid).metrics.list(filters);

      const formatted = metrics.map((m) => ({
        timestamp: m.timestamp,
        callSid: m.callSid,
        accountSid: m.accountSid,
        edge: m.edge,
        direction: m.direction,
        carrierEdge: m.carrierEdge,
        sipEdge: m.sipEdge,
        sdkEdge: m.sdkEdge,
        clientEdge: m.clientEdge,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, metrics: formatted }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Conference Insights Tools
  // ============================================
  // TIMING NOTE: Conference Insights summaries follow same timing as Voice Insights.
  // - Partial data: Available within ~2 minutes (no SLA)
  // - Final data: Locked and immutable 30 minutes after conference end
  // Check processingState in response: 'partial' or 'complete'

  const getConferenceSummary = createTool(
    'get_conference_summary',
    'Get Conference Insights summary for a conference (quality metrics, participant count, etc.). ' +
      'NOTE: Summaries are not immediately available after conference end. ' +
      'Partial data available ~2 min after end, final data locked 30 min after end. ' +
      'Check processingState in response for data completeness.',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
    }),
    async ({ conferenceSid }) => {
      const summary = await client.insights.v1.conferences(conferenceSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            conferenceSid: summary.conferenceSid,
            accountSid: summary.accountSid,
            friendlyName: summary.friendlyName,
            processingState: summary.processingState,
            createTime: summary.createTime,
            startTime: summary.startTime,
            endTime: summary.endTime,
            durationSeconds: summary.durationSeconds,
            connectDurationSeconds: summary.connectDurationSeconds,
            status: summary.status,
            maxParticipants: summary.maxParticipants,
            maxConcurrentParticipants: summary.maxConcurrentParticipants,
            uniqueParticipants: summary.uniqueParticipants,
            endReason: summary.endReason,
            endedBy: summary.endedBy,
            mixerRegion: summary.mixerRegion,
            mixerRegionRequested: summary.mixerRegionRequested,
            recordingEnabled: summary.recordingEnabled,
            tags: summary.tags,
          }, null, 2),
        }],
      };
    }
  );

  const listConferenceParticipantSummaries = createTool(
    'list_conference_participant_summaries',
    'List Conference Insights summaries for all participants in a conference. ' +
      'NOTE: Summaries are not immediately available after conference end. ' +
      'Partial data available ~2 min after end, final data locked 30 min after end.',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
      limit: z.number().min(1).max(100).optional().default(50).describe('Max results (1-100, default 50)'),
    }),
    async ({ conferenceSid, limit }) => {
      const participants = await client.insights.v1
        .conferences(conferenceSid)
        .conferenceParticipants.list({ limit: limit || 50 });

      const formatted = participants.map((p) => ({
        participantSid: p.participantSid,
        conferenceSid: p.conferenceSid,
        callSid: p.callSid,
        label: p.label,
        processingState: p.processingState,
        callDirection: p.callDirection,
        from: p.from,
        to: p.to,
        durationSeconds: p.durationSeconds,
        joinTime: p.joinTime,
        leaveTime: p.leaveTime,
        callStatus: p.callStatus,
        countryCode: p.countryCode,
        isModerator: p.isModerator,
        isCoach: p.isCoach,
        jitterBufferSize: p.jitterBufferSize,
        properties: p.properties,
        events: p.events,
        metrics: p.metrics,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, participants: formatted }, null, 2),
        }],
      };
    }
  );

  const getConferenceParticipantSummary = createTool(
    'get_conference_participant_summary',
    'Get Conference Insights summary for a specific participant. ' +
      'NOTE: Summaries are not immediately available after conference end. ' +
      'Partial data available ~2 min after end, final data locked 30 min after end.',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
      participantSid: z.string().startsWith('CP').describe('Participant SID (starts with CP)'),
    }),
    async ({ conferenceSid, participantSid }) => {
      const participant = await client.insights.v1
        .conferences(conferenceSid)
        .conferenceParticipants(participantSid)
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            participantSid: participant.participantSid,
            conferenceSid: participant.conferenceSid,
            callSid: participant.callSid,
            label: participant.label,
            processingState: participant.processingState,
            callDirection: participant.callDirection,
            from: participant.from,
            to: participant.to,
            durationSeconds: participant.durationSeconds,
            joinTime: participant.joinTime,
            leaveTime: participant.leaveTime,
            callStatus: participant.callStatus,
            countryCode: participant.countryCode,
            isModerator: participant.isModerator,
            isCoach: participant.isCoach,
            jitterBufferSize: participant.jitterBufferSize,
            properties: participant.properties,
            events: participant.events,
            metrics: participant.metrics,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Transcription Tools
  // ============================================

  const listRecordingTranscriptions = createTool(
    'list_recording_transcriptions',
    'List transcriptions for a recording.',
    z.object({
      recordingSid: z.string().startsWith('RE').describe('Recording SID (starts with RE)'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
    }),
    async ({ recordingSid, limit }) => {
      const transcriptions = await client.recordings(recordingSid).transcriptions.list({ limit: limit || 20 });

      const formatted = transcriptions.map((t) => ({
        sid: t.sid,
        recordingSid: t.recordingSid,
        status: t.status,
        duration: t.duration,
        dateCreated: t.dateCreated,
        dateUpdated: t.dateUpdated,
        price: t.price,
        priceUnit: t.priceUnit,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, transcriptions: formatted }, null, 2),
        }],
      };
    }
  );

  const getTranscription = createTool(
    'get_transcription',
    'Get transcription details and text.',
    z.object({
      transcriptionSid: z.string().startsWith('TR').describe('Transcription SID (starts with TR)'),
    }),
    async ({ transcriptionSid }) => {
      const transcription = await client.transcriptions(transcriptionSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: transcription.sid,
            recordingSid: transcription.recordingSid,
            status: transcription.status,
            transcriptionText: transcription.transcriptionText,
            duration: transcription.duration,
            dateCreated: transcription.dateCreated,
            dateUpdated: transcription.dateUpdated,
            price: transcription.price,
            priceUnit: transcription.priceUnit,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Media Streams Tools
  // ============================================
  // IMPORTANT: There are TWO types of media streams in Twilio:
  //
  // 1. <Start><Stream> (Unidirectional) - API equivalent below
  //    - Your WebSocket RECEIVES audio only
  //    - Tracks: inbound_track, outbound_track, or both_tracks
  //    - Up to 4 streams per call
  //    - TwiML continues executing after stream starts
  //    - Use for: real-time transcription, monitoring, analytics
  //
  // 2. <Connect><Stream> (Bidirectional) - TwiML only, no API equivalent
  //    - Your WebSocket RECEIVES AND SENDS audio
  //    - Only inbound track available
  //    - Only 1 stream per call
  //    - BLOCKS TwiML execution until WebSocket closes
  //    - Use for: AI voice agents, interactive dialogue
  //
  // The tools below manage UNIDIRECTIONAL streams via the API.
  // For bidirectional streams, use TwiML with <Connect><Stream>.

  const startCallStream = createTool(
    'start_call_stream',
    'Start a unidirectional media stream on an active call. ' +
      'Forks audio to your WebSocket for real-time transcription, monitoring, or analytics. ' +
      'This is the API equivalent of <Start><Stream> in TwiML. ' +
      'For bidirectional streams (AI agents), use TwiML with <Connect><Stream> instead. ' +
      'Up to 4 streams per call. Requires secure WebSocket (wss://, port 443). ' +
      'Audio format: mulaw 8000Hz, base64-encoded.',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      url: z.string().url().describe('WebSocket URL to stream audio to (must be wss://)'),
      name: z.string().optional().describe('Optional name for the stream (for stopping by name later)'),
      track: z.enum(['inbound_track', 'outbound_track', 'both_tracks']).optional().default('inbound_track')
        .describe('Which audio track(s) to stream. inbound=caller, outbound=callee'),
      statusCallback: z.string().url().optional().describe('URL for stream status callbacks'),
      statusCallbackMethod: z.enum(['GET', 'POST']).optional().default('POST').describe('HTTP method for status callbacks'),
      parameters: z.array(z.object({
        name: z.string().describe('Parameter name'),
        value: z.string().describe('Parameter value'),
      })).max(10).optional().describe('Custom parameters to pass to WebSocket (max 10)'),
    }),
    async ({ callSid, url, name, track, statusCallback, statusCallbackMethod, parameters }) => {
      const createParams: {
        url: string;
        name?: string;
        track?: 'inbound_track' | 'outbound_track' | 'both_tracks';
        statusCallback?: string;
        statusCallbackMethod?: string;
        [key: string]: string | undefined;
      } = {
        url,
      };

      if (name) createParams.name = name;
      if (track) createParams.track = track;
      if (statusCallback) createParams.statusCallback = statusCallback;
      if (statusCallbackMethod) createParams.statusCallbackMethod = statusCallbackMethod;

      // Add custom parameters (API supports up to 99, we limit to 10 for simplicity)
      if (parameters) {
        parameters.forEach((param, index) => {
          createParams[`parameter${index + 1}.name`] = param.name;
          createParams[`parameter${index + 1}.value`] = param.value;
        });
      }

      const stream = await client.calls(callSid).streams.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: 'Media stream started',
            sid: stream.sid,
            callSid: stream.callSid,
            name: stream.name,
            status: stream.status,
            dateUpdated: stream.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const stopCallStream = createTool(
    'stop_call_stream',
    'Stop a media stream on a call. Use the stream SID returned from start_call_stream.',
    z.object({
      callSid: z.string().startsWith('CA').describe('Call SID (starts with CA)'),
      streamSid: z.string().startsWith('MZ').describe('Stream SID (starts with MZ)'),
    }),
    async ({ callSid, streamSid }) => {
      const stream = await client.calls(callSid).streams(streamSid).update({ status: 'stopped' });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            message: 'Media stream stopped',
            sid: stream.sid,
            callSid: stream.callSid,
            name: stream.name,
            status: stream.status,
            dateUpdated: stream.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Conference Recording Tools
  // ============================================

  const listConferenceRecordings = createTool(
    'list_conference_recordings',
    'List recordings for a specific conference.',
    z.object({
      conferenceSid: z.string().startsWith('CF').describe('Conference SID (starts with CF)'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      status: z.enum(['in-progress', 'paused', 'stopped', 'processing', 'completed', 'absent']).optional().describe('Filter by recording status'),
    }),
    async ({ conferenceSid, limit, status }) => {
      const filters: {
        limit: number;
        status?: 'in-progress' | 'paused' | 'stopped' | 'processing' | 'completed' | 'absent';
      } = { limit: limit || 20 };

      if (status) filters.status = status;

      const recordings = await client.conferences(conferenceSid).recordings.list(filters);

      const formatted = recordings.map((r) => ({
        sid: r.sid,
        conferenceSid: r.conferenceSid,
        duration: r.duration,
        channels: r.channels,
        status: r.status,
        source: r.source,
        dateCreated: r.dateCreated,
        mediaUrl: `https://api.twilio.com${r.uri.replace('.json', '.mp3')}`,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, recordings: formatted }, null, 2),
        }],
      };
    }
  );

  return [
    // Core call tools
    getCallLogs,
    makeCall,
    getRecording,
    // Call control
    getCall,
    updateCall,
    listCallRecordings,
    // Account-level recordings
    listRecordings,
    deleteRecording,
    // Active call recording control
    startCallRecording,
    updateCallRecording,
    deleteCallRecording,
    // Conference tools
    listConferences,
    getConference,
    updateConference,
    listConferenceParticipants,
    getConferenceParticipant,
    updateConferenceParticipant,
    addParticipantToConference,
    listConferenceRecordings,
    // Media Streams (unidirectional - for bidirectional, use TwiML <Connect><Stream>)
    startCallStream,
    stopCallStream,
    // Voice Insights
    getCallSummary,
    listCallEvents,
    listCallMetrics,
    // Conference Insights
    getConferenceSummary,
    listConferenceParticipantSummaries,
    getConferenceParticipantSummary,
    // Transcription
    listRecordingTranscriptions,
    getTranscription,
  ];
}
