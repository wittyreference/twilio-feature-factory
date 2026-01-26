// ABOUTME: Unit tests for Twilio TrustHub tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { trusthubTools, TwilioContext } from '../src/index';
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

describe('trusthubTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = trusthubTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 17 tools', () => {
      expect(tools).toHaveLength(17);
    });

    it('should have create_customer_profile tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_customer_profile');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('customer profile');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_customer_profiles tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_customer_profiles');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('profile');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_trust_products tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_trust_products');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('trust product');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_policies tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_policies');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('polic');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('create_customer_profile schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_customer_profile');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName, email, and policySid', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate email format', () => {
        const valid = schema.safeParse({
          friendlyName: 'Test Profile',
          email: 'test@example.com',
          policySid: 'RN12345678901234567890123456789012',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          friendlyName: 'Test Profile',
          email: 'not-an-email',
          policySid: 'RN12345678901234567890123456789012',
        });
        expect(invalid.success).toBe(false);
      });

      it('should validate policySid starts with RN', () => {
        const valid = schema.safeParse({
          friendlyName: 'Test',
          email: 'test@example.com',
          policySid: 'RN12345678901234567890123456789012',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          friendlyName: 'Test',
          email: 'test@example.com',
          policySid: 'XX12345678901234567890123456789012',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_customer_profiles schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_customer_profiles');
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
    });

    describe('list_trust_products schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_trust_products');
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

    describe('list_policies schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_policies');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_customer_profiles should return profiles',
      async () => {
        const tool = tools.find(t => t.name === 'list_customer_profiles')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.profiles)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_trust_products should return products',
      async () => {
        const tool = tools.find(t => t.name === 'list_trust_products')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.products)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_policies should return policies',
      async () => {
        const tool = tools.find(t => t.name === 'list_policies')!;

        const result = await tool.handler({ limit: 10 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.policies)).toBe(true);
      },
      15000
    );
  });
});
