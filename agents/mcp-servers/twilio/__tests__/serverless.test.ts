// ABOUTME: Unit tests for Twilio Serverless tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { serverlessTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Real Twilio credentials from environment - NO magic test numbers.
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

describe('serverlessTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = serverlessTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 15 tools', () => {
      expect(tools).toHaveLength(15);
    });

    it('should have list_services tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_services');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('List');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_functions tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_functions');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('List');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_environments tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_environments');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('List');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_build_status tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_build_status');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('status');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_services schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_services');
        schema = tool!.inputSchema;
      });

      it('should have default limit of 20', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate limit bounds', () => {
        const validLimit = schema.safeParse({ limit: 50 });
        expect(validLimit.success).toBe(true);

        const tooLow = schema.safeParse({ limit: 0 });
        expect(tooLow.success).toBe(false);

        const tooHigh = schema.safeParse({ limit: 101 });
        expect(tooHigh.success).toBe(false);
      });
    });

    describe('list_functions schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_functions');
        schema = tool!.inputSchema;
      });

      it('should require serviceSid parameter', () => {
        const withServiceSid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(withServiceSid.success).toBe(true);

        const withoutServiceSid = schema.safeParse({});
        expect(withoutServiceSid.success).toBe(false);
      });

      it('should validate serviceSid starts with ZS', () => {
        const validSid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          serviceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });

      it('should have default limit of 50', () => {
        const result = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });
    });

    describe('list_environments schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_environments');
        schema = tool!.inputSchema;
      });

      it('should require serviceSid parameter', () => {
        const withServiceSid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(withServiceSid.success).toBe(true);

        const withoutServiceSid = schema.safeParse({});
        expect(withoutServiceSid.success).toBe(false);
      });

      it('should validate serviceSid starts with ZS', () => {
        const validSid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          serviceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });

      it('should have default limit of 10', () => {
        const result = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(10);
        }
      });
    });

    describe('get_build_status schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_build_status');
        schema = tool!.inputSchema;
      });

      it('should require serviceSid and buildSid', () => {
        const valid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          buildSid: 'ZBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const withoutServiceSid = schema.safeParse({
          buildSid: 'ZBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(withoutServiceSid.success).toBe(false);

        const withoutBuildSid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(withoutBuildSid.success).toBe(false);
      });

      it('should validate serviceSid starts with ZS', () => {
        const validSid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          buildSid: 'ZBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          serviceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          buildSid: 'ZBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });

      it('should validate buildSid starts with ZB', () => {
        const validSid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          buildSid: 'ZBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          serviceSid: 'ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          buildSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_services should return serverless services',
      async () => {
        const tool = tools.find(t => t.name === 'list_services')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.services)).toBe(true);
      },
      15000
    );
  });
});
