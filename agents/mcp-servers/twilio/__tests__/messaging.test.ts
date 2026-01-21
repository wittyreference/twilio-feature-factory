// ABOUTME: Unit tests for Twilio messaging tools.
// ABOUTME: Tests tool structure, schema validation, and API integration using test credentials.

import { messagingTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Test credentials - Twilio provides magic numbers for testing
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

// Type for tool structure
interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('messagingTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = messagingTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 4 tools', () => {
      expect(tools).toHaveLength(4);
    });

    it('should have send_sms tool with correct metadata', () => {
      const sendSms = tools.find(t => t.name === 'send_sms');
      expect(sendSms).toBeDefined();
      expect(sendSms?.description).toContain('Send an SMS');
      expect(sendSms?.inputSchema).toBeDefined();
      expect(typeof sendSms?.handler).toBe('function');
    });

    it('should have send_mms tool with correct metadata', () => {
      const sendMms = tools.find(t => t.name === 'send_mms');
      expect(sendMms).toBeDefined();
      expect(sendMms?.description).toContain('MMS');
      expect(sendMms?.inputSchema).toBeDefined();
      expect(typeof sendMms?.handler).toBe('function');
    });

    it('should have get_message_logs tool with correct metadata', () => {
      const getLogs = tools.find(t => t.name === 'get_message_logs');
      expect(getLogs).toBeDefined();
      expect(getLogs?.description).toContain('message logs');
      expect(getLogs?.inputSchema).toBeDefined();
      expect(typeof getLogs?.handler).toBe('function');
    });

    it('should have get_message_status tool with correct metadata', () => {
      const getStatus = tools.find(t => t.name === 'get_message_status');
      expect(getStatus).toBeDefined();
      expect(getStatus?.description).toContain('status');
      expect(getStatus?.inputSchema).toBeDefined();
      expect(typeof getStatus?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('send_sms schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const sendSms = tools.find(t => t.name === 'send_sms');
        schema = sendSms!.inputSchema;
      });

      it('should validate valid E.164 phone numbers', () => {
        const result = schema.safeParse({
          to: '+15551234567',
          body: 'Test message',
        });
        expect(result.success).toBe(true);
      });

      it('should reject invalid phone numbers', () => {
        const result = schema.safeParse({
          to: '5551234567', // Missing + prefix
          body: 'Test message',
        });
        expect(result.success).toBe(false);
      });

      it('should reject empty body', () => {
        const result = schema.safeParse({
          to: '+15551234567',
          body: '',
        });
        expect(result.success).toBe(false);
      });

      it('should reject body exceeding 1600 characters', () => {
        const result = schema.safeParse({
          to: '+15551234567',
          body: 'x'.repeat(1601),
        });
        expect(result.success).toBe(false);
      });

      it('should allow optional from number', () => {
        const withFrom = schema.safeParse({
          to: '+15551234567',
          body: 'Test',
          from: '+15559876543',
        });
        expect(withFrom.success).toBe(true);

        const withoutFrom = schema.safeParse({
          to: '+15551234567',
          body: 'Test',
        });
        expect(withoutFrom.success).toBe(true);
      });
    });

    describe('send_mms schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const sendMms = tools.find(t => t.name === 'send_mms');
        schema = sendMms!.inputSchema;
      });

      it('should require at least one media URL', () => {
        const validResult = schema.safeParse({
          to: '+15551234567',
          mediaUrl: ['https://example.com/image.jpg'],
        });
        expect(validResult.success).toBe(true);

        const emptyArray = schema.safeParse({
          to: '+15551234567',
          mediaUrl: [],
        });
        expect(emptyArray.success).toBe(false);
      });

      it('should reject more than 10 media URLs', () => {
        const tooManyUrls = schema.safeParse({
          to: '+15551234567',
          mediaUrl: Array(11).fill('https://example.com/image.jpg'),
        });
        expect(tooManyUrls.success).toBe(false);
      });

      it('should validate media URLs are proper URLs', () => {
        const invalidUrl = schema.safeParse({
          to: '+15551234567',
          mediaUrl: ['not-a-url'],
        });
        expect(invalidUrl.success).toBe(false);
      });
    });

    describe('get_message_logs schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const getLogs = tools.find(t => t.name === 'get_message_logs');
        schema = getLogs!.inputSchema;
      });

      it('should have sensible defaults', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should reject limit below 1', () => {
        const result = schema.safeParse({ limit: 0 });
        expect(result.success).toBe(false);
      });

      it('should reject limit above 100', () => {
        const result = schema.safeParse({ limit: 101 });
        expect(result.success).toBe(false);
      });
    });

    describe('get_message_status schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const getStatus = tools.find(t => t.name === 'get_message_status');
        schema = getStatus!.inputSchema;
      });

      it('should require message SID starting with SM', () => {
        const validSid = schema.safeParse({
          messageSid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          messageSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    // These tests require real Twilio credentials
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials('get_message_logs should return message array', async () => {
      const getLogs = tools.find(t => t.name === 'get_message_logs')!;
      const result = await getLogs.handler({ limit: 5 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.messages)).toBe(true);
    });

    itWithCredentials('send_sms should send a message using test number', async () => {
      const sendSms = tools.find(t => t.name === 'send_sms')!;

      // Using Twilio magic test number for successful message
      const result = await sendSms.handler({
        to: '+15005550006', // Twilio test number - always succeeds
        body: 'Test message from unit tests',
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sid).toMatch(/^SM/);
    });

    itWithCredentials('send_sms should handle invalid number error', async () => {
      const sendSms = tools.find(t => t.name === 'send_sms')!;

      // Using Twilio magic test number that triggers error
      await expect(
        sendSms.handler({
          to: '+15005550001', // Twilio test number - invalid
          body: 'Test message',
        })
      ).rejects.toThrow();
    });
  });
});
