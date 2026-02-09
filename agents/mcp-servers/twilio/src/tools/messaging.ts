// ABOUTME: Twilio messaging tools for SMS/MMS operations.
// ABOUTME: Provides send_sms, send_mms, get_message_logs, and get_message_status tools.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';

// Phone number validation pattern (E.164 format)
const e164Pattern = /^\+[1-9]\d{1,14}$/;

const phoneNumberSchema = z.string().regex(e164Pattern, {
  message: 'Phone number must be in E.164 format (e.g., +15551234567)',
});

/**
 * Creates a tool definition compatible with Claude Agent SDK.
 */
function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
) {
  return {
    name,
    description,
    inputSchema: schema,
    handler,
  };
}

/**
 * Returns all messaging-related tools configured with the given Twilio context.
 */
export function messagingTools(context: TwilioContext) {
  const { client, defaultFromNumber } = context;

  const sendSms = createTool(
    'send_sms',
    'Send an SMS message via Twilio. Returns the message SID on success.',
    z.object({
      to: phoneNumberSchema.describe('Destination phone number in E.164 format'),
      body: z.string().min(1).max(1600).describe('Message content (max 1600 characters)'),
      from: phoneNumberSchema.optional().describe('Sender phone number (defaults to configured number)'),
    }),
    async ({ to, body, from }) => {
      const message = await client.messages.create({
        to,
        body,
        from: from || defaultFromNumber,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                sid: message.sid,
                status: message.status,
                to: message.to,
                from: message.from,
                dateCreated: message.dateCreated,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  const sendMms = createTool(
    'send_mms',
    'Send an MMS message with media via Twilio. Returns the message SID on success.',
    z.object({
      to: phoneNumberSchema.describe('Destination phone number in E.164 format'),
      body: z.string().max(1600).optional().describe('Optional message text'),
      mediaUrl: z.array(z.string().url()).min(1).max(10).describe('Array of media URLs (1-10)'),
      from: phoneNumberSchema.optional().describe('Sender phone number (defaults to configured number)'),
    }),
    async ({ to, body, mediaUrl, from }) => {
      const message = await client.messages.create({
        to,
        body: body || '',
        mediaUrl,
        from: from || defaultFromNumber,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                sid: message.sid,
                status: message.status,
                to: message.to,
                from: message.from,
                numMedia: message.numMedia,
                dateCreated: message.dateCreated,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  const getMessageLogs = createTool(
    'get_message_logs',
    'Retrieve recent message logs with optional filtering. Returns an array of message records.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      to: phoneNumberSchema.optional().describe('Filter by destination number'),
      from: phoneNumberSchema.optional().describe('Filter by sender number'),
      dateSentAfter: z.string().datetime().optional().describe('Filter messages sent after this ISO datetime'),
      dateSentBefore: z.string().datetime().optional().describe('Filter messages sent before this ISO datetime'),
    }),
    async ({ limit, to, from, dateSentAfter, dateSentBefore }) => {
      const filters: {
        limit: number;
        to?: string;
        from?: string;
        dateSentAfter?: Date;
        dateSentBefore?: Date;
      } = { limit: limit || 20 };

      if (to) {filters.to = to;}
      if (from) {filters.from = from;}
      if (dateSentAfter) {filters.dateSentAfter = new Date(dateSentAfter);}
      if (dateSentBefore) {filters.dateSentBefore = new Date(dateSentBefore);}

      const messages = await client.messages.list(filters);

      const formattedMessages = messages.map((m) => ({
        sid: m.sid,
        to: m.to,
        from: m.from,
        body: m.body,
        status: m.status,
        direction: m.direction,
        dateCreated: m.dateCreated,
        dateSent: m.dateSent,
        numMedia: m.numMedia,
        errorCode: m.errorCode,
        errorMessage: m.errorMessage,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                count: formattedMessages.length,
                messages: formattedMessages,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  const getMessageStatus = createTool(
    'get_message_status',
    'Get the current status and details of a specific message by SID.',
    z.object({
      messageSid: z.string().startsWith('SM').describe('Message SID (starts with SM)'),
    }),
    async ({ messageSid }) => {
      const message = await client.messages(messageSid).fetch();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                sid: message.sid,
                to: message.to,
                from: message.from,
                body: message.body,
                status: message.status,
                direction: message.direction,
                dateCreated: message.dateCreated,
                dateSent: message.dateSent,
                dateUpdated: message.dateUpdated,
                numMedia: message.numMedia,
                numSegments: message.numSegments,
                price: message.price,
                priceUnit: message.priceUnit,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return [sendSms, sendMms, getMessageLogs, getMessageStatus];
}
