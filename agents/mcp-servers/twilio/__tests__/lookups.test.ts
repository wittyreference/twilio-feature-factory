// ABOUTME: Unit tests for Twilio Lookups v2 tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { lookupsTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Real Twilio credentials from environment - NO magic test numbers.
const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  toNumber: process.env.TEST_PHONE_NUMBER || '',
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

describe('lookupsTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = lookupsTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 2 tools', () => {
      expect(tools).toHaveLength(2);
    });

    it('should have lookup_phone_number tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'lookup_phone_number');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Look up');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have check_fraud_risk tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'check_fraud_risk');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('fraud');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('lookup_phone_number schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'lookup_phone_number');
        schema = tool!.inputSchema;
      });

      it('should require phoneNumber parameter', () => {
        const withPhoneNumber = schema.safeParse({ phoneNumber: '+15551234567' });
        expect(withPhoneNumber.success).toBe(true);

        const withoutPhoneNumber = schema.safeParse({});
        expect(withoutPhoneNumber.success).toBe(false);
      });

      it('should accept optional fields array', () => {
        const withFields = schema.safeParse({
          phoneNumber: '+15551234567',
          fields: ['caller_name', 'line_type_intelligence'],
        });
        expect(withFields.success).toBe(true);
      });

      it('should validate fields enum values', () => {
        const validFields = schema.safeParse({
          phoneNumber: '+15551234567',
          fields: ['validation'],
        });
        expect(validFields.success).toBe(true);

        const invalidFields = schema.safeParse({
          phoneNumber: '+15551234567',
          fields: ['invalid_field'],
        });
        expect(invalidFields.success).toBe(false);
      });
    });

    describe('check_fraud_risk schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'check_fraud_risk');
        schema = tool!.inputSchema;
      });

      it('should require phoneNumber parameter', () => {
        const withPhoneNumber = schema.safeParse({ phoneNumber: '+15551234567' });
        expect(withPhoneNumber.success).toBe(true);

        const withoutPhoneNumber = schema.safeParse({});
        expect(withoutPhoneNumber.success).toBe(false);
      });

      it('should have default checks of sim_swap and sms_pumping_risk', () => {
        const result = schema.safeParse({ phoneNumber: '+15551234567' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.checks).toEqual(['sim_swap', 'sms_pumping_risk']);
        }
      });

      it('should validate checks enum values', () => {
        const validChecks = schema.safeParse({
          phoneNumber: '+15551234567',
          checks: ['sim_swap'],
        });
        expect(validChecks.success).toBe(true);

        const invalidChecks = schema.safeParse({
          phoneNumber: '+15551234567',
          checks: ['invalid_check'],
        });
        expect(invalidChecks.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'lookup_phone_number should return phone number details',
      async () => {
        const tool = tools.find(t => t.name === 'lookup_phone_number')!;

        const result = await tool.handler({
          phoneNumber: TEST_CREDENTIALS.toNumber,
        });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.phoneNumber).toBeDefined();
        expect(response.countryCode).toBeDefined();
        expect(response.valid).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'lookup_phone_number with line_type_intelligence field should return line type info',
      async () => {
        const tool = tools.find(t => t.name === 'lookup_phone_number')!;

        const result = await tool.handler({
          phoneNumber: TEST_CREDENTIALS.toNumber,
          fields: ['line_type_intelligence'],
        });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.lineTypeIntelligence).toBeDefined();
      },
      15000
    );

    // Note: Fraud risk checks may have additional costs and may not be enabled on all accounts
    itWithCredentials(
      'check_fraud_risk should return fraud indicators',
      async () => {
        const tool = tools.find(t => t.name === 'check_fraud_risk')!;

        try {
          const result = await tool.handler({
            phoneNumber: TEST_CREDENTIALS.toNumber,
            checks: ['sim_swap'],
          });

          expect(result.content).toHaveLength(1);
          const response = JSON.parse(result.content[0].text);
          expect(response.success).toBe(true);
          expect(response.phoneNumber).toBeDefined();
        } catch (error) {
          // Fraud risk checks may not be enabled on account - skip if 403/404
          const message = (error as Error).message;
          if (message.includes('403') || message.includes('404') || message.includes('not enabled')) {
            console.log('Fraud risk checks not enabled on account, skipping');
            return;
          }
          throw error;
        }
      },
      15000
    );
  });
});
