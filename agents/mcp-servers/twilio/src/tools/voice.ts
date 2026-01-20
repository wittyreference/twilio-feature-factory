// ABOUTME: Twilio voice tools for call operations.
// ABOUTME: Provides get_call_logs, make_call, and get_recording tools.

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
        status?: string;
        to?: string;
        from?: string;
        startTimeAfter?: Date;
        startTimeBefore?: Date;
      } = { limit: limit || 20 };

      if (status) filters.status = status;
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

  return [getCallLogs, makeCall, getRecording];
}
