// ABOUTME: Unit tests for Twilio SIP Trunking tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { trunkingTools, TwilioContext } from '../src/index';
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

describe('trunkingTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = trunkingTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 17 tools', () => {
      expect(tools).toHaveLength(17);
    });

    it('should have list_sip_trunks tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_sip_trunks');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('trunk');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_sip_trunk tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_sip_trunk');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Create');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_origination_urls tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_origination_urls');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('origination');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have associate_ip_access_control_list tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'associate_ip_access_control_list');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('IP');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_sip_trunks schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_sip_trunks');
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

    describe('create_sip_trunk schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_sip_trunk');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Test Trunk' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({});
        expect(invalid.success).toBe(false);
      });

      it('should have default values for optional fields', () => {
        const result = schema.safeParse({ friendlyName: 'Test Trunk' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.secure).toBe(false);
          expect(result.data.cnamLookupEnabled).toBe(false);
        }
      });
    });

    describe('get_sip_trunk schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_sip_trunk');
        schema = tool!.inputSchema;
      });

      it('should require trunkSid starting with TK', () => {
        const valid = schema.safeParse({ trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ trunkSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_sip_trunks should return trunks list',
      async () => {
        const tool = tools.find(t => t.name === 'list_sip_trunks')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.trunks)).toBe(true);
      },
      15000
    );
  });
});
