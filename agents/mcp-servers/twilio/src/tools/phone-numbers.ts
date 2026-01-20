// ABOUTME: Twilio phone number management tools.
// ABOUTME: Provides list_phone_numbers, configure_webhook, and search_available_numbers tools.

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
 * Returns all phone number management tools configured with the given Twilio context.
 */
export function phoneNumberTools(context: TwilioContext) {
  const { client } = context;

  const listPhoneNumbers = createTool(
    'list_phone_numbers',
    'List all phone numbers owned by the account.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
    }),
    async ({ limit }) => {
      const numbers = await client.incomingPhoneNumbers.list({ limit: limit || 20 });

      const formattedNumbers = numbers.map((n) => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: n.capabilities,
        voiceUrl: n.voiceUrl,
        smsUrl: n.smsUrl,
        statusCallback: n.statusCallback,
        dateCreated: n.dateCreated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedNumbers.length, numbers: formattedNumbers }, null, 2),
        }],
      };
    }
  );

  const configureWebhook = createTool(
    'configure_webhook',
    'Configure voice or SMS webhook URLs for a phone number.',
    z.object({
      phoneNumberSid: z.string().startsWith('PN').describe('Phone number SID (starts with PN)'),
      voiceUrl: z.string().url().optional().describe('URL for incoming voice calls'),
      voiceMethod: z.enum(['GET', 'POST']).optional().describe('HTTP method for voice webhook'),
      smsUrl: z.string().url().optional().describe('URL for incoming SMS'),
      smsMethod: z.enum(['GET', 'POST']).optional().describe('HTTP method for SMS webhook'),
      statusCallback: z.string().url().optional().describe('URL for status callbacks'),
    }),
    async ({ phoneNumberSid, voiceUrl, voiceMethod, smsUrl, smsMethod, statusCallback }) => {
      const updateParams: {
        voiceUrl?: string;
        voiceMethod?: 'GET' | 'POST';
        smsUrl?: string;
        smsMethod?: 'GET' | 'POST';
        statusCallback?: string;
      } = {};

      if (voiceUrl) updateParams.voiceUrl = voiceUrl;
      if (voiceMethod) updateParams.voiceMethod = voiceMethod;
      if (smsUrl) updateParams.smsUrl = smsUrl;
      if (smsMethod) updateParams.smsMethod = smsMethod;
      if (statusCallback) updateParams.statusCallback = statusCallback;

      const updated = await client.incomingPhoneNumbers(phoneNumberSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: updated.sid,
            phoneNumber: updated.phoneNumber,
            voiceUrl: updated.voiceUrl,
            smsUrl: updated.smsUrl,
            statusCallback: updated.statusCallback,
          }, null, 2),
        }],
      };
    }
  );

  const searchAvailableNumbers = createTool(
    'search_available_numbers',
    'Search for available phone numbers to purchase.',
    z.object({
      countryCode: z.string().length(2).default('US').describe('ISO country code (e.g., US, GB)'),
      areaCode: z.string().optional().describe('Area code to search within'),
      contains: z.string().optional().describe('Pattern to match in number'),
      smsEnabled: z.boolean().optional().describe('Filter for SMS-capable numbers'),
      voiceEnabled: z.boolean().optional().describe('Filter for voice-capable numbers'),
      limit: z.number().min(1).max(30).optional().default(10).describe('Max results (1-30, default 10)'),
    }),
    async ({ countryCode, areaCode, contains, smsEnabled, voiceEnabled, limit }) => {
      const searchParams: {
        areaCode?: string;
        contains?: string;
        smsEnabled?: boolean;
        voiceEnabled?: boolean;
        limit: number;
      } = { limit: limit || 10 };

      if (areaCode) searchParams.areaCode = areaCode;
      if (contains) searchParams.contains = contains;
      if (smsEnabled !== undefined) searchParams.smsEnabled = smsEnabled;
      if (voiceEnabled !== undefined) searchParams.voiceEnabled = voiceEnabled;

      const numbers = await client.availablePhoneNumbers(countryCode).local.list(searchParams);

      const formattedNumbers = numbers.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
        capabilities: n.capabilities,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedNumbers.length, availableNumbers: formattedNumbers }, null, 2),
        }],
      };
    }
  );

  return [listPhoneNumbers, configureWebhook, searchAvailableNumbers];
}
