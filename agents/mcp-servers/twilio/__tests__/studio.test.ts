// ABOUTME: Unit tests for Twilio Studio v2 tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { studioTools, TwilioContext } from '../src/index';
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

describe('studioTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = studioTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 9 tools', () => {
      expect(tools).toHaveLength(9);
    });

    it('should have list_studio_flows tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_studio_flows');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('List');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have trigger_flow tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'trigger_flow');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Trigger');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_execution_status tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_execution_status');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('status');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_studio_flows schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_studio_flows');
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

    describe('trigger_flow schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'trigger_flow');
        schema = tool!.inputSchema;
      });

      it('should require flowSid and to parameters', () => {
        const valid = schema.safeParse({
          flowSid: 'FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          to: '+15551234567',
        });
        expect(valid.success).toBe(true);

        const withoutFlowSid = schema.safeParse({ to: '+15551234567' });
        expect(withoutFlowSid.success).toBe(false);

        const withoutTo = schema.safeParse({ flowSid: 'FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(withoutTo.success).toBe(false);
      });

      it('should validate flowSid starts with FW', () => {
        const validSid = schema.safeParse({
          flowSid: 'FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          to: '+15551234567',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          flowSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          to: '+15551234567',
        });
        expect(invalidSid.success).toBe(false);
      });

      it('should accept optional parameters', () => {
        const withParams = schema.safeParse({
          flowSid: 'FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          to: '+15551234567',
          parameters: { key: 'value' },
        });
        expect(withParams.success).toBe(true);
      });
    });

    describe('get_execution_status schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_execution_status');
        schema = tool!.inputSchema;
      });

      it('should require flowSid and executionSid', () => {
        const valid = schema.safeParse({
          flowSid: 'FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          executionSid: 'FNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const withoutFlowSid = schema.safeParse({
          executionSid: 'FNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(withoutFlowSid.success).toBe(false);
      });

      it('should validate SID formats', () => {
        const validSids = schema.safeParse({
          flowSid: 'FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          executionSid: 'FNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSids.success).toBe(true);

        const invalidFlowSid = schema.safeParse({
          flowSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          executionSid: 'FNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidFlowSid.success).toBe(false);

        const invalidExecutionSid = schema.safeParse({
          flowSid: 'FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          executionSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidExecutionSid.success).toBe(false);
      });

      it('should have default includeSteps of false', () => {
        const result = schema.safeParse({
          flowSid: 'FWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          executionSid: 'FNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.includeSteps).toBe(false);
        }
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_studio_flows should return flows list',
      async () => {
        const tool = tools.find(t => t.name === 'list_studio_flows')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.flows)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_flow should return flow details when flow exists',
      async () => {
        const listTool = tools.find(t => t.name === 'list_studio_flows')!;
        const getTool = tools.find(t => t.name === 'get_flow')!;

        // First list flows
        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const flowSid = listResponse.flows[0].sid;

          // Then get the specific flow
          const getResult = await getTool.handler({ flowSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(flowSid);
          expect(getResponse.friendlyName).toBeDefined();
          expect(getResponse.status).toBeDefined();
        }
      },
      20000
    );

    itWithCredentials(
      'list_executions should return executions for a flow',
      async () => {
        const listFlowsTool = tools.find(t => t.name === 'list_studio_flows')!;
        const listExecTool = tools.find(t => t.name === 'list_executions')!;

        // First list flows
        const flowsResult = await listFlowsTool.handler({ limit: 1 });
        const flowsResponse = JSON.parse(flowsResult.content[0].text);

        if (flowsResponse.count > 0) {
          const flowSid = flowsResponse.flows[0].sid;

          // Then list executions for that flow
          const execResult = await listExecTool.handler({ flowSid, limit: 5 });
          const execResponse = JSON.parse(execResult.content[0].text);

          expect(execResponse.success).toBe(true);
          expect(execResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(execResponse.executions)).toBe(true);
        }
      },
      20000
    );
  });
});
