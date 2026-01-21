// ABOUTME: Unit tests for Twilio Sync tools.
// ABOUTME: Tests tool structure, schema validation, and API integration using test credentials.

import { syncTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACtest',
  authToken: process.env.TWILIO_AUTH_TOKEN || 'test_token',
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+15005550006',
  syncServiceSid: process.env.TWILIO_SYNC_SERVICE_SID,
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.accountSid !== 'ACtest';

function createTestContext(): TwilioContext {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return {
    client,
    defaultFromNumber: TEST_CREDENTIALS.phoneNumber,
    syncServiceSid: TEST_CREDENTIALS.syncServiceSid,
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('syncTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = syncTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 4 tools', () => {
      expect(tools).toHaveLength(4);
    });

    it('should have create_document tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_document');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Create');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have update_document tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'update_document');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Update');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_document tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_document');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Retrieve');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_documents tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_documents');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('List');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('create_document schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_document');
        schema = tool!.inputSchema;
      });

      it('should require uniqueName and data', () => {
        const valid = schema.safeParse({
          uniqueName: 'test-doc',
          data: { key: 'value' },
        });
        expect(valid.success).toBe(true);

        const withoutName = schema.safeParse({ data: { key: 'value' } });
        expect(withoutName.success).toBe(false);

        const withoutData = schema.safeParse({ uniqueName: 'test-doc' });
        expect(withoutData.success).toBe(false);
      });

      it('should validate uniqueName length', () => {
        const tooLong = schema.safeParse({
          uniqueName: 'x'.repeat(321),
          data: {},
        });
        expect(tooLong.success).toBe(false);
      });

      it('should accept optional ttl', () => {
        const withTtl = schema.safeParse({
          uniqueName: 'test-doc',
          data: {},
          ttl: 3600,
        });
        expect(withTtl.success).toBe(true);
      });

      it('should validate service SID format', () => {
        const validSid = schema.safeParse({
          uniqueName: 'test-doc',
          data: {},
          serviceSid: 'ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          uniqueName: 'test-doc',
          data: {},
          serviceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });

    describe('update_document schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'update_document');
        schema = tool!.inputSchema;
      });

      it('should require documentSidOrName and data', () => {
        const valid = schema.safeParse({
          documentSidOrName: 'test-doc',
          data: { key: 'value' },
        });
        expect(valid.success).toBe(true);
      });
    });

    describe('get_document schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_document');
        schema = tool!.inputSchema;
      });

      it('should require documentSidOrName', () => {
        const valid = schema.safeParse({ documentSidOrName: 'test-doc' });
        expect(valid.success).toBe(true);

        const empty = schema.safeParse({});
        expect(empty.success).toBe(false);
      });
    });

    describe('list_documents schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_documents');
        schema = tool!.inputSchema;
      });

      it('should have sensible defaults', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });
    });
  });

  describe('error handling', () => {
    it('should return error when no service SID configured', async () => {
      const contextWithoutSid = {
        client: Twilio('ACtest', 'test'),
        defaultFromNumber: '+15005550006',
      };
      const toolsWithoutSid = syncTools(contextWithoutSid) as Tool[];
      const tool = toolsWithoutSid.find(t => t.name === 'create_document')!;

      const result = await tool.handler({
        uniqueName: 'test',
        data: {},
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Sync Service SID');
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials && TEST_CREDENTIALS.syncServiceSid ? it : it.skip;

    itWithCredentials('list_documents should return document array', async () => {
      const tool = tools.find(t => t.name === 'list_documents')!;
      const result = await tool.handler({ limit: 5 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.documents)).toBe(true);
    });
  });
});
