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
  PhaseRetryEvent,
  CheckpointCreatedEvent,
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

// Mock the checkpoints module to avoid needing a real git repo
let mockCreateCheckpoint: jest.Mock;
let mockCleanupCheckpoints: jest.Mock;

jest.unstable_mockModule('../src/checkpoints.js', () => {
  mockCreateCheckpoint = jest.fn().mockReturnValue({
    success: true,
    tagName: 'ff-checkpoint/test-session/pre-0-design-review',
    commitHash: 'abc1234def5678',
  });
  mockCleanupCheckpoints = jest.fn().mockReturnValue({ deleted: [] });
  return {
    createCheckpoint: mockCreateCheckpoint,
    rollbackToCheckpoint: jest.fn().mockReturnValue({ success: true }),
    cleanupCheckpoints: mockCleanupCheckpoints,
    listCheckpoints: jest.fn().mockReturnValue([]),
    sanitizePhaseSlug: jest.fn((name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')),
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
    mockCreateCheckpoint.mockReset();
    mockCreateCheckpoint.mockReturnValue({
      success: true,
      tagName: 'ff-checkpoint/test-session/pre-0-design-review',
      commitHash: 'abc1234def5678',
    });
    mockCleanupCheckpoints.mockReset();
    mockCleanupCheckpoints.mockReturnValue({ deleted: [] });

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
      expect(config.maxTurnsPerAgent).toBe(200);
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
        maxRetriesPerPhase: 0,
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
        maxRetriesPerPhase: 0,
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
        maxRetriesPerPhase: 0,
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
        maxRetriesPerPhase: 0,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test')) {
        events.push(event);
      }

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
    });
  });

  describe('Phase Retry', () => {
    it('should retry on agent failure and complete workflow', async () => {
      // Architect fails first attempt, succeeds second, then rest of workflow completes
      mockCreate
        .mockRejectedValueOnce(new Error('Transient API error'))  // architect attempt 0
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))  // architect attempt 1 (retry)
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
        maxRetriesPerPhase: 1,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test retry')) {
        events.push(event);
      }

      const retryEvent = events.find(e => e.type === 'phase-retry');
      expect(retryEvent).toBeDefined();

      const completedEvent = events.find(e => e.type === 'workflow-completed') as WorkflowCompletedEvent;
      expect(completedEvent).toBeDefined();
      expect(completedEvent.success).toBe(true);
    });

    it('should retry on validation failure and complete workflow', async () => {
      // Architect validation fails first (approved: false), then passes
      mockCreate
        .mockResolvedValueOnce(createMockResponse({ approved: false }))  // architect attempt 0
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))  // architect attempt 1 (retry)
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
        maxRetriesPerPhase: 1,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test validation retry')) {
        events.push(event);
      }

      const retryEvent = events.find(e => e.type === 'phase-retry');
      expect(retryEvent).toBeDefined();

      const completedEvent = events.find(e => e.type === 'workflow-completed') as WorkflowCompletedEvent;
      expect(completedEvent).toBeDefined();
      expect(completedEvent.success).toBe(true);
    });

    it('should fail after exhausting retries', async () => {
      // Always return invalid output — fails validation on every attempt
      mockCreate.mockResolvedValue(createMockResponse({ approved: false }));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxRetriesPerPhase: 2,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test exhaustion')) {
        events.push(event);
      }

      const retryEvents = events.filter(e => e.type === 'phase-retry');
      expect(retryEvents.length).toBe(2); // 2 retries after initial attempt

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();

      expect(orchestrator.getState()?.status).toBe('failed');
    });

    it('should not retry when maxRetriesPerPhase is 0', async () => {
      mockCreate.mockResolvedValue(createMockResponse({ approved: false }));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxRetriesPerPhase: 0,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'No retry')) {
        events.push(event);
      }

      const retryEvents = events.filter(e => e.type === 'phase-retry');
      expect(retryEvents.length).toBe(0);

      const errorEvent = events.find(e => e.type === 'workflow-error') as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
    });

    it('should use per-phase maxRetries override over global config', async () => {
      // The new-feature dev phase has maxRetries: 2
      // Set global to 0, but dev phase override should take effect
      // Architect, spec, test-gen succeed first try
      // Dev fails validation (allTestsPassing: false) on first two attempts, then succeeds
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse({ allTestsPassing: false }))  // dev attempt 0
        .mockResolvedValueOnce(createMockResponse({ allTestsPassing: false }))  // dev retry 1
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))            // dev retry 2
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxRetriesPerPhase: 0, // Global: no retries
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Per-phase override')) {
        events.push(event);
      }

      // Dev phase has maxRetries: 2 override in new-feature workflow
      const retryEvents = events.filter(e => e.type === 'phase-retry');
      expect(retryEvents.length).toBe(2); // 2 retries for dev

      const completedEvent = events.find(e => e.type === 'workflow-completed') as WorkflowCompletedEvent;
      expect(completedEvent).toBeDefined();
      expect(completedEvent.success).toBe(true);
    });

    it('should accumulate files across retries', async () => {
      // Architect fails first (API error creating file), then succeeds
      mockCreate
        .mockResolvedValueOnce({
          content: [
            { type: 'tool_use', id: 'tool_1', name: 'Write', input: { file_path: '/tmp/file1.ts', content: 'test' } },
          ],
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 50 },
        })
        .mockResolvedValueOnce(createMockResponse({ approved: false })) // validation fails → retry
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))  // retry succeeds
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
        maxRetriesPerPhase: 1,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Accumulate files')) {
        events.push(event);
      }

      // The accumulated result should include cost from both attempts
      const state = orchestrator.getState();
      expect(state?.phaseResults['architect']).toBeDefined();
      expect(state?.phaseResults['architect'].costUsd).toBeGreaterThan(0);
    });

    it('should accumulate cost across retries', async () => {
      // Architect fails first try (high tokens), succeeds second
      mockCreate
        .mockRejectedValueOnce(new Error('API transient'))
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT, { input: 5000, output: 2000 }))
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
        maxRetriesPerPhase: 1,
        maxBudgetUsd: 1000,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Cost accumulation')) {
        events.push(event);
      }

      const costUpdates = events.filter(e => e.type === 'cost-update') as CostUpdateEvent[];
      expect(costUpdates.length).toBeGreaterThan(0);

      // Total cost should be positive
      const completedEvent = events.find(e => e.type === 'workflow-completed') as WorkflowCompletedEvent;
      expect(completedEvent).toBeDefined();
      expect(completedEvent.totalCostUsd).toBeGreaterThan(0);
    });

    it('should include retry feedback in agent context', async () => {
      // Architect validation fails first, succeeds second
      mockCreate
        .mockResolvedValueOnce(createMockResponse({ approved: false }))  // fails validation
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))  // retry succeeds
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
        maxRetriesPerPhase: 1,
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Retry feedback')) {}

      // The second API call (retry) should have retry feedback in the prompt
      expect(mockCreate).toHaveBeenCalledTimes(8); // 2 for architect + 6 for rest
      const retryCall = mockCreate.mock.calls[1]; // Second call is the retry
      const messages = retryCall[0].messages;
      const userMessage = messages[0].content;
      expect(userMessage).toContain('PHASE RETRY');
      expect(userMessage).toContain('Do NOT start over');
    });

    it('should re-run pre-phase hooks on retry', async () => {
      const mockExecuteHook = executeHook as jest.Mock;

      // Dev phase has TDD enforcement hook
      // First: architect, spec, test-gen all succeed
      // Dev phase: hook passes (both times), agent fails first try, succeeds on retry
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_SPEC_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_TEST_GEN_OUTPUT))
        .mockResolvedValueOnce(createMockResponse({ allTestsPassing: false }))  // dev fails validation
        .mockResolvedValueOnce(createMockResponse(VALID_DEV_OUTPUT))            // dev retry succeeds
        .mockResolvedValueOnce(createMockResponse(VALID_QA_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_REVIEW_OUTPUT))
        .mockResolvedValueOnce(createMockResponse(VALID_DOCS_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxRetriesPerPhase: 1,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Hook re-run')) {
        events.push(event);
      }

      // Hook should be called multiple times: once for initial dev attempt, once for retry,
      // plus coverage-threshold for QA phase
      const hookEvents = events.filter(e => e.type === 'pre-phase-hook') as PrePhaseHookEvent[];
      const tddHooks = hookEvents.filter(e => e.hook === 'tdd-enforcement');
      expect(tddHooks.length).toBe(2); // Once for initial + once for retry
    });

    it('should not retry on budget exceeded', async () => {
      // First phase uses lots of tokens, exhausting budget
      mockCreate
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT, { input: 500000, output: 200000 }));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxBudgetUsd: 0.01, // Very low
        maxRetriesPerPhase: 2,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Budget exceeded')) {
        events.push(event);
      }

      const retryEvents = events.filter(e => e.type === 'phase-retry');
      expect(retryEvents.length).toBe(0);

      const errorEvent = events.find(e =>
        e.type === 'workflow-error' && (e as WorkflowErrorEvent).error?.includes('Budget')
      ) as WorkflowErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(errorEvent.recoverable).toBe(false);
    });

    it('should emit phase-retry event with correct fields', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse({ approved: false }))  // fails validation
        .mockResolvedValueOnce(createMockResponse({ approved: false }))  // still fails
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT));  // succeeds

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'none',
        maxRetriesPerPhase: 2,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Retry events')) {
        events.push(event);
        // Stop after getting retry events — we only care about architect phase
        if (events.filter(e => e.type === 'phase-completed').length >= 1) break;
      }

      const retryEvents = events.filter(e => e.type === 'phase-retry') as Array<WorkflowEvent & { type: 'phase-retry'; phase: string; agent: string; attempt: number; maxRetries: number; reason: string }>;
      expect(retryEvents.length).toBe(2);

      expect(retryEvents[0].phase).toBe('Design Review');
      expect(retryEvents[0].agent).toBe('architect');
      expect(retryEvents[0].attempt).toBe(1);
      expect(retryEvents[0].maxRetries).toBe(2);
      expect(retryEvents[0].reason).toContain('Validation failed');

      expect(retryEvents[1].attempt).toBe(2);
    });

    it('should set retryAttempts on final result', async () => {
      mockCreate
        .mockResolvedValueOnce(createMockResponse({ approved: false }))  // fails validation
        .mockResolvedValueOnce(createMockResponse(VALID_ARCHITECT_OUTPUT))  // retry succeeds
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
        maxRetriesPerPhase: 1,
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Retry attempts field')) {}

      const state = orchestrator.getState();
      expect(state?.phaseResults['architect'].retryAttempts).toBe(1);
      // Phases that succeed first try should have retryAttempts: 0
      expect(state?.phaseResults['spec'].retryAttempts).toBe(0);
    });
  });

  describe('Phase Retry Config', () => {
    it('should default maxRetriesPerPhase to 1', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      expect(orchestrator.getConfig().maxRetriesPerPhase).toBe(1);
    });

    it('should elevate maxRetriesPerPhase to 2 in autonomous mode', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'environment',
          acknowledgedAt: new Date(),
        },
      });

      expect(orchestrator.getConfig().maxRetriesPerPhase).toBe(2);
    });

    it('should validate maxRetriesPerPhase >= 0', () => {
      expect(() => new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        maxRetriesPerPhase: -1,
      })).toThrow('maxRetriesPerPhase must be >= 0');
    });
  });

  describe('Git Checkpoints', () => {
    it('should create checkpoint before phase execution', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test checkpoints')) {}

      // createCheckpoint should have been called at least once (for the architect phase)
      expect(mockCreateCheckpoint).toHaveBeenCalled();
      const firstCall = mockCreateCheckpoint.mock.calls[0][0];
      expect(firstCall.sessionId).toBeTruthy();
      expect(firstCall.phaseIndex).toBe(0);
    });

    it('should emit checkpoint-created event', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'Test events')) {
        events.push(event);
      }

      const checkpointEvents = events.filter(e => e.type === 'checkpoint-created') as CheckpointCreatedEvent[];
      expect(checkpointEvents.length).toBeGreaterThan(0);
      expect(checkpointEvents[0].tagName).toBeTruthy();
      expect(checkpointEvents[0].commitHash).toBeTruthy();
      expect(checkpointEvents[0].phase).toBe('Design Review');
      expect(checkpointEvents[0].agent).toBe('architect');
    });

    it('should clean up checkpoints on workflow completion', async () => {
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

      for await (const _event of orchestrator.runWorkflow('new-feature', 'Test cleanup')) {}

      // cleanupCheckpoints should have been called on completion
      expect(mockCleanupCheckpoints).toHaveBeenCalled();
    });

    it('should skip checkpoints when gitCheckpoints is false', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
        gitCheckpoints: false,
      });

      const events: WorkflowEvent[] = [];
      for await (const event of orchestrator.runWorkflow('new-feature', 'No checkpoints')) {
        events.push(event);
      }

      expect(mockCreateCheckpoint).not.toHaveBeenCalled();
      const checkpointEvents = events.filter(e => e.type === 'checkpoint-created');
      expect(checkpointEvents.length).toBe(0);
    });

    it('should store checkpoint in state.checkpoints', async () => {
      mockCreate.mockResolvedValue(createMockResponse(VALID_ARCHITECT_OUTPUT));

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
        approvalMode: 'after-each-phase',
      });

      for await (const _event of orchestrator.runWorkflow('new-feature', 'State checkpoints')) {}

      const state = orchestrator.getState();
      expect(state?.checkpoints).toBeDefined();
      expect(state?.checkpoints?.architect).toBe('ff-checkpoint/test-session/pre-0-design-review');
    });

    it('should default gitCheckpoints to true', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tempDir,
        twilioMcpEnabled: false,
      });

      expect(orchestrator.getConfig().gitCheckpoints).toBe(true);
    });
  });

  describe('Learnings Context Injection', () => {
    function getPromptFromCall(callIndex: number): string {
      return (mockCreate.mock.calls[callIndex][0].messages[0].content as string);
    }

    it('should inject learnings from .claude/learnings.md into prompt', async () => {
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'learnings.md'),
        '## Session 2025-06-15\n- Webhook timeouts need 30s config\n- Use console.log not console.error'
      );

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

      const prompt = getPromptFromCall(0);
      expect(prompt).toContain('# Prior Learnings');
      expect(prompt).toContain('Webhook timeouts need 30s config');
    });

    it('should prefer .meta/ learnings over .claude/ learnings', async () => {
      fs.mkdirSync(path.join(tempDir, '.meta'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, '.meta', 'learnings.md'),
        '- Meta learning: always check response codes'
      );
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'learnings.md'),
        '- Claude learning: should not appear'
      );

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

      const prompt = getPromptFromCall(0);
      expect(prompt).toContain('Meta learning');
      expect(prompt).not.toContain('should not appear');
    });

    it('should inject unresolved patterns from pattern-db.json and exclude resolved ones', async () => {
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'pattern-db.json'),
        JSON.stringify({
          patterns: {
            'webhook-timeout': {
              patternId: 'webhook-timeout',
              summary: 'Webhook calls timing out after 15s',
              occurrenceCount: 3,
              resolved: false,
            },
            'twiml-parse-error': {
              patternId: 'twiml-parse-error',
              summary: 'TwiML XML not properly closed',
              occurrenceCount: 1,
              resolved: true,
            },
          },
        })
      );

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

      const prompt = getPromptFromCall(0);
      expect(prompt).toContain('## Known Failure Patterns');
      expect(prompt).toContain('webhook-timeout');
      expect(prompt).toContain('seen 3x');
      expect(prompt).not.toContain('twiml-parse-error');
    });

    it('should truncate learnings > 2000 chars preserving tail', async () => {
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'learnings.md'),
        'OLD_START\n' + 'x'.repeat(2500) + '\nRECENT_END\n'
      );

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

      const prompt = getPromptFromCall(0);
      expect(prompt).toContain('RECENT_END');
      expect(prompt).toContain('...\n');
      expect(prompt).not.toContain('OLD_START');
    });

    it('should inject max 10 patterns when more than 10 exist', async () => {
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      const patterns: Record<string, unknown> = {};
      for (let i = 0; i < 15; i++) {
        patterns[`pattern-${i}`] = {
          patternId: `pattern-${i}`,
          summary: `Summary for pattern ${i}`,
          occurrenceCount: 1,
          resolved: false,
        };
      }
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'pattern-db.json'),
        JSON.stringify({ patterns })
      );

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

      const prompt = getPromptFromCall(0);
      const patternMatches = prompt.match(/- \*\*pattern-/g);
      expect(patternMatches).not.toBeNull();
      expect(patternMatches!.length).toBe(10);
    });

    it('should not crash when learnings and pattern files are missing', async () => {
      // Don't create any learnings or pattern files — tempDir is empty

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

      const completedEvent = events.find(e => e.type === 'workflow-completed');
      expect(completedEvent).toBeDefined();
    });

    it('should not crash when pattern-db.json contains invalid JSON', async () => {
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'pattern-db.json'),
        '{invalid json!!!}'
      );

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

      const completedEvent = events.find(e => e.type === 'workflow-completed');
      expect(completedEvent).toBeDefined();
    });

    it('should inject same learnings into all phase prompts', async () => {
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(tempDir, '.claude', 'learnings.md'),
        '- Learnings marker string XYZ123'
      );

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

      // All 7 phases should have the learnings marker in their prompt
      expect(mockCreate.mock.calls.length).toBe(7);
      for (let i = 0; i < 7; i++) {
        const prompt = mockCreate.mock.calls[i][0].messages[0].content as string;
        expect(prompt).toContain('XYZ123');
      }
    });
  });
});
