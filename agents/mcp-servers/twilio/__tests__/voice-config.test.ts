// ABOUTME: Unit tests for Twilio Voice Configuration tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { voiceConfigTools, TwilioContext } from '../src/index';
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

describe('voiceConfigTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = voiceConfigTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 14 tools', () => {
      expect(tools).toHaveLength(14);
    });

    it('should have get_dialing_permissions tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_dialing_permissions');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('dialing permission');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_dialing_permissions_countries tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_dialing_permissions_countries');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('countr');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_byoc_trunks tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_byoc_trunks');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('BYOC');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_byoc_trunk tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_byoc_trunk');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('BYOC');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('get_dialing_permissions schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_dialing_permissions');
        schema = tool!.inputSchema;
      });

      it('should require isoCode', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate isoCode is 2 characters', () => {
        const valid = schema.safeParse({ isoCode: 'US' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ isoCode: 'USA' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_dialing_permissions_countries schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_dialing_permissions_countries');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });

      it('should accept optional continent filter', () => {
        const result = schema.safeParse({ continent: 'North America' });
        expect(result.success).toBe(true);
      });
    });

    describe('list_byoc_trunks schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_byoc_trunks');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });
    });

    describe('create_byoc_trunk schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_byoc_trunk');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName and voiceUrl', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should accept friendlyName and voiceUrl', () => {
        const result = schema.safeParse({
          friendlyName: 'Test Trunk',
          voiceUrl: 'https://example.com/webhook',
        });
        expect(result.success).toBe(true);
      });

      it('should accept optional voiceFallbackUrl', () => {
        const result = schema.safeParse({
          friendlyName: 'Test Trunk',
          voiceUrl: 'https://example.com/webhook',
          voiceFallbackUrl: 'https://example.com/fallback',
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'get_dialing_permissions should return permissions for US',
      async () => {
        const tool = tools.find(t => t.name === 'get_dialing_permissions')!;

        const result = await tool.handler({ isoCode: 'US' });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.isoCode).toBe('US');
        expect(response.name).toBeDefined();
      },
      15000
    );

    itWithCredentials(
      'list_dialing_permissions_countries should return countries',
      async () => {
        const tool = tools.find(t => t.name === 'list_dialing_permissions_countries')!;

        const result = await tool.handler({ limit: 10 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.countries)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_byoc_trunks should return trunks',
      async () => {
        const tool = tools.find(t => t.name === 'list_byoc_trunks')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.trunks)).toBe(true);
      },
      15000
    );
  });
});
