// ABOUTME: Integration tests for Feature Factory components.
// ABOUTME: Validates orchestrator, agents, workflows, and tools work together.

import { FeatureFactoryOrchestrator } from '../src/orchestrator.js';
import { getWorkflow } from '../src/workflows/index.js';
import { getAgentConfig } from '../src/agents/index.js';
import { getToolSchemas, executeTool } from '../src/tools.js';
import { createConfig, validateConfig } from '../src/config.js';
import {
  isMcpTool,
  getMcpToolNames,
  isMcpInitialized,
} from '../src/mcp-tools.js';
import type { AgentType, WorkflowType } from '../src/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Feature Factory Integration', () => {
  describe('Configuration', () => {
    it('should create valid default config', () => {
      const config = createConfig();
      expect(() => validateConfig(config)).not.toThrow();
      expect(config.maxBudgetUsd).toBe(5.0);
      expect(config.maxTurnsPerAgent).toBe(200);
      expect(config.defaultModel).toBe('sonnet');
    });

    it('should accept custom config values', () => {
      const config = createConfig({
        maxBudgetUsd: 10.0,
        maxTurnsPerAgent: 100,
        defaultModel: 'opus',
        approvalMode: 'none',
      });
      expect(config.maxBudgetUsd).toBe(10.0);
      expect(config.maxTurnsPerAgent).toBe(100);
      expect(config.defaultModel).toBe('opus');
      expect(config.approvalMode).toBe('none');
    });

    it('should reject invalid config', () => {
      expect(() =>
        validateConfig(createConfig({ maxBudgetUsd: -1 }))
      ).toThrow();
      expect(() =>
        validateConfig(createConfig({ maxTurnsPerAgent: 0 }))
      ).toThrow();
    });
  });

  describe('Agent Configs', () => {
    const agentTypes: AgentType[] = [
      'architect',
      'spec',
      'test-gen',
      'dev',
      'qa',
      'review',
      'docs',
    ];

    it('should load all agent configs', () => {
      for (const agentType of agentTypes) {
        const config = getAgentConfig(agentType);
        expect(config).toBeDefined();
        expect(config.name).toBe(agentType);
      }
    });

    it('should have required fields in each agent config', () => {
      for (const agentType of agentTypes) {
        const config = getAgentConfig(agentType);
        expect(config.name).toBeDefined();
        expect(config.description).toBeDefined();
        expect(config.systemPrompt).toBeDefined();
        expect(config.systemPrompt.length).toBeGreaterThan(100);
        expect(Array.isArray(config.tools)).toBe(true);
        expect(config.tools.length).toBeGreaterThan(0);
        expect(config.maxTurns).toBeGreaterThan(0);
        expect(config.outputSchema).toBeDefined();
      }
    });

    it('should have valid tool names in agent configs', () => {
      const validCoreTools = [
        'Read',
        'Write',
        'Edit',
        'Glob',
        'Grep',
        'Bash',
        'WebSearch',
        'WebFetch',
        'AskUserQuestion',
      ];

      for (const agentType of agentTypes) {
        const config = getAgentConfig(agentType);
        for (const tool of config.tools) {
          const isValid = validCoreTools.includes(tool) || isMcpTool(tool);
          expect(isValid).toBe(true);
        }
      }
    });

    it('should generate tool schemas for each agent', () => {
      for (const agentType of agentTypes) {
        const config = getAgentConfig(agentType);
        const schemas = getToolSchemas(config.tools);
        expect(schemas.length).toBeGreaterThan(0);

        // Each schema should have required Anthropic API fields
        for (const schema of schemas) {
          expect(schema.name).toBeDefined();
          expect(schema.description).toBeDefined();
          expect(schema.input_schema).toBeDefined();
          expect(schema.input_schema.type).toBe('object');
        }
      }
    });
  });

  describe('Workflows', () => {
    it('should load new-feature workflow', () => {
      const workflow = getWorkflow('new-feature');
      expect(workflow).toBeDefined();
      expect(workflow.name).toBe('new-feature');
      expect(workflow.phases.length).toBeGreaterThan(0);
    });

    it('should have valid phase structure', () => {
      const workflow = getWorkflow('new-feature');

      for (const phase of workflow.phases) {
        expect(phase.agent).toBeDefined();
        expect(phase.name).toBeDefined();
        expect(typeof phase.approvalRequired).toBe('boolean');

        // Agent should exist
        expect(() => getAgentConfig(phase.agent)).not.toThrow();
      }
    });

    it('should have correct phase order for TDD', () => {
      const workflow = getWorkflow('new-feature');
      const agentOrder = workflow.phases.map((p) => p.agent);

      // Verify TDD order: test-gen comes before dev
      const testGenIndex = agentOrder.indexOf('test-gen');
      const devIndex = agentOrder.indexOf('dev');

      expect(testGenIndex).toBeGreaterThan(-1);
      expect(devIndex).toBeGreaterThan(-1);
      expect(testGenIndex).toBeLessThan(devIndex);
    });

    it('should require approval for design phases', () => {
      const workflow = getWorkflow('new-feature');

      const architectPhase = workflow.phases.find(
        (p) => p.agent === 'architect'
      );
      const specPhase = workflow.phases.find((p) => p.agent === 'spec');
      const reviewPhase = workflow.phases.find((p) => p.agent === 'review');

      expect(architectPhase?.approvalRequired).toBe(true);
      expect(specPhase?.approvalRequired).toBe(true);
      expect(reviewPhase?.approvalRequired).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    let tempDir: string;

    beforeAll(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-integration-'));
    });

    afterAll(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should execute Read tool on test file', async () => {
      const testFile = path.join(tempDir, 'test-read.txt');
      fs.writeFileSync(testFile, 'line 1\nline 2\nline 3\n');

      const result = await executeTool(
        'Read',
        { file_path: testFile },
        { workingDirectory: tempDir }
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('line 1');
      expect(result.output).toContain('line 2');
    });

    it('should execute Write tool', async () => {
      const testFile = path.join(tempDir, 'test-write.txt');

      const result = await executeTool(
        'Write',
        { file_path: testFile, content: 'hello world' },
        { workingDirectory: tempDir }
      );

      expect(result.success).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);
      expect(fs.readFileSync(testFile, 'utf-8')).toBe('hello world');
    });

    it('should execute Glob tool', async () => {
      // Create some test files
      fs.writeFileSync(path.join(tempDir, 'a.ts'), '');
      fs.writeFileSync(path.join(tempDir, 'b.ts'), '');
      fs.writeFileSync(path.join(tempDir, 'c.js'), '');

      const result = await executeTool(
        'Glob',
        { pattern: '*.ts', path: tempDir },
        { workingDirectory: tempDir }
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('a.ts');
      expect(result.output).toContain('b.ts');
      expect(result.output).not.toContain('c.js');
    });

    it('should execute Grep tool', async () => {
      const testFile = path.join(tempDir, 'grep-test.txt');
      fs.writeFileSync(testFile, 'foo bar\nbaz qux\nfoo again\n');

      const result = await executeTool(
        'Grep',
        { pattern: 'foo', path: tempDir },
        { workingDirectory: tempDir }
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('foo');
    });

    it('should execute Bash tool safely', async () => {
      const result = await executeTool(
        'Bash',
        { command: 'echo "hello from bash"' },
        { workingDirectory: tempDir }
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('hello from bash');
    });

    it('should block dangerous Bash commands', async () => {
      const result = await executeTool(
        'Bash',
        { command: 'git commit --no-verify -m "bad"' },
        { workingDirectory: tempDir }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
    });
  });

  describe('Orchestrator Instantiation', () => {
    it('should instantiate with default config', () => {
      const orchestrator = new FeatureFactoryOrchestrator();
      expect(orchestrator).toBeDefined();
      expect(orchestrator.getConfig()).toBeDefined();
    });

    it('should instantiate with custom config', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        maxBudgetUsd: 10.0,
        approvalMode: 'none',
        verbose: true,
      });

      const config = orchestrator.getConfig();
      expect(config.maxBudgetUsd).toBe(10.0);
      expect(config.approvalMode).toBe('none');
      expect(config.verbose).toBe(true);
    });

    it('should start with null state', () => {
      const orchestrator = new FeatureFactoryOrchestrator();
      expect(orchestrator.getState()).toBeNull();
    });
  });

  describe('MCP Tool Integration', () => {
    const hasCredentials =
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER;

    it('should identify MCP tools without initialization', () => {
      // These should work without credentials
      expect(isMcpTool('send_sms')).toBe(true);
      expect(isMcpTool('make_call')).toBe(true);
      expect(isMcpTool('validate_message')).toBe(true);
      expect(isMcpTool('Read')).toBe(false);
      expect(isMcpTool('unknown')).toBe(false);
    });

    it('should return MCP tool names when initialized', () => {
      if (!hasCredentials) {
        console.log('Skipping: No Twilio credentials');
        return;
      }

      // Orchestrator should initialize MCP tools
      new FeatureFactoryOrchestrator({ twilioMcpEnabled: true });

      expect(isMcpInitialized()).toBe(true);
      const names = getMcpToolNames();
      expect(names.length).toBeGreaterThan(20);
      expect(names).toContain('send_sms');
      expect(names).toContain('get_debugger_logs');
    });

    it('should generate MCP tool schemas for dev agent', () => {
      if (!hasCredentials) {
        console.log('Skipping: No Twilio credentials');
        return;
      }

      const devConfig = getAgentConfig('dev');
      const schemas = getToolSchemas(devConfig.tools);

      // Dev agent has core tools + MCP tools
      expect(schemas.length).toBeGreaterThan(5);

      // Should have core tools
      expect(schemas.find((s) => s.name === 'Read')).toBeDefined();
      expect(schemas.find((s) => s.name === 'Write')).toBeDefined();
      expect(schemas.find((s) => s.name === 'Bash')).toBeDefined();
    });
  });

  describe('Workflow Event Generation', () => {
    it('should generate workflow-started event', async () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        maxBudgetUsd: 0.01, // Very small budget to trigger budget exceeded quickly
        approvalMode: 'none',
      });

      const events: unknown[] = [];

      // Start workflow but it should fail quickly due to budget
      // or we can just collect the first event
      const generator = orchestrator.runWorkflow(
        'new-feature',
        'Test feature description'
      );

      const firstEvent = await generator.next();
      events.push(firstEvent.value);

      expect(firstEvent.value).toBeDefined();
      expect(firstEvent.value.type).toBe('workflow-started');
      expect(firstEvent.value.workflow).toBe('new-feature');
      expect(firstEvent.value.description).toBe('Test feature description');
    });
  });
});

describe('Workflow Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-workflow-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Session Persistence', () => {
    it('should persist and restore workflow state', () => {
      const orchestrator1 = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      // Initially no sessions
      expect(orchestrator1.listSessions().length).toBe(0);

      // Create a new orchestrator instance and verify sessions persist
      const orchestrator2 = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      // Should have access to same session directory
      const sessions = orchestrator2.listSessions();
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should find resumable sessions', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      // No resumable session initially
      expect(orchestrator.getResumableSession()).toBeNull();
    });
  });

  describe('Workflow Structure Validation', () => {
    it('should validate new-feature workflow has all required phases', () => {
      const workflow = getWorkflow('new-feature');

      // Required agents in order
      const expectedAgents = ['architect', 'spec', 'test-gen', 'dev', 'qa', 'review', 'docs'];
      const actualAgents = workflow.phases.map(p => p.agent);

      expect(actualAgents).toEqual(expectedAgents);
    });

    it('should have TDD enforcement hook on dev phase', () => {
      const workflow = getWorkflow('new-feature');
      const devPhase = workflow.phases.find(p => p.agent === 'dev');

      expect(devPhase).toBeDefined();
      expect(devPhase?.prePhaseHooks).toContain('tdd-enforcement');
    });

    it('should have validation functions on all phases', () => {
      const workflow = getWorkflow('new-feature');

      for (const phase of workflow.phases) {
        expect(typeof phase.validation).toBe('function');
      }
    });

    it('should have nextPhaseInput on phases that need to pass data', () => {
      const workflow = getWorkflow('new-feature');

      // architect, spec, test-gen, dev, review all pass data to next phase
      const phasesWithOutput = ['architect', 'spec', 'test-gen', 'dev', 'review'];

      for (const agentName of phasesWithOutput) {
        const phase = workflow.phases.find(p => p.agent === agentName);
        expect(phase?.nextPhaseInput).toBeDefined();
      }
    });
  });

  describe('Phase Validation Functions', () => {
    it('should validate architect output correctly', () => {
      const workflow = getWorkflow('new-feature');
      const architectPhase = workflow.phases.find(p => p.agent === 'architect');

      // Approved design should pass
      expect(architectPhase?.validation?.({
        agent: 'architect',
        success: true,
        output: { approved: true },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(true);

      // Rejected design should fail
      expect(architectPhase?.validation?.({
        agent: 'architect',
        success: true,
        output: { approved: false },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(false);
    });

    it('should validate spec output correctly', () => {
      const workflow = getWorkflow('new-feature');
      const specPhase = workflow.phases.find(p => p.agent === 'spec');

      // Valid spec with function specs and test scenarios
      expect(specPhase?.validation?.({
        agent: 'spec',
        success: true,
        output: {
          functionSpecs: [{ name: 'test' }],
          testScenarios: { unit: ['test1'] },
        },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(true);

      // Invalid: empty function specs
      expect(specPhase?.validation?.({
        agent: 'spec',
        success: true,
        output: {
          functionSpecs: [],
          testScenarios: { unit: [] },
        },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(false);
    });

    it('should validate test-gen output correctly', () => {
      const workflow = getWorkflow('new-feature');
      const testGenPhase = workflow.phases.find(p => p.agent === 'test-gen');

      // Valid: tests created and all failing
      expect(testGenPhase?.validation?.({
        agent: 'test-gen',
        success: true,
        output: {
          testsCreated: 5,
          allTestsFailing: true,
        },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(true);

      // Invalid: tests pass (TDD violation)
      expect(testGenPhase?.validation?.({
        agent: 'test-gen',
        success: true,
        output: {
          testsCreated: 5,
          allTestsFailing: false,
        },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(false);

      // Invalid: no tests
      expect(testGenPhase?.validation?.({
        agent: 'test-gen',
        success: true,
        output: {
          testsCreated: 0,
          allTestsFailing: true,
        },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(false);
    });

    it('should validate dev output correctly', () => {
      const workflow = getWorkflow('new-feature');
      const devPhase = workflow.phases.find(p => p.agent === 'dev');

      // Valid: all tests passing
      expect(devPhase?.validation?.({
        agent: 'dev',
        success: true,
        output: { allTestsPassing: true },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(true);

      // Invalid: tests still failing
      expect(devPhase?.validation?.({
        agent: 'dev',
        success: true,
        output: { allTestsPassing: false },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(false);
    });

    it('should validate review output correctly', () => {
      const workflow = getWorkflow('new-feature');
      const reviewPhase = workflow.phases.find(p => p.agent === 'review');

      // Valid: approved
      expect(reviewPhase?.validation?.({
        agent: 'review',
        success: true,
        output: { verdict: 'APPROVED' },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(true);

      // Invalid: rejected
      expect(reviewPhase?.validation?.({
        agent: 'review',
        success: true,
        output: { verdict: 'REJECTED' },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(false);
    });

    it('should validate docs output correctly', () => {
      const workflow = getWorkflow('new-feature');
      const docsPhase = workflow.phases.find(p => p.agent === 'docs');

      // Valid: ABOUTME verified
      expect(docsPhase?.validation?.({
        agent: 'docs',
        success: true,
        output: { aboutMeVerified: true },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(true);

      // Invalid: ABOUTME not verified
      expect(docsPhase?.validation?.({
        agent: 'docs',
        success: true,
        output: { aboutMeVerified: false },
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 1,
      })).toBe(false);
    });
  });

  describe('Tool Integration with Workflows', () => {
    it('should have Read tool for all agents', () => {
      const workflow = getWorkflow('new-feature');

      for (const phase of workflow.phases) {
        const agent = getAgentConfig(phase.agent);
        expect(agent.tools).toContain('Read');
      }
    });

    it('should have Write tool only for agents that create files', () => {
      // test-gen, dev, docs actually create/modify files
      const agentsWithWrite: AgentType[] = ['test-gen', 'dev', 'docs'];
      // architect and review only analyze, spec outputs JSON (doesn't write files directly)
      const agentsWithoutWrite: AgentType[] = ['architect', 'spec', 'review'];

      for (const agentType of agentsWithWrite) {
        const agent = getAgentConfig(agentType);
        expect(agent.tools).toContain('Write');
      }

      for (const agentType of agentsWithoutWrite) {
        const agent = getAgentConfig(agentType);
        expect(agent.tools).not.toContain('Write');
      }
    });

    it('should have Bash tool for agents that run tests', () => {
      const agentsWithBash: AgentType[] = ['test-gen', 'dev'];

      for (const agentType of agentsWithBash) {
        const agent = getAgentConfig(agentType);
        expect(agent.tools).toContain('Bash');
      }
    });
  });

  describe('Orchestrator Configuration', () => {
    it('should apply environment config overrides', () => {
      // Save original env
      const originalBudget = process.env.FEATURE_FACTORY_MAX_BUDGET;
      const originalModel = process.env.FEATURE_FACTORY_MODEL;

      // Set env vars
      process.env.FEATURE_FACTORY_MAX_BUDGET = '15.0';
      process.env.FEATURE_FACTORY_MODEL = 'opus';

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      const config = orchestrator.getConfig();
      expect(config.maxBudgetUsd).toBe(15.0);
      expect(config.defaultModel).toBe('opus');

      // Restore env
      if (originalBudget) {
        process.env.FEATURE_FACTORY_MAX_BUDGET = originalBudget;
      } else {
        delete process.env.FEATURE_FACTORY_MAX_BUDGET;
      }
      if (originalModel) {
        process.env.FEATURE_FACTORY_MODEL = originalModel;
      } else {
        delete process.env.FEATURE_FACTORY_MODEL;
      }
    });

    it('should prefer explicit config over environment', () => {
      process.env.FEATURE_FACTORY_MAX_BUDGET = '15.0';

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        maxBudgetUsd: 8.0, // Explicit override
        twilioMcpEnabled: false,
      });

      expect(orchestrator.getConfig().maxBudgetUsd).toBe(8.0);

      delete process.env.FEATURE_FACTORY_MAX_BUDGET;
    });
  });
});

describe('End-to-End Component Validation', () => {
  it('should have all components properly connected', () => {
    // This test validates the entire component graph is connected

    // 1. Workflows reference valid agents
    const workflow = getWorkflow('new-feature');
    for (const phase of workflow.phases) {
      const agent = getAgentConfig(phase.agent);
      expect(agent).toBeDefined();

      // 2. Agents have valid tools
      const schemas = getToolSchemas(agent.tools);
      expect(schemas.length).toBeGreaterThan(0);
    }

    // 3. Orchestrator can be created
    const orchestrator = new FeatureFactoryOrchestrator();
    expect(orchestrator).toBeDefined();

    // 4. Config is valid
    const config = orchestrator.getConfig();
    expect(config.maxBudgetUsd).toBeGreaterThan(0);
    expect(config.maxTurnsPerAgent).toBeGreaterThan(0);

    // Component graph is valid
    console.log('✓ All Feature Factory components properly connected');
  });

  it('should have matching tool schemas for all agents', () => {
    const agentTypes: AgentType[] = [
      'architect',
      'spec',
      'test-gen',
      'dev',
      'qa',
      'review',
      'docs',
    ];

    const toolCoverage: Record<string, string[]> = {};

    for (const agentType of agentTypes) {
      const config = getAgentConfig(agentType);
      const schemas = getToolSchemas(config.tools);

      // Every tool in config should have a schema
      for (const tool of config.tools) {
        const hasSchema =
          schemas.some((s) => s.name === tool) || isMcpTool(tool);
        if (!hasSchema) {
          console.error(`Missing schema for tool: ${tool} in agent: ${agentType}`);
        }
        expect(hasSchema).toBe(true);
      }

      toolCoverage[agentType] = config.tools;
    }

    console.log('✓ All agent tools have valid schemas');
    console.log('Tool coverage by agent:');
    for (const [agent, tools] of Object.entries(toolCoverage)) {
      console.log(`  ${agent}: ${tools.join(', ')}`);
    }
  });
});
