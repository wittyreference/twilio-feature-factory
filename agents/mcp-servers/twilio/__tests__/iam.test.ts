// ABOUTME: Unit tests for Twilio IAM tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { iamTools, TwilioContext } from '../src/index';
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

describe('iamTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = iamTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 8 tools', () => {
      expect(tools).toHaveLength(8);
    });

    it('should have list_api_keys tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_api_keys');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('API key');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_api_key tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_api_key');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Create');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_signing_keys tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_signing_keys');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('signing');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_api_keys schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_api_keys');
        schema = tool!.inputSchema;
      });

      it('should have default limit of 20', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });
    });

    describe('create_api_key schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_api_key');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Test API Key' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({});
        expect(invalid.success).toBe(false);
      });
    });

    describe('get_api_key schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_api_key');
        schema = tool!.inputSchema;
      });

      it('should require keySid starting with SK', () => {
        const valid = schema.safeParse({ keySid: 'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ keySid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_api_keys should return keys list',
      async () => {
        const tool = tools.find(t => t.name === 'list_api_keys')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.apiKeys)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_api_key should return key details when keys exist',
      async () => {
        const listTool = tools.find(t => t.name === 'list_api_keys')!;
        const getTool = tools.find(t => t.name === 'get_api_key')!;

        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const keySid = listResponse.apiKeys[0].sid;

          const getResult = await getTool.handler({ keySid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(keySid);
          expect(getResponse.friendlyName).toBeDefined();
        }
      },
      20000
    );

    itWithCredentials(
      'list_signing_keys should return signing keys list',
      async () => {
        const tool = tools.find(t => t.name === 'list_signing_keys')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.signingKeys)).toBe(true);
      },
      15000
    );
  });
});
