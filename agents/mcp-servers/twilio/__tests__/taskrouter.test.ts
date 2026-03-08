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

// All 30 tool names for completeness verification
const EXPECTED_TOOLS = [
  // Workspace management
  'list_workspaces', 'create_workspace', 'get_workspace', 'update_workspace', 'delete_workspace',
  // Task CRUD
  'create_task', 'list_tasks', 'get_task_status', 'update_task', 'delete_task',
  // Worker CRUD
  'create_worker', 'list_workers', 'get_worker', 'update_worker', 'delete_worker',
  // Workflow CRUD
  'create_workflow', 'list_workflows', 'get_workflow', 'update_workflow', 'delete_workflow',
  // Task Queue CRUD
  'create_task_queue', 'list_task_queues', 'get_task_queue', 'update_task_queue', 'delete_task_queue',
  'get_queue_statistics',
  // Activity management
  'create_activity', 'list_activities',
  // Reservation management
  'list_reservations', 'update_reservation',
];

describe('taskrouterTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = taskrouterTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 30 tools', () => {
      expect(tools).toHaveLength(30);
    });

    it.each(EXPECTED_TOOLS)('should have %s tool', (toolName) => {
      const tool = tools.find(t => t.name === toolName);
      expect(tool).toBeDefined();
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

    describe('create_workspace schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_workspace');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Test Workspace' });
        expect(valid.success).toBe(true);

        const empty = schema.safeParse({});
        expect(empty.success).toBe(false);
      });

      it('should validate eventCallbackUrl as URL', () => {
        const valid = schema.safeParse({
          friendlyName: 'Test',
          eventCallbackUrl: 'https://example.com/events',
        });
        expect(valid.success).toBe(true);

        const invalidUrl = schema.safeParse({
          friendlyName: 'Test',
          eventCallbackUrl: 'not-a-url',
        });
        expect(invalidUrl.success).toBe(false);
      });
    });

    describe('create_worker schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_worker');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Agent Smith' });
        expect(valid.success).toBe(true);

        const empty = schema.safeParse({});
        expect(empty.success).toBe(false);
      });

      it('should accept attributes and activitySid', () => {
        const valid = schema.safeParse({
          friendlyName: 'Agent',
          attributes: { skills: ['support', 'billing'] },
          activitySid: 'WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);
      });

      it('should validate activitySid format', () => {
        const invalid = schema.safeParse({
          friendlyName: 'Agent',
          activitySid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('create_workflow schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_workflow');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName and configuration', () => {
        const valid = schema.safeParse({
          friendlyName: 'Support Workflow',
          configuration: '{"task_routing":{"filters":[]}}',
        });
        expect(valid.success).toBe(true);

        const missingConfig = schema.safeParse({ friendlyName: 'Test' });
        expect(missingConfig.success).toBe(false);
      });

      it('should validate assignmentCallbackUrl as URL', () => {
        const valid = schema.safeParse({
          friendlyName: 'Test',
          configuration: '{}',
          assignmentCallbackUrl: 'https://example.com/assign',
        });
        expect(valid.success).toBe(true);
      });
    });

    describe('create_task_queue schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_task_queue');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Support Queue' });
        expect(valid.success).toBe(true);

        const empty = schema.safeParse({});
        expect(empty.success).toBe(false);
      });

      it('should validate taskOrder enum', () => {
        const fifo = schema.safeParse({ friendlyName: 'Q', taskOrder: 'FIFO' });
        expect(fifo.success).toBe(true);

        const lifo = schema.safeParse({ friendlyName: 'Q', taskOrder: 'LIFO' });
        expect(lifo.success).toBe(true);

        const invalid = schema.safeParse({ friendlyName: 'Q', taskOrder: 'RANDOM' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('create_activity schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_activity');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName and available', () => {
        const valid = schema.safeParse({ friendlyName: 'Break', available: false });
        expect(valid.success).toBe(true);

        const missingAvailable = schema.safeParse({ friendlyName: 'Break' });
        expect(missingAvailable.success).toBe(false);
      });
    });

    describe('delete tools schema validation', () => {
      it('delete_workspace should require workspaceSid starting with WS', () => {
        const tool = tools.find(t => t.name === 'delete_workspace')!;
        const valid = tool.inputSchema.safeParse({ workspaceSid: 'WSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ workspaceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });

      it('delete_worker should require workerSid starting with WK', () => {
        const tool = tools.find(t => t.name === 'delete_worker')!;
        const valid = tool.inputSchema.safeParse({ workerSid: 'WKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ workerSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });

      it('delete_workflow should require workflowSid starting with WW', () => {
        const tool = tools.find(t => t.name === 'delete_workflow')!;
        const valid = tool.inputSchema.safeParse({ workflowSid: 'WWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ workflowSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });

      it('delete_task_queue should require taskQueueSid starting with WQ', () => {
        const tool = tools.find(t => t.name === 'delete_task_queue')!;
        const valid = tool.inputSchema.safeParse({ taskQueueSid: 'WQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ taskQueueSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });

      it('delete_task should require taskSid starting with WT', () => {
        const tool = tools.find(t => t.name === 'delete_task')!;
        const valid = tool.inputSchema.safeParse({ taskSid: 'WTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ taskSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('error handling', () => {
    let toolsWithoutSid: Tool[];

    beforeAll(() => {
      const contextWithoutSid = {
        client: Twilio('ACtest', 'test'),
        defaultFromNumber: '+15005550006',
      };
      toolsWithoutSid = taskrouterTools(contextWithoutSid) as Tool[];
    });

    it('should return error when no workspace SID configured for create_task', async () => {
      const tool = toolsWithoutSid.find(t => t.name === 'create_task')!;
      const result = await tool.handler({ attributes: {} });
      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toContain('TaskRouter Workspace SID');
    });

    // Workspace tools don't need workspace SID (they're account-level), so test a sub-resource
    it.each([
      'create_worker', 'get_worker', 'delete_worker',
      'create_workflow', 'get_workflow', 'update_workflow', 'delete_workflow',
      'create_task_queue', 'update_task_queue', 'delete_task_queue',
      'create_activity', 'delete_task',
    ])('should return error for %s when no workspace SID configured', async (toolName) => {
      const tool = toolsWithoutSid.find(t => t.name === toolName)!;
      // Provide minimal valid input for each tool
      const minInput: Record<string, unknown> = {};
      if (toolName.includes('worker')) {
        minInput.friendlyName = 'Test';
        minInput.workerSid = 'WKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      } else if (toolName.includes('workflow')) {
        minInput.friendlyName = 'Test';
        minInput.configuration = '{}';
        minInput.workflowSid = 'WWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      } else if (toolName.includes('task_queue')) {
        minInput.friendlyName = 'Test';
        minInput.taskQueueSid = 'WQxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      } else if (toolName === 'create_activity') {
        minInput.friendlyName = 'Break';
        minInput.available = false;
      } else if (toolName === 'delete_task') {
        minInput.taskSid = 'WTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
      }

      const result = await tool.handler(minInput);
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

    const itWithAccountCredentials = hasRealCredentials ? it : it.skip;

    itWithAccountCredentials('list_workspaces should return workspace array', async () => {
      const tool = tools.find(t => t.name === 'list_workspaces')!;
      const result = await tool.handler({ limit: 5 });

      expect(result.content).toHaveLength(1);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(Array.isArray(response.workspaces)).toBe(true);
    });
  });
});
