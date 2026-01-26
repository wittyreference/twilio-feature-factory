// ABOUTME: Unit tests for Twilio Pricing tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { pricingTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.authToken.length > 0 &&
  TEST_CREDENTIALS.fromNumber.startsWith('+');

function createTestContext(): TwilioContext {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return {
    client,
    defaultFromNumber: TEST_CREDENTIALS.fromNumber,
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('pricingTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = pricingTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 7 tools', () => {
      expect(tools).toHaveLength(7);
    });

    it('should have list_voice_pricing_countries tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_voice_pricing_countries');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('voice');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_voice_pricing_country tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_voice_pricing_country');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('voice pricing');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_messaging_pricing_country tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_messaging_pricing_country');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('messaging');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_voice_pricing_countries schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_voice_pricing_countries');
        schema = tool!.inputSchema;
      });

      it('should have default limit of 50', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });
    });

    describe('get_voice_pricing_country schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_voice_pricing_country');
        schema = tool!.inputSchema;
      });

      it('should require 2-letter isoCountry', () => {
        const valid = schema.safeParse({ isoCountry: 'US' });
        expect(valid.success).toBe(true);

        const tooShort = schema.safeParse({ isoCountry: 'U' });
        expect(tooShort.success).toBe(false);

        const tooLong = schema.safeParse({ isoCountry: 'USA' });
        expect(tooLong.success).toBe(false);
      });
    });

    describe('get_voice_pricing_number schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_voice_pricing_number');
        schema = tool!.inputSchema;
      });

      it('should require E.164 phone number', () => {
        const valid = schema.safeParse({ phoneNumber: '+15551234567' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ phoneNumber: '5551234567' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_voice_pricing_countries should return countries',
      async () => {
        const tool = tools.find(t => t.name === 'list_voice_pricing_countries')!;

        const result = await tool.handler({ limit: 10 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThan(0);
        expect(Array.isArray(response.countries)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_voice_pricing_country should return US pricing',
      async () => {
        const tool = tools.find(t => t.name === 'get_voice_pricing_country')!;

        const result = await tool.handler({ isoCountry: 'US' });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.country).toBe('United States');
        expect(response.isoCountry).toBe('US');
      },
      15000
    );

    itWithCredentials(
      'list_messaging_pricing_countries should return countries',
      async () => {
        const tool = tools.find(t => t.name === 'list_messaging_pricing_countries')!;

        const result = await tool.handler({ limit: 10 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThan(0);
        expect(Array.isArray(response.countries)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_messaging_pricing_country should return US pricing',
      async () => {
        const tool = tools.find(t => t.name === 'get_messaging_pricing_country')!;

        const result = await tool.handler({ isoCountry: 'US' });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.country).toBe('United States');
        expect(response.isoCountry).toBe('US');
      },
      15000
    );

    itWithCredentials(
      'list_phone_number_pricing_countries should return countries',
      async () => {
        const tool = tools.find(t => t.name === 'list_phone_number_pricing_countries')!;

        const result = await tool.handler({ limit: 10 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThan(0);
        expect(Array.isArray(response.countries)).toBe(true);
      },
      15000
    );
  });
});
