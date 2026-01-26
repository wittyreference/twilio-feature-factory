// ABOUTME: Twilio Lookups v2 tools for phone number intelligence.
// ABOUTME: Provides lookup_phone_number and check_fraud_risk tools.

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
 * Returns all Lookups-related tools configured with the given Twilio context.
 */
export function lookupsTools(context: TwilioContext) {
  const { client } = context;

  const lookupPhoneNumber = createTool(
    'lookup_phone_number',
    'Look up information about a phone number including carrier, line type, and caller name.',
    z.object({
      phoneNumber: z.string().describe('Phone number to look up (E.164 format recommended)'),
      fields: z.array(z.enum(['carrier', 'caller_name', 'line_type_intelligence']))
        .optional()
        .describe('Optional data packages to include (each has additional cost)'),
    }),
    async ({ phoneNumber, fields }) => {
      const options: { fields?: string } = {};
      if (fields && fields.length > 0) {
        options.fields = fields.join(',');
      }

      const lookup = await client.lookups.v2
        .phoneNumbers(phoneNumber)
        .fetch(options);

      // Type assertion needed because SDK types are incomplete for lookups v2
      const lookupData = lookup as unknown as Record<string, unknown>;

      const result: Record<string, unknown> = {
        success: true,
        phoneNumber: lookup.phoneNumber,
        nationalFormat: lookup.nationalFormat,
        countryCode: lookup.countryCode,
        valid: lookup.valid,
        validationErrors: lookup.validationErrors,
      };

      // Include optional fields if requested
      if (lookup.callingCountryCode) {
        result.callingCountryCode = lookup.callingCountryCode;
      }
      if (lookupData.carrier) {
        result.carrier = lookupData.carrier;
      }
      if (lookupData.callerName) {
        result.callerName = lookupData.callerName;
      }
      if (lookupData.lineTypeIntelligence) {
        result.lineTypeIntelligence = lookupData.lineTypeIntelligence;
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const checkFraudRisk = createTool(
    'check_fraud_risk',
    'Check fraud risk indicators for a phone number including SIM swap and SMS pumping risk.',
    z.object({
      phoneNumber: z.string().describe('Phone number to check (E.164 format recommended)'),
      checks: z.array(z.enum(['sim_swap', 'sms_pumping_risk']))
        .default(['sim_swap', 'sms_pumping_risk'])
        .describe('Fraud risk checks to perform'),
    }),
    async ({ phoneNumber, checks }) => {
      const lookup = await client.lookups.v2
        .phoneNumbers(phoneNumber)
        .fetch({ fields: checks.join(',') });

      // Type assertion needed because SDK types are incomplete for lookups v2
      const lookupData = lookup as unknown as Record<string, unknown>;

      const result: Record<string, unknown> = {
        success: true,
        phoneNumber: lookup.phoneNumber,
        countryCode: lookup.countryCode,
        valid: lookup.valid,
      };

      // Include fraud risk results
      if (lookupData.simSwap) {
        result.simSwap = lookupData.simSwap;
      }
      if (lookupData.smsPumpingRisk) {
        result.smsPumpingRisk = lookupData.smsPumpingRisk;
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  return [lookupPhoneNumber, checkFraudRisk];
}
