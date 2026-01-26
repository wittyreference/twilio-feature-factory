// ABOUTME: Twilio Pricing tools for voice, messaging, and phone number costs.
// ABOUTME: Provides pricing lookups by country and number type.

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
 * Returns all Pricing-related tools configured with the given Twilio context.
 */
export function pricingTools(context: TwilioContext) {
  const { client } = context;

  // ============ Voice Pricing ============

  const listVoicePricingCountries = createTool(
    'list_voice_pricing_countries',
    'List countries with voice pricing information.',
    z.object({
      limit: z.number().min(1).max(100).default(50).describe('Maximum countries to return'),
    }),
    async ({ limit }) => {
      const countries = await client.pricing.v1.voice.countries.list({ limit });

      const result = countries.map(c => ({
        country: c.country,
        isoCountry: c.isoCountry,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            countries: result,
          }, null, 2),
        }],
      };
    }
  );

  const getVoicePricingCountry = createTool(
    'get_voice_pricing_country',
    'Get voice pricing for a specific country.',
    z.object({
      isoCountry: z.string().length(2).describe('ISO 3166-1 alpha-2 country code (e.g., US, GB)'),
    }),
    async ({ isoCountry }) => {
      const pricing = await client.pricing.v1.voice.countries(isoCountry.toUpperCase()).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            country: pricing.country,
            isoCountry: pricing.isoCountry,
            priceUnit: pricing.priceUnit,
            outboundPrefixPrices: pricing.outboundPrefixPrices,
            inboundCallPrices: pricing.inboundCallPrices,
          }, null, 2),
        }],
      };
    }
  );

  const getVoicePricingNumber = createTool(
    'get_voice_pricing_number',
    'Get voice pricing for a specific phone number.',
    z.object({
      phoneNumber: z.string().startsWith('+').describe('Phone number in E.164 format'),
    }),
    async ({ phoneNumber }) => {
      const pricing = await client.pricing.v1.voice.numbers(phoneNumber).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            number: pricing.number,
            country: pricing.country,
            isoCountry: pricing.isoCountry,
            priceUnit: pricing.priceUnit,
            outboundCallPrice: pricing.outboundCallPrice,
            inboundCallPrice: pricing.inboundCallPrice,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Messaging Pricing ============

  const listMessagingPricingCountries = createTool(
    'list_messaging_pricing_countries',
    'List countries with messaging pricing information.',
    z.object({
      limit: z.number().min(1).max(100).default(50).describe('Maximum countries to return'),
    }),
    async ({ limit }) => {
      const countries = await client.pricing.v1.messaging.countries.list({ limit });

      const result = countries.map(c => ({
        country: c.country,
        isoCountry: c.isoCountry,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            countries: result,
          }, null, 2),
        }],
      };
    }
  );

  const getMessagingPricingCountry = createTool(
    'get_messaging_pricing_country',
    'Get messaging pricing for a specific country.',
    z.object({
      isoCountry: z.string().length(2).describe('ISO 3166-1 alpha-2 country code (e.g., US, GB)'),
    }),
    async ({ isoCountry }) => {
      const pricing = await client.pricing.v1.messaging.countries(isoCountry.toUpperCase()).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            country: pricing.country,
            isoCountry: pricing.isoCountry,
            priceUnit: pricing.priceUnit,
            outboundSmsPrices: pricing.outboundSmsPrices,
            inboundSmsPrices: pricing.inboundSmsPrices,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Phone Number Pricing ============

  const listPhoneNumberPricingCountries = createTool(
    'list_phone_number_pricing_countries',
    'List countries with phone number pricing information.',
    z.object({
      limit: z.number().min(1).max(100).default(50).describe('Maximum countries to return'),
    }),
    async ({ limit }) => {
      const countries = await client.pricing.v1.phoneNumbers.countries.list({ limit });

      const result = countries.map(c => ({
        country: c.country,
        isoCountry: c.isoCountry,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            countries: result,
          }, null, 2),
        }],
      };
    }
  );

  const getPhoneNumberPricingCountry = createTool(
    'get_phone_number_pricing_country',
    'Get phone number pricing for a specific country.',
    z.object({
      isoCountry: z.string().length(2).describe('ISO 3166-1 alpha-2 country code (e.g., US, GB)'),
    }),
    async ({ isoCountry }) => {
      const pricing = await client.pricing.v1.phoneNumbers.countries(isoCountry.toUpperCase()).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            country: pricing.country,
            isoCountry: pricing.isoCountry,
            priceUnit: pricing.priceUnit,
            phoneNumberPrices: pricing.phoneNumberPrices,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listVoicePricingCountries,
    getVoicePricingCountry,
    getVoicePricingNumber,
    listMessagingPricingCountries,
    getMessagingPricingCountry,
    listPhoneNumberPricingCountries,
    getPhoneNumberPricingCountry,
  ];
}
