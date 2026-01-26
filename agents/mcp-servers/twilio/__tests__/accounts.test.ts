// ABOUTME: Unit tests for Twilio Account management tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { accountsTools, TwilioContext } from '../src/index';
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

describe('accountsTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = accountsTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 13 tools', () => {
      expect(tools).toHaveLength(13);
    });

    it('should have get_account tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_account');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('account');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_usage_records tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_usage_records');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('usage');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_usage_trigger tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_usage_trigger');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('trigger');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_account_balance tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_account_balance');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('balance');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_accounts schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_accounts');
        schema = tool!.inputSchema;
      });

      it('should have default limit of 20', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should accept optional status filter', () => {
        const valid = schema.safeParse({ status: 'active' });
        expect(valid.success).toBe(true);

        const invalidStatus = schema.safeParse({ status: 'invalid' });
        expect(invalidStatus.success).toBe(false);
      });
    });

    describe('create_subaccount schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_subaccount');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Test Subaccount' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({});
        expect(invalid.success).toBe(false);
      });
    });

    describe('create_usage_trigger schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_usage_trigger');
        schema = tool!.inputSchema;
      });

      it('should require callbackUrl, triggerValue, and usageCategory', () => {
        const valid = schema.safeParse({
          callbackUrl: 'https://example.com/webhook',
          triggerValue: '100',
          usageCategory: 'sms',
        });
        expect(valid.success).toBe(true);

        const missingUrl = schema.safeParse({ triggerValue: '100', usageCategory: 'sms' });
        expect(missingUrl.success).toBe(false);
      });

      it('should have default triggerBy of usage', () => {
        const result = schema.safeParse({
          callbackUrl: 'https://example.com/webhook',
          triggerValue: '100',
          usageCategory: 'sms',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.triggerBy).toBe('usage');
        }
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'get_account should return account details',
      async () => {
        const tool = tools.find(t => t.name === 'get_account')!;

        const result = await tool.handler({});

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.sid).toMatch(/^AC/);
        expect(response.status).toBeDefined();
      },
      15000
    );

    itWithCredentials(
      'get_account_balance should return balance',
      async () => {
        const tool = tools.find(t => t.name === 'get_account_balance')!;

        const result = await tool.handler({});

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.balance).toBeDefined();
        expect(response.currency).toBeDefined();
      },
      15000
    );

    itWithCredentials(
      'list_accounts should return accounts list',
      async () => {
        const tool = tools.find(t => t.name === 'list_accounts')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.accounts)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_usage_records should return usage data',
      async () => {
        const tool = tools.find(t => t.name === 'list_usage_records')!;

        const result = await tool.handler({ limit: 10 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.usageRecords)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_usage_triggers should return triggers list',
      async () => {
        const tool = tools.find(t => t.name === 'list_usage_triggers')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.usageTriggers)).toBe(true);
      },
      15000
    );
  });
});
