// ABOUTME: Unit tests for Twilio voice tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { voiceTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Real Twilio credentials from environment - NO magic test numbers.
const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  toNumber: process.env.TEST_PHONE_NUMBER || '',
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.authToken.length > 0 &&
  TEST_CREDENTIALS.fromNumber.startsWith('+') &&
  TEST_CREDENTIALS.toNumber.startsWith('+');

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

describe('voiceTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = voiceTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 3 tools', () => {
      expect(tools).toHaveLength(3);
    });

    it('should have get_call_logs tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_call_logs');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('call logs');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have make_call tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'make_call');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('outbound call');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_recording tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_recording');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('recording');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('get_call_logs schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_call_logs');
        schema = tool!.inputSchema;
      });

      it('should have sensible defaults', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate status enum', () => {
        const validStatus = schema.safeParse({ status: 'completed' });
        expect(validStatus.success).toBe(true);

        const invalidStatus = schema.safeParse({ status: 'invalid-status' });
        expect(invalidStatus.success).toBe(false);
      });

      it('should validate phone number format for to/from', () => {
        const validTo = schema.safeParse({ to: '+15551234567' });
        expect(validTo.success).toBe(true);

        const invalidTo = schema.safeParse({ to: '5551234567' });
        expect(invalidTo.success).toBe(false);
      });

      it('should reject limit outside range', () => {
        expect(schema.safeParse({ limit: 0 }).success).toBe(false);
        expect(schema.safeParse({ limit: 101 }).success).toBe(false);
        expect(schema.safeParse({ limit: 50 }).success).toBe(true);
      });
    });

    describe('make_call schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'make_call');
        schema = tool!.inputSchema;
      });

      it('should require to phone number', () => {
        const withTo = schema.safeParse({
          to: '+15551234567',
          url: 'https://example.com/twiml',
        });
        expect(withTo.success).toBe(true);

        const withoutTo = schema.safeParse({
          url: 'https://example.com/twiml',
        });
        expect(withoutTo.success).toBe(false);
      });

      it('should require either url or twiml', () => {
        const withUrl = schema.safeParse({
          to: '+15551234567',
          url: 'https://example.com/twiml',
        });
        expect(withUrl.success).toBe(true);

        const withTwiml = schema.safeParse({
          to: '+15551234567',
          twiml: '<Response><Say>Hello</Say></Response>',
        });
        expect(withTwiml.success).toBe(true);

        const withNeither = schema.safeParse({
          to: '+15551234567',
        });
        expect(withNeither.success).toBe(false);
      });

      it('should validate url format', () => {
        const validUrl = schema.safeParse({
          to: '+15551234567',
          url: 'https://example.com/twiml',
        });
        expect(validUrl.success).toBe(true);

        const invalidUrl = schema.safeParse({
          to: '+15551234567',
          url: 'not-a-url',
        });
        expect(invalidUrl.success).toBe(false);
      });
    });

    describe('get_recording schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_recording');
        schema = tool!.inputSchema;
      });

      it('should require recording SID starting with RE', () => {
        const validSid = schema.safeParse({
          recordingSid: 'RExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          recordingSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials('get_call_logs should return call array', async () => {
      const tool = tools.find(t => t.name === 'get_call_logs')!;
      const result = await tool.handler({ limit: 5 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.calls)).toBe(true);
    });
  });
});
