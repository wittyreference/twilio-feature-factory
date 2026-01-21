// ABOUTME: Unit tests for Twilio Verify tools.
// ABOUTME: Tests tool structure, schema validation, and API integration using test credentials.

import { verifyTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACtest',
  authToken: process.env.TWILIO_AUTH_TOKEN || 'test_token',
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+15005550006',
  verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.accountSid !== 'ACtest';

function createTestContext(): TwilioContext {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return {
    client,
    defaultFromNumber: TEST_CREDENTIALS.phoneNumber,
    verifyServiceSid: TEST_CREDENTIALS.verifyServiceSid,
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('verifyTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = verifyTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 3 tools', () => {
      expect(tools).toHaveLength(3);
    });

    it('should have start_verification tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'start_verification');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('verification');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have check_verification tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'check_verification');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Verify');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_verification_status tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_verification_status');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('status');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('start_verification schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'start_verification');
        schema = tool!.inputSchema;
      });

      it('should require to parameter', () => {
        const withTo = schema.safeParse({ to: '+15551234567' });
        expect(withTo.success).toBe(true);

        const withoutTo = schema.safeParse({});
        expect(withoutTo.success).toBe(false);
      });

      it('should have default channel of sms', () => {
        const result = schema.safeParse({ to: '+15551234567' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.channel).toBe('sms');
        }
      });

      it('should validate channel enum', () => {
        const validChannel = schema.safeParse({ to: '+15551234567', channel: 'call' });
        expect(validChannel.success).toBe(true);

        const invalidChannel = schema.safeParse({ to: '+15551234567', channel: 'whatsapp' });
        expect(invalidChannel.success).toBe(false);
      });

      it('should validate service SID format', () => {
        const validSid = schema.safeParse({
          to: '+15551234567',
          serviceSid: 'VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          to: '+15551234567',
          serviceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });

    describe('check_verification schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'check_verification');
        schema = tool!.inputSchema;
      });

      it('should require to and code parameters', () => {
        const valid = schema.safeParse({ to: '+15551234567', code: '123456' });
        expect(valid.success).toBe(true);

        const withoutCode = schema.safeParse({ to: '+15551234567' });
        expect(withoutCode.success).toBe(false);
      });

      it('should validate code is 6 digits', () => {
        const validCode = schema.safeParse({ to: '+15551234567', code: '123456' });
        expect(validCode.success).toBe(true);

        const tooShort = schema.safeParse({ to: '+15551234567', code: '12345' });
        expect(tooShort.success).toBe(false);

        const tooLong = schema.safeParse({ to: '+15551234567', code: '1234567' });
        expect(tooLong.success).toBe(false);
      });
    });

    describe('get_verification_status schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_verification_status');
        schema = tool!.inputSchema;
      });

      it('should require verification SID starting with VE', () => {
        const validSid = schema.safeParse({
          verificationSid: 'VExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          verificationSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });
  });

  describe('error handling', () => {
    it('should return error when no service SID configured', async () => {
      const contextWithoutSid = {
        client: Twilio('ACtest', 'test'),
        defaultFromNumber: '+15005550006',
      };
      const toolsWithoutSid = verifyTools(contextWithoutSid) as Tool[];
      const tool = toolsWithoutSid.find(t => t.name === 'start_verification')!;

      const result = await tool.handler({ to: '+15551234567' });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Verify Service SID');
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials && TEST_CREDENTIALS.verifyServiceSid ? it : it.skip;

    itWithCredentials('start_verification should initiate verification', async () => {
      const tool = tools.find(t => t.name === 'start_verification')!;

      // Use a test phone number
      const result = await tool.handler({
        to: '+15005550006',
        channel: 'sms',
      });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.sid).toMatch(/^VE/);
    });
  });
});
