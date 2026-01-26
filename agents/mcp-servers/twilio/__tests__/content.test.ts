// ABOUTME: Unit tests for Twilio Content API tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { contentTools, TwilioContext } from '../src/index';
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

describe('contentTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = contentTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 4 tools', () => {
      expect(tools).toHaveLength(4);
    });

    it('should have create_content_template tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_content_template');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('template');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_content_templates tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_content_templates');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('template');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_content_template tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_content_template');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('template');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('create_content_template schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_content_template');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName and contentType', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should accept valid template with text content type', () => {
        const result = schema.safeParse({
          friendlyName: 'Test Template',
          contentType: 'twilio/text',
          body: 'Hello {{1}}!',
        });
        expect(result.success).toBe(true);
      });

      it('should validate contentType enum', () => {
        const valid = schema.safeParse({
          friendlyName: 'Test',
          contentType: 'twilio/text',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          friendlyName: 'Test',
          contentType: 'invalid',
        });
        expect(invalid.success).toBe(false);
      });

      it('should accept optional variables', () => {
        const result = schema.safeParse({
          friendlyName: 'Test Template',
          contentType: 'twilio/text',
          body: 'Hello {{1}}!',
          variables: {
            '1': 'World',
          },
        });
        expect(result.success).toBe(true);
      });
    });

    describe('list_content_templates schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_content_templates');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate limit bounds', () => {
        const tooLow = schema.safeParse({ limit: 0 });
        expect(tooLow.success).toBe(false);

        const tooHigh = schema.safeParse({ limit: 200 });
        expect(tooHigh.success).toBe(false);

        const valid = schema.safeParse({ limit: 50 });
        expect(valid.success).toBe(true);
      });
    });

    describe('get_content_template schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_content_template');
        schema = tool!.inputSchema;
      });

      it('should require contentSid', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate contentSid starts with HX', () => {
        const valid = schema.safeParse({ contentSid: 'HX12345678901234567890123456789012' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ contentSid: 'XX12345678901234567890123456789012' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_content_templates should return templates',
      async () => {
        const tool = tools.find(t => t.name === 'list_content_templates')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.templates)).toBe(true);
      },
      15000
    );
  });
});
