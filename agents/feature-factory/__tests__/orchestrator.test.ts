// ABOUTME: Unit tests for Feature Factory orchestrator.
// ABOUTME: Tests workflow execution, agent coordination, budget, approvals, and session management.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  WorkflowEvent,
  WorkflowStartedEvent,
  PhaseStartedEvent,
  ApprovalRequestedEvent,
  ApprovalReceivedEvent,
  WorkflowCompletedEvent,
  WorkflowErrorEvent,
  CostUpdateEvent,
  PrePhaseHookEvent,
} from '../src/types.js';

// Mock create function that will be shared across tests
let mockCreate: jest.Mock;

// Mock Anthropic SDK before importing orchestrator
jest.unstable_mockModule('@anthropic-ai/sdk', () => {
  mockCreate = jest.fn();
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

// Mock the hooks module to avoid running actual npm test
jest.unstable_mockModule('../src/hooks/index.js', () => {
  return {
    executeHook: jest.fn().mockResolvedValue({
      passed: true,
      data: { totalTests: 5, failingTests: 5, passingTests: 0 },
    }),
    getHook: jest.fn(),
    listHooks: jest.fn().mockReturnValue([]),
    hasHook: jest.fn().mockReturnValue(true),
    tddEnforcementHook: {
      name: 'tdd-enforcement',
      description: 'Mock TDD enforcement',
      execute: jest.fn().mockResolvedValue({ passed: true }),
    },
    validateCredentials: jest.fn().mockReturnValue({ passed: true }),
    shouldSkipValidation: jest.fn().mockReturnValue(false),
  };
});

// Import after mocking
const { FeatureFactoryOrchestrator } = await import('../src/orchestrator.js');
const { executeHook } = await import('../src/hooks/index.js');

// Helper to create mock API response
function createMockResponse(output: Record<string, unknown>, tokens = { input: 100, output: 50 }) {
  return {
    content: [{ type: 'text', text: JSON.stringify(output) }],
    stop_reason: 'end_turn',
    usage: { input_tokens: tokens.input, output_tokens: tokens.output },
  };
}

// Responses that pass each phase's validation
const VALID_ARCHITECT_OUTPUT = {
  approved: true,
  designNotes: 'Test design',
  suggestedPattern: 'webhook',
  twilioServices: ['messaging'],
  filesToCreate: ['test.ts'],
  filesToModify: [],
  claudeMdUpdates: [],
};

const VALID_SPEC_OUTPUT = {
  functionSpecs: [{ name: 'handleSms', description: 'Handle SMS' }],
  testScenarios: { unit: ['test1'], integration: ['test2'] },
};

const VALID_TEST_GEN_OUTPUT = {
  testsCreated: 5,
  allTestsFailing: true,
  testFiles: ['__tests__/test.ts'],
};

const VALID_DEV_OUTPUT = {
  allTestsPassing: true,
  testRunOutput: 'All tests passed',
};

const VALID_QA_OUTPUT = {
  testsRun: 10,
  testsPassed: 10,
  testsFailed: 0,
  testOutput: 'All tests passed',
  coveragePercent: 85,
  coverageGaps: [],
  coverageMeetsThreshold: true,
  securityIssues: [],
  twimlIssues: [],
  deepValidationResults: [],
  verdict: 'PASSED',
  summary: 'All quality checks passed',
  recommendations: [],
};

const VALID_REVIEW_OUTPUT = {
  verdict: 'APPROVED',
  summary: 'Code looks good',
  issues: [],
};

const VALID_DOCS_OUTPUT = {
  aboutMeVerified: true,
  filesUpdated: ['README.md'],
};

describe('FeatureFactoryOrchestrator', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for session tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-orchestrator-test-'));

    // Reset mocks
    jest.clearAllMocks();
    mockCreate.mockReset();

    // Reset executeHook mock to default passing behavior
    const mockExecuteHook = executeHook as jest.Mock;
    mockExecuteHook.mockReset();
    mockExecuteHook.mockResolvedValue({
      passed: true,
      data: { totalTests: 5, failingTests: 5, passingTests: 0 },
    });
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Constructor', () => {
    it('should create orchestrator with default config', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      const config = orchestrator.getConfig();
      expect(config.maxBudgetUsd).toBe(5.0);
      expect(config.maxTurnsPerAgent).toBe(50);
      expect(config.defaultModel).toBe('sonnet');
      expect(config.approvalMode).toBe('after-each-phase');
    });

    it('should accept custom config options', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        maxBudgetUsd: 10.0,
        maxTurnsPerAgent: 100,
        defaultModel: 'opus',
        approvalMode: 'none',
        twilioMcpEnabled: false,
      });

      const config = orchestrator.getConfig();
      expect(config.maxBudgetUsd).toBe(10.0);
      expect(config.maxTurnsPerAgent).toBe(100);
      expect(config.defaultModel).toBe('opus');
      expect(config.approvalMode).toBe('none');
    });

    it('should throw on invalid config', () => {
      expect(() => new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        maxBudgetUsd: -1,
        twilioMcpEnabled: false,
      })).toThrow('maxBudgetUsd must be greater than 0');
    });

    it('should start with no workflow state', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      expect(orchestrator.getState()).toBeNull();
    });
  });

  describe('runWorkflow', () => {
    it('should emit workflow-started event', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
        // Stop after first event to just check workflow-started
        if (events.length >= 1) break;
      }

      expect(events[0].type).toBe('workflow-started');
      const startEvent = events[0] as WorkflowStartedEvent;
      expect(startEvent.workflow).toBe('new-feature');
      expect(startEvent.description).toBe('Test feature');
      expect(startEvent.totalPhases).toBe(7); // architect, spec, test-gen, dev, qa, review, docs
    });

    it('should emit phase-started and phase-completed events', async () => {
      // Set up mock to return valid responses for all phases
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
      }

      const phaseStarted = events.filter(e => e.type === 'phase-started');
      const phaseCompleted = events.filter(e => e.type === 'phase-completed');

      expect(phaseStarted.length).toBeGreaterThan(0);
      expect(phaseCompleted.length).toBeGreaterThan(0);

      // First phase-started should be architect
      const firstStart = phaseStarted[0] as PhaseStartedEvent;
      expect(firstStart.agent).toBe('architect');
      expect(firstStart.phaseIndex).toBe(0);
    });

    it('should emit cost-update events after each phase', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT, { input: 1000, output: 500 }))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
      }

      const costUpdates = events.filter(e => e.type === 'cost-update') as CostUpdateEvent[];
      expect(costUpdates.length).toBeGreaterThan(0);

      // Each cost update should have currentCostUsd and budgetRemainingUsd
      for (const update of costUpdates) {
        expect(update.currentCostUsd).toBeGreaterThanOrEqual(0);
        expect(update.budgetRemainingUsd).toBeLessThanOrEqual(5.0);
      }
    });

    it('should complete workflow with workflow-completed event', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
      }

      const completedEvent = events.find(e => e.type === 'workflow-completed') as WorkflowCompletedEvent;
      expect(completedEvent).toBeDefined();
      expect(completedEvent.workflow).toBe('new-feature');
      expect(completedEvent.success).toBe(true);
      expect(completedEvent.totalCostUsd).toBeGreaterThanOrEqual(0);
      expect(completedEvent.totalTurns).toBeGreaterThan(0);
    });

    it('should use provided sessionId', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const customSessionId = 'custom-session-123';
      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test', { sessionId: customSessionId })) {
        break; // Just check first event
      }

      const state = orchestrator.getState();
      expect(state?.sessionId).toBe(customSessionId);
    });
  });

  describe('Budget Enforcement', () => {
    it('should stop workflow when budget is exceeded', async () => {
      // First phase succeeds but uses lots of tokens, then second phase triggers budget check
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT, { input: 500000, output: 200000 }))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT, { input: 500000, output: 200000 }));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxBudgetUsd: 0.01, // Very low budget - will be exceeded after first phase
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
      }

      // Should have an error event about budget
      const errorEvent = events.find(e =>
        e.type === 'workflow-error' && (e as WorkflowErrorEvent).error?.includes('Budget')
      ) as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('Budget exceeded');

      // State should be failed
      const state = orchestrator.getState();
      expect(state?.status).toBe('failed');
    });
  });

  describe('Approval Modes', () => {
    it('should request approval in after-each-phase mode', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
      }

      // Should have approval-requested event after architect phase (which has approvalRequired: true)
      const approvalEvent = events.find(e => e.type === 'approval-requested') as ApprovalRequestedEvent;
      expect(approvalEvent).toBeDefined();
      expect(approvalEvent.phase).toBe('Design Review');

      // State should be awaiting-approval
      const state = orchestrator.getState();
      expect(state?.status).toBe('awaiting-approval');
    });

    it('should not request approval in none mode', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
      }

      const approvalEvents = events.filter(e => e.type === 'approval-requested');
      expect(approvalEvents.length).toBe(0);

      // Should complete without waiting for approval
      const completedEvent = events.find(e => e.type === 'workflow-completed');
      expect(completedEvent).toBeDefined();
    });
  });

  describe('continueWorkflow', () => {
    it('should continue after approval', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      // Start workflow (will stop at first approval)
      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        // Collect all events until it stops
      }

      expect(orchestrator.getState()?.status).toBe('awaiting-approval');

      // Continue with approval
      const continueEvents: WorkflowEvent[] = [];
      for await (const event of orchestrator.continueWorkflow(true)) {
        continueEvents.push(event);
      }

      // Should have approval-received event
      const approvalReceived = continueEvents.find(e => e.type === 'approval-received') as ApprovalReceivedEvent;
      expect(approvalReceived).toBeDefined();
      expect(approvalReceived.approved).toBe(true);
    });

    it('should cancel workflow when approval denied', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      // Start workflow
      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        // Run until approval requested
      }

      // Deny approval
      const continueEvents: WorkflowEvent[] = [];
      for await (const event of orchestrator.continueWorkflow(false, 'Need changes')) {
        continueEvents.push(event);
      }

      // Should have error event with denial reason
      const errorEvent = continueEvents.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toBe('Need changes');

      // State should be cancelled
      const state = orchestrator.getState();
      expect(state?.status).toBe('cancelled');
    });

    it('should throw when no workflow in progress', async () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      await expect(async () => {
        for await (const _event of orchestrator.continueWorkflow(true)) {
          // Should throw before yielding
        }
      }).rejects.toThrow('No workflow in progress');
    });

    it('should throw when not awaiting approval', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      // Complete workflow
      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test')) {
        // Run to completion
      }

      await expect(async () => {
        for await (const _event of orchestrator.continueWorkflow(true)) {
          // Should throw
        }
      }).rejects.toThrow('Workflow is not awaiting approval');
    });
  });

  describe('Agent Execution', () => {
    it('should handle tool use in agent loop', async () => {
      // First call: agent wants to use a tool
      mockCreate
        .mockResolvedValueOnce({
          content: [
            { type: 'text', text: 'Let me check the files' },
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'Glob',
              input: { pattern: '*.ts' },
            },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        // Second call: agent completes after seeing tool result
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        // Remaining phases
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
      }

      // Should have called API multiple times (tool use + completions)
      expect(mockCreate).toHaveBeenCalled();

      // Workflow should complete successfully
      const completedEvent = events.find(e => e.type === 'workflow-completed');
      expect(completedEvent).toBeDefined();
    });

    it('should fail agent when max turns exceeded', async () => {
      // Always return tool use to simulate infinite loop
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'tool_use',
            id: 'tool_loop',
            name: 'Glob',
            input: { pattern: '*.ts' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxTurnsPerAgent: 3, // Very low for testing
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test feature')) {
        events.push(event);
      }

      // Should have error about max turns
      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('Max turns');
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate costs correctly for sonnet model', async () => {
      // 1M input tokens + 1M output tokens for sonnet:
      // Input: $3.00, Output: $15.00 = $18.00
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT, { input: 1000000, output: 1000000 }))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxBudgetUsd: 1000, // High budget to not trigger limit
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      const costUpdates = events.filter(e => e.type === 'cost-update') as CostUpdateEvent[];
      // First phase cost should be $18.00
      expect(costUpdates[0].currentCostUsd).toBeCloseTo(18.0, 1);
    });

    it('should calculate costs correctly for haiku model', async () => {
      // 1M input + 1M output for haiku:
      // Input: $0.25, Output: $1.25 = $1.50
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT, { input: 1000000, output: 1000000 }))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        defaultModel: 'haiku',
        maxBudgetUsd: 1000,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      const costUpdates = events.filter(e => e.type === 'cost-update') as CostUpdateEvent[];
      expect(costUpdates[0].currentCostUsd).toBeCloseTo(1.5, 1);
    });
  });

  describe('Session Management', () => {
    it('should persist session after each phase', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test')) {
        // Run until approval
      }

      // Should have session file
      const sessions = orchestrator.listSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].workflow).toBe('new-feature');
      expect(sessions[0].description).toBe('Test');
      expect(sessions[0].status).toBe('awaiting-approval');
    });

    it('should list sessions correctly', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      // Run two workflows
      for await (const _event of orchestrator.runWorkflow('new-feature', 'First')) {}
      for await (const _event of orchestrator.runWorkflow('new-feature', 'Second')) {}

      const sessions = orchestrator.listSessions();
      expect(sessions.length).toBe(2);
    });

    it('should load specific session', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test')) {}

      const sessions = orchestrator.listSessions();
      const loaded = orchestrator.loadSession(sessions[0].sessionId);

      expect(loaded).not.toBeNull();
      expect(loaded!.state.description).toBe('Test');
    });

    it('should get resumable session', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Resumable')) {}

      const resumable = orchestrator.getResumableSession();
      expect(resumable).not.toBeNull();
      expect(resumable!.state.status).toBe('awaiting-approval');
    });
  });

  describe('resumeWorkflow', () => {
    it('should resume workflow from session', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      // Start workflow
      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test')) {}

      const sessions = orchestrator.listSessions();
      const sessionId = sessions[0].sessionId;

      // Create new orchestrator and resume
      const resumeOrchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      const resumeEvents: WorkflowEvent[] = [];
      for await (const event of resumeOrchestrator.resumeWorkflow(sessionId)) {
        resumeEvents.push(event);
      }

      // Should have workflow-resumed event
      const resumedEvent = resumeEvents.find(e => e.type === 'workflow-resumed');
      expect(resumedEvent).toBeDefined();
    });

    it('should error for non-existent session', async () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.resumeWorkflow('non-existent-id')) {
        events.push(event);
      }

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('not found');
    });

    it('should error for non-resumable session', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none', // Will complete without approval
      });

      // Complete workflow
      for await (const _event of orchestrator.runWorkflow('new-feature', 'Completed')) {}

      const sessions = orchestrator.listSessions();
      const sessionId = sessions[0].sessionId;

      // Try to resume completed session
      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.resumeWorkflow(sessionId)) {
        events.push(event);
      }

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('cannot be resumed');
    });
  });

  describe('Pre-Phase Hooks', () => {
    it('should emit pre-phase-hook events', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      // Dev phase should have TDD enforcement hook
      const hookEvents = events.filter(e => e.type === 'pre-phase-hook') as PrePhaseHookEvent[];

      // There should be a TDD enforcement hook event
      const tddHook = hookEvents.find(e => e.hook === 'tdd-enforcement');
      expect(tddHook).toBeDefined();
    });

    it('should stop workflow when pre-phase hook fails', async () => {
      // Mock hook to fail on TDD enforcement
      const mockExecuteHook = executeHook as jest.Mock;
      mockExecuteHook.mockResolvedValue({
        passed: false,
        error: 'TDD VIOLATION: No tests found',
      });

      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      // Should have TDD hook failure event
      const hookEvent = events.find(e => e.type === 'pre-phase-hook') as PrePhaseHookEvent;
      expect(hookEvent).toBeDefined();
      expect(hookEvent.result.passed).toBe(false);

      // Should have workflow error
      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('TDD VIOLATION');

      // Reset mock for other tests
      mockExecuteHook.mockResolvedValue({ passed: true, data: {} });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limited'));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('API rate limited');
    });

    it('should mark state as failed on error', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test')) {}

      const state = orchestrator.getState();
      expect(state?.status).toBe('failed');
      expect(state?.error).toContain('Network error');
    });
  });

  describe('getState and getConfig', () => {
    it('should update state during workflow', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      let stateChecked = false;
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        if (event.type === 'phase-started' && !stateChecked) {
          const state = orchestrator.getState();
          expect(state).not.toBeNull();
          expect(state?.status).toBe('running');
          expect(state?.workflow).toBe('new-feature');
          stateChecked = true;
        }
      }

      expect(stateChecked).toBe(true);
    });

    it('should track phase results in state', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test')) {}

      const state = orchestrator.getState();
      expect(state?.phaseResults).toBeDefined();
      expect(Object.keys(state?.phaseResults || {}).length).toBeGreaterThan(0);
    });
  });

  describe('Phase Validation', () => {
    it('should fail when architect does not approve', async () => {
      mockCreate.mockResolvedValue(createMockResponse({ approved: false }));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('validation');
    });

    it('should fail when spec has no function specs', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse({ functionSpecs: [], testScenarios: {} }));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('validation');
    });

    it('should fail when tests pass before dev phase', async () => {
      // tests already passing (TDD violation)
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse({ testsCreated: 5, allTestsFailing: false, testFiles: ['test.ts'] }));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
    });
  });
});
