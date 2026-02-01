// ABOUTME: Unit tests for doc-generator extractors.
// ABOUTME: Tests MCP tools, workflows, and agents extraction functionality.

import { extractMcpTools } from '../../src/extractors/mcp-tools.js';
import { extractWorkflows } from '../../src/extractors/workflows.js';
import { extractAgents } from '../../src/extractors/agents.js';
import type {
  ToolDefinition,
  WorkflowDefinition,
  AgentDefinition,
} from '../../src/types.js';

describe('MCP Tools Extractor', () => {
  describe('extractMcpTools', () => {
    it('should extract tool definitions from tool source code', () => {
      const sourceCode = `
        const sendSms = createTool(
          'send_sms',
          'Send an SMS message via Twilio. Returns the message SID on success.',
          z.object({
            to: phoneNumberSchema.describe('Destination phone number in E.164 format'),
            body: z.string().min(1).max(1600).describe('Message content (max 1600 characters)'),
            from: phoneNumberSchema.optional().describe('Sender phone number (defaults to configured number)'),
          }),
          async ({ to, body, from }) => { /* handler */ }
        );
      `;

      const result = extractMcpTools(sourceCode, 'messaging.ts');

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]).toMatchObject({
        name: 'send_sms',
        description: 'Send an SMS message via Twilio. Returns the message SID on success.',
        module: 'messaging',
        sourceFile: 'messaging.ts',
      });
    });

    it('should extract parameter definitions with types and required status', () => {
      const sourceCode = `
        const sendSms = createTool(
          'send_sms',
          'Send an SMS message',
          z.object({
            to: z.string().describe('Destination number'),
            body: z.string().describe('Message body'),
            from: z.string().optional().describe('Sender number'),
            limit: z.number().default(20).describe('Max results'),
          }),
          async (params) => { /* handler */ }
        );
      `;

      const result = extractMcpTools(sourceCode, 'messaging.ts');
      const params = result.tools[0].parameters;

      expect(params).toHaveLength(4);

      // Required params
      const toParam = params.find((p) => p.name === 'to');
      expect(toParam?.required).toBe(true);
      expect(toParam?.type).toBe('string');

      // Optional param
      const fromParam = params.find((p) => p.name === 'from');
      expect(fromParam?.required).toBe(false);

      // Param with default
      const limitParam = params.find((p) => p.name === 'limit');
      expect(limitParam?.defaultValue).toBe(20);
    });

    it('should extract multiple tools from a single file', () => {
      const sourceCode = `
        const sendSms = createTool('send_sms', 'Send SMS', z.object({}), async () => {});
        const sendMms = createTool('send_mms', 'Send MMS', z.object({}), async () => {});
        const getMessageLogs = createTool('get_message_logs', 'Get logs', z.object({}), async () => {});
      `;

      const result = extractMcpTools(sourceCode, 'messaging.ts');

      expect(result.tools).toHaveLength(3);
      expect(result.tools.map((t) => t.name)).toEqual([
        'send_sms',
        'send_mms',
        'get_message_logs',
      ]);
    });

    it('should derive module name from filename', () => {
      const sourceCode = `const tool = createTool('test', 'Test', z.object({}), async () => {});`;

      expect(extractMcpTools(sourceCode, 'voice.ts').tools[0].module).toBe('voice');
      expect(extractMcpTools(sourceCode, 'phone-numbers.ts').tools[0].module).toBe('phone-numbers');
      expect(extractMcpTools(sourceCode, 'taskrouter.ts').tools[0].module).toBe('taskrouter');
    });

    it('should handle array parameters', () => {
      const sourceCode = `
        const sendMms = createTool(
          'send_mms',
          'Send MMS',
          z.object({
            mediaUrl: z.array(z.string().url()).min(1).max(10).describe('Array of media URLs'),
          }),
          async () => {}
        );
      `;

      const result = extractMcpTools(sourceCode, 'messaging.ts');
      const mediaParam = result.tools[0].parameters.find((p) => p.name === 'mediaUrl');

      expect(mediaParam?.type).toBe('array');
    });

    it('should return module summary with tool count', () => {
      const sourceCode = `
        const tool1 = createTool('t1', 'Tool 1', z.object({}), async () => {});
        const tool2 = createTool('t2', 'Tool 2', z.object({}), async () => {});
      `;

      const result = extractMcpTools(sourceCode, 'voice.ts');

      expect(result.modules).toHaveLength(1);
      expect(result.modules[0]).toMatchObject({
        name: 'voice',
        toolCount: 2,
      });
      expect(result.totalCount).toBe(2);
    });
  });
});

describe('Workflows Extractor', () => {
  describe('extractWorkflows', () => {
    it('should extract workflow definition from source code', () => {
      const sourceCode = `
        export const newFeatureWorkflow: Workflow = {
          name: 'new-feature',
          description: 'Full TDD pipeline for new Twilio features',
          phases: [
            {
              agent: 'architect',
              name: 'Design Review',
              approvalRequired: true,
            },
            {
              agent: 'spec',
              name: 'Specification',
              approvalRequired: true,
            },
          ],
        };
      `;

      const result = extractWorkflows(sourceCode, 'new-feature.ts');

      expect(result.workflows).toHaveLength(1);
      expect(result.workflows[0]).toMatchObject({
        name: 'new-feature',
        description: 'Full TDD pipeline for new Twilio features',
        sourceFile: 'new-feature.ts',
      });
    });

    it('should extract all phases from workflow', () => {
      const sourceCode = `
        export const workflow: Workflow = {
          name: 'test-workflow',
          description: 'Test',
          phases: [
            { agent: 'architect', name: 'Phase 1', approvalRequired: true },
            { agent: 'dev', name: 'Phase 2', approvalRequired: false, prePhaseHooks: ['tdd-enforcement'] },
            { agent: 'review', name: 'Phase 3', approvalRequired: true },
          ],
        };
      `;

      const result = extractWorkflows(sourceCode, 'test.ts');
      const phases = result.workflows[0].phases;

      expect(phases).toHaveLength(3);
      expect(phases[0]).toMatchObject({
        agent: 'architect',
        name: 'Phase 1',
        approvalRequired: true,
      });
      expect(phases[1].prePhaseHooks).toEqual(['tdd-enforcement']);
    });

    it('should extract multiple workflows from a single file', () => {
      const sourceCode = `
        export const workflow1: Workflow = { name: 'wf1', description: 'First', phases: [] };
        export const workflow2: Workflow = { name: 'wf2', description: 'Second', phases: [] };
      `;

      const result = extractWorkflows(sourceCode, 'workflows.ts');

      expect(result.workflows).toHaveLength(2);
    });

    it('should extract hooks referenced in phases', () => {
      const sourceCode = `
        export const workflow: Workflow = {
          name: 'test',
          description: 'Test',
          phases: [
            { agent: 'dev', name: 'Dev', approvalRequired: false, prePhaseHooks: ['tdd-enforcement', 'coverage-threshold'] },
          ],
        };
      `;

      const result = extractWorkflows(sourceCode, 'test.ts');

      // Hooks should be collected from all prePhaseHooks references
      expect(result.hooks.map((h) => h.name)).toContain('tdd-enforcement');
      expect(result.hooks.map((h) => h.name)).toContain('coverage-threshold');
    });
  });
});

describe('Agents Extractor', () => {
  describe('extractAgents', () => {
    it('should extract agent configuration from source code', () => {
      const sourceCode = `
        export const architectAgent: AgentConfig = {
          name: 'architect',
          description: 'Evaluates architecture fit and selects patterns',
          systemPrompt: \`You are the Architect agent...\`,
          tools: ['Read', 'Glob', 'Grep'],
          maxTurns: 20,
          inputSchema: {
            feature: 'string - Feature description',
            context: 'string - Additional context',
          },
          outputSchema: {
            approved: 'boolean - Whether design is approved',
            designNotes: 'string - Architecture notes',
          },
        };
      `;

      const result = extractAgents(sourceCode, 'architect.ts');

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]).toMatchObject({
        name: 'architect',
        description: 'Evaluates architecture fit and selects patterns',
        tools: ['Read', 'Glob', 'Grep'],
        maxTurns: 20,
        sourceFile: 'architect.ts',
      });
    });

    it('should extract input and output schemas', () => {
      const sourceCode = `
        export const agent: AgentConfig = {
          name: 'test',
          description: 'Test agent',
          systemPrompt: 'Test',
          tools: [],
          maxTurns: 10,
          inputSchema: {
            field1: 'string - Description 1',
            field2: 'number - Description 2',
          },
          outputSchema: {
            result: 'boolean - Success flag',
            data: 'object - Output data',
          },
        };
      `;

      const result = extractAgents(sourceCode, 'test.ts');
      const agent = result.agents[0];

      expect(agent.inputSchema).toEqual({
        field1: 'string - Description 1',
        field2: 'number - Description 2',
      });
      expect(agent.outputSchema).toEqual({
        result: 'boolean - Success flag',
        data: 'object - Output data',
      });
    });

    it('should create system prompt summary from full prompt', () => {
      const sourceCode = `
        export const agent: AgentConfig = {
          name: 'test',
          description: 'Test',
          systemPrompt: \`You are the Test agent responsible for important tasks.

## Your Role
You must do many things including:
1. First thing
2. Second thing
3. Third thing

## What You Do NOT Do
- Don't do this
- Don't do that\`,
          tools: [],
          maxTurns: 10,
          inputSchema: {},
          outputSchema: {},
        };
      `;

      const result = extractAgents(sourceCode, 'test.ts');

      // Summary should be truncated to first meaningful section
      expect(result.agents[0].systemPromptSummary).toBeDefined();
      expect(result.agents[0].systemPromptSummary.length).toBeLessThan(500);
    });

    it('should extract multiple agents from a single file', () => {
      const sourceCode = `
        export const agent1: AgentConfig = { name: 'a1', description: 'Agent 1', systemPrompt: '', tools: [], maxTurns: 10, inputSchema: {}, outputSchema: {} };
        export const agent2: AgentConfig = { name: 'a2', description: 'Agent 2', systemPrompt: '', tools: [], maxTurns: 20, inputSchema: {}, outputSchema: {} };
      `;

      const result = extractAgents(sourceCode, 'agents.ts');

      expect(result.agents).toHaveLength(2);
      expect(result.agents.map((a) => a.name)).toEqual(['a1', 'a2']);
    });

    it('should handle optional model field', () => {
      const sourceCode = `
        export const agent: AgentConfig = {
          name: 'test',
          description: 'Test',
          systemPrompt: '',
          tools: [],
          maxTurns: 10,
          model: 'opus',
          inputSchema: {},
          outputSchema: {},
        };
      `;

      const result = extractAgents(sourceCode, 'test.ts');

      expect(result.agents[0].model).toBe('opus');
    });
  });
});
