// ABOUTME: Unit tests for Twilio TaskRouter tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { taskrouterTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Real Twilio credentials from environment - NO magic test numbers.
const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  taskrouterWorkspaceSid: process.env.TWILIO_TASKROUTER_WORKSPACE_SID,
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
    taskrouterWorkspaceSid: TEST_CREDENTIALS.taskrouterWorkspaceSid,
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('taskrouterTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = taskrouterTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 5 tools', () => {
      expect(tools).toHaveLength(5);
    });

    it('should have create_task tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_task');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('task');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_tasks tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_tasks');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('tasks');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_task_status tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_task_status');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('status');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_workers tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_workers');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('workers');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_workflows tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_workflows');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('workflows');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('create_task schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_task');
        schema = tool!.inputSchema;
      });

      it('should require attributes', () => {
        const valid = schema.safeParse({ attributes: { type: 'support' } });
        expect(valid.success).toBe(true);

        const empty = schema.safeParse({});
        expect(empty.success).toBe(false);
      });

      it('should validate workspace SID format', () => {
        const validSid = schema.safeParse({
          attributes: {},
          workspaceSid: 'WSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          attributes: {},
          workspaceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });

      it('should validate workflow SID format', () => {
        const validSid = schema.safeParse({
          attributes: {},
          workflowSid: 'WWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);
      });
    });

    describe('list_tasks schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_tasks');
        schema = tool!.inputSchema;
      });

      it('should have sensible defaults', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate assignment status enum', () => {
        const validStatus = schema.safeParse({ assignmentStatus: 'pending' });
        expect(validStatus.success).toBe(true);

        const invalidStatus = schema.safeParse({ assignmentStatus: 'invalid' });
        expect(invalidStatus.success).toBe(false);
      });
    });

    describe('get_task_status schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_task_status');
        schema = tool!.inputSchema;
      });

      it('should require task SID starting with WT', () => {
        const validSid = schema.safeParse({
          taskSid: 'WTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          taskSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });

    describe('list_workers schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_workers');
        schema = tool!.inputSchema;
      });

      it('should accept available filter as boolean', () => {
        const withAvailable = schema.safeParse({ available: true });
        expect(withAvailable.success).toBe(true);
      });
    });
  });

  describe('error handling', () => {
    it('should return error when no workspace SID configured', async () => {
      const contextWithoutSid = {
        client: Twilio('ACtest', 'test'),
        defaultFromNumber: '+15005550006',
      };
      const toolsWithoutSid = taskrouterTools(contextWithoutSid) as Tool[];
      const tool = toolsWithoutSid.find(t => t.name === 'create_task')!;

      const result = await tool.handler({ attributes: {} });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toContain('TaskRouter Workspace SID');
    });
  });

  describe('API integration', () => {
    const itWithCredentials =
      hasRealCredentials && TEST_CREDENTIALS.taskrouterWorkspaceSid ? it : it.skip;

    itWithCredentials('list_workers should return worker array', async () => {
      const tool = tools.find(t => t.name === 'list_workers')!;
      const result = await tool.handler({ limit: 5 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.workers)).toBe(true);
    });
  });
});
