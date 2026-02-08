// ABOUTME: Unit tests for Twilio debugger and monitoring tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { debuggerTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Real Twilio credentials from environment - NO magic test numbers.
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

describe('debuggerTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = debuggerTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 3 tools', () => {
      expect(tools).toHaveLength(3);
    });

    it('should have get_debugger_logs tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_debugger_logs');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('debugger');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have analyze_errors tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'analyze_errors');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('error');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_usage_records tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_usage_records');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('usage');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('get_debugger_logs schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_debugger_logs');
        schema = tool!.inputSchema;
      });

      it('should have sensible defaults', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate log level enum', () => {
        const validLevel = schema.safeParse({ logLevel: 'error' });
        expect(validLevel.success).toBe(true);

        const invalidLevel = schema.safeParse({ logLevel: 'invalid' });
        expect(invalidLevel.success).toBe(false);
      });

      it('should reject limit outside range', () => {
        expect(schema.safeParse({ limit: 0 }).success).toBe(false);
        expect(schema.safeParse({ limit: 101 }).success).toBe(false);
        expect(schema.safeParse({ limit: 50 }).success).toBe(true);
      });
    });

    describe('analyze_errors schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'analyze_errors');
        schema = tool!.inputSchema;
      });

      it('should have default hours of 24', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.hours).toBe(24);
        }
      });

      it('should validate hours range (1-168)', () => {
        expect(schema.safeParse({ hours: 0 }).success).toBe(false);
        expect(schema.safeParse({ hours: 169 }).success).toBe(false);
        expect(schema.safeParse({ hours: 48 }).success).toBe(true);
      });
    });

    describe('get_usage_records schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_usage_records');
        schema = tool!.inputSchema;
      });

      it('should validate category enum', () => {
        const validCategory = schema.safeParse({ category: 'calls' });
        expect(validCategory.success).toBe(true);

        const invalidCategory = schema.safeParse({ category: 'invalid' });
        expect(invalidCategory.success).toBe(false);
      });

      it('should accept date strings', () => {
        const withDates = schema.safeParse({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        });
        expect(withDates.success).toBe(true);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials('get_debugger_logs should return alert array', async () => {
      const tool = tools.find(t => t.name === 'get_debugger_logs')!;
      const result = await tool.handler({ limit: 5 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.alerts)).toBe(true);
    });

    itWithCredentials('analyze_errors should return error analysis', async () => {
      const tool = tools.find(t => t.name === 'analyze_errors')!;
      const result = await tool.handler({ hours: 24 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.timeRange).toBeDefined();
      expect(typeof response.totalErrors).toBe('number');
    });

    itWithCredentials('get_usage_records should return usage data', async () => {
      const tool = tools.find(t => t.name === 'get_usage_records')!;
      const result = await tool.handler({});

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.records)).toBe(true);
    }, 15000);
  });
});
