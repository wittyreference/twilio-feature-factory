// ABOUTME: Unit tests for Twilio Address tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { addressesTools, TwilioContext } from '../src/index';
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

describe('addressesTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = addressesTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 6 tools', () => {
      expect(tools).toHaveLength(6);
    });

    it('should have list_addresses tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_addresses');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('address');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_address tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_address');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Create');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_address_phone_numbers tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_address_phone_numbers');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('phone numbers');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_addresses schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_addresses');
        schema = tool!.inputSchema;
      });

      it('should have default limit of 20', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should accept optional isoCountry filter', () => {
        const valid = schema.safeParse({ isoCountry: 'US' });
        expect(valid.success).toBe(true);
      });
    });

    describe('create_address schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_address');
        schema = tool!.inputSchema;
      });

      it('should require all address fields', () => {
        const valid = schema.safeParse({
          customerName: 'Test Customer',
          street: '123 Main St',
          city: 'San Francisco',
          region: 'CA',
          postalCode: '94105',
          isoCountry: 'US',
        });
        expect(valid.success).toBe(true);

        const missingCity = schema.safeParse({
          customerName: 'Test Customer',
          street: '123 Main St',
          region: 'CA',
          postalCode: '94105',
          isoCountry: 'US',
        });
        expect(missingCity.success).toBe(false);
      });

      it('should require 2-letter isoCountry', () => {
        const valid = schema.safeParse({
          customerName: 'Test',
          street: '123 Main',
          city: 'SF',
          region: 'CA',
          postalCode: '94105',
          isoCountry: 'US',
        });
        expect(valid.success).toBe(true);

        const invalidCountry = schema.safeParse({
          customerName: 'Test',
          street: '123 Main',
          city: 'SF',
          region: 'CA',
          postalCode: '94105',
          isoCountry: 'USA',
        });
        expect(invalidCountry.success).toBe(false);
      });

      it('should have default emergencyEnabled of false', () => {
        const result = schema.safeParse({
          customerName: 'Test',
          street: '123 Main',
          city: 'SF',
          region: 'CA',
          postalCode: '94105',
          isoCountry: 'US',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.emergencyEnabled).toBe(false);
        }
      });
    });

    describe('get_address schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_address');
        schema = tool!.inputSchema;
      });

      it('should require addressSid starting with AD', () => {
        const valid = schema.safeParse({ addressSid: 'ADxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ addressSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_addresses should return addresses list',
      async () => {
        const tool = tools.find(t => t.name === 'list_addresses')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.addresses)).toBe(true);
      },
      15000
    );
  });
});
