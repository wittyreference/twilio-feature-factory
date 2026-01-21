// ABOUTME: Unit tests for Twilio phone number management tools.
// ABOUTME: Tests tool structure, schema validation, and API integration using test credentials.

import { phoneNumberTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACtest',
  authToken: process.env.TWILIO_AUTH_TOKEN || 'test_token',
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+15005550006',
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.accountSid !== 'ACtest';

function createTestContext(): TwilioContext {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return {
    client,
    defaultFromNumber: TEST_CREDENTIALS.phoneNumber,
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('phoneNumberTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = phoneNumberTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 3 tools', () => {
      expect(tools).toHaveLength(3);
    });

    it('should have list_phone_numbers tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_phone_numbers');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('phone numbers');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have configure_webhook tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'configure_webhook');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('webhook');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have search_available_numbers tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'search_available_numbers');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('available');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_phone_numbers schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_phone_numbers');
        schema = tool!.inputSchema;
      });

      it('should have sensible defaults', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should reject limit outside range', () => {
        expect(schema.safeParse({ limit: 0 }).success).toBe(false);
        expect(schema.safeParse({ limit: 101 }).success).toBe(false);
      });
    });

    describe('configure_webhook schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'configure_webhook');
        schema = tool!.inputSchema;
      });

      it('should require phone number SID starting with PN', () => {
        const validSid = schema.safeParse({
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          phoneNumberSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });

      it('should validate URL format for webhooks', () => {
        const validUrl = schema.safeParse({
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          voiceUrl: 'https://example.com/voice',
        });
        expect(validUrl.success).toBe(true);

        const invalidUrl = schema.safeParse({
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          voiceUrl: 'not-a-url',
        });
        expect(invalidUrl.success).toBe(false);
      });

      it('should validate HTTP method enum', () => {
        const validMethod = schema.safeParse({
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          voiceMethod: 'POST',
        });
        expect(validMethod.success).toBe(true);

        const invalidMethod = schema.safeParse({
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          voiceMethod: 'PUT',
        });
        expect(invalidMethod.success).toBe(false);
      });
    });

    describe('search_available_numbers schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'search_available_numbers');
        schema = tool!.inputSchema;
      });

      it('should have default country code US', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.countryCode).toBe('US');
        }
      });

      it('should validate country code length', () => {
        const validCode = schema.safeParse({ countryCode: 'GB' });
        expect(validCode.success).toBe(true);

        const invalidCode = schema.safeParse({ countryCode: 'USA' });
        expect(invalidCode.success).toBe(false);
      });

      it('should accept area code as number', () => {
        const withAreaCode = schema.safeParse({ areaCode: 415 });
        expect(withAreaCode.success).toBe(true);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials('list_phone_numbers should return number array', async () => {
      const tool = tools.find(t => t.name === 'list_phone_numbers')!;
      const result = await tool.handler({ limit: 5 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.numbers)).toBe(true);
    });

    itWithCredentials('search_available_numbers should return available numbers', async () => {
      const tool = tools.find(t => t.name === 'search_available_numbers')!;
      const result = await tool.handler({ countryCode: 'US', limit: 3 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.availableNumbers)).toBe(true);
    });
  });
});
