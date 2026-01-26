// ABOUTME: Unit tests for Twilio Regulatory tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { regulatoryTools, TwilioContext } from '../src/index';
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

describe('regulatoryTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = regulatoryTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 16 tools', () => {
      expect(tools).toHaveLength(16);
    });

    it('should have list_regulatory_bundles tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_regulatory_bundles');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('bundle');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_bundle_status tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_bundle_status');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('bundle');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_supporting_documents tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_supporting_documents');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('document');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_regulations tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_regulations');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('regulation');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_regulatory_bundles schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_regulatory_bundles');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate status enum', () => {
        const valid = schema.safeParse({ status: 'twilio-approved' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ status: 'invalid' });
        expect(invalid.success).toBe(false);
      });

      it('should validate isoCountry is 2 characters', () => {
        const valid = schema.safeParse({ isoCountry: 'US' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ isoCountry: 'USA' });
        expect(invalid.success).toBe(false);
      });

      it('should validate numberType enum', () => {
        const valid = schema.safeParse({ numberType: 'local' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ numberType: 'invalid' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('get_bundle_status schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_bundle_status');
        schema = tool!.inputSchema;
      });

      it('should require bundleSid', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate bundleSid starts with BU', () => {
        const valid = schema.safeParse({ bundleSid: 'BU12345678901234567890123456789012' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ bundleSid: 'XX12345678901234567890123456789012' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_supporting_documents schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_supporting_documents');
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

    describe('list_regulations schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_regulations');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate endUserType enum', () => {
        const valid = schema.safeParse({ endUserType: 'individual' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ endUserType: 'invalid' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_regulatory_bundles should return bundles',
      async () => {
        const tool = tools.find(t => t.name === 'list_regulatory_bundles')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.bundles)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_supporting_documents should return documents',
      async () => {
        const tool = tools.find(t => t.name === 'list_supporting_documents')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.documents)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_regulations should return regulations',
      async () => {
        const tool = tools.find(t => t.name === 'list_regulations')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.regulations)).toBe(true);
      },
      15000
    );
  });
});
