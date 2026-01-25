// ABOUTME: Unit tests for Feature Factory hooks infrastructure.
// ABOUTME: Tests TDD enforcement hook and hook execution system.

import { describe, it, expect, jest } from '@jest/globals';
import {
  executeHook,
  getHook,
  listHooks,
  hasHook,
  tddEnforcementHook,
} from '../src/hooks/index.js';
import {
  createTddEnforcementHook,
  type TestRunResult,
  type TestRunner,
} from '../src/hooks/tdd-enforcement.js';
import type { HookContext, WorkflowState, AgentResult } from '../src/types.js';

/**
 * Create a mock HookContext for testing
 */
function createMockContext(overrides: Partial<HookContext> = {}): HookContext {
  const baseState: WorkflowState = {
    sessionId: 'test-session',
    workflow: 'new-feature',
    description: 'Test feature',
    currentPhaseIndex: 3, // dev phase
    status: 'running',
    phaseResults: {},
    totalCostUsd: 0.5,
    totalTurns: 20,
    startedAt: new Date(),
  };

  return {
    workingDirectory: '/test/project',
    previousPhaseResults: {},
    workflowState: baseState,
    verbose: false,
    ...overrides,
  };
}

/**
 * Create a successful test-gen phase result
 */
function createTestGenResult(testsCreated: number = 5, success: boolean = true): AgentResult {
  return {
    agent: 'test-gen',
    success,
    output: {
      testsCreated,
      testFiles: ['__tests__/feature.test.ts'],
      allTestsFailing: true,
    },
    filesCreated: ['__tests__/feature.test.ts'],
    filesModified: [],
    commits: [],
    costUsd: 0.1,
    turnsUsed: 5,
  };
}

/**
 * Create a mock test runner for testing
 */
function createMockTestRunner(result: TestRunResult): TestRunner {
  return async (_workingDirectory: string) => result;
}

describe('Hook Infrastructure', () => {
  describe('getHook', () => {
    it('should return tdd-enforcement hook', () => {
      const hook = getHook('tdd-enforcement');
      expect(hook).toBeDefined();
      expect(hook?.name).toBe('tdd-enforcement');
    });

    it('should return undefined for unknown hook', () => {
      // @ts-expect-error - Testing invalid hook type
      const hook = getHook('unknown-hook');
      expect(hook).toBeUndefined();
    });
  });

  describe('listHooks', () => {
    it('should list all available hooks', () => {
      const hooks = listHooks();
      expect(hooks.length).toBeGreaterThan(0);
      expect(hooks.some(h => h.name === 'tdd-enforcement')).toBe(true);
    });
  });

  describe('hasHook', () => {
    it('should return true for existing hook', () => {
      expect(hasHook('tdd-enforcement')).toBe(true);
    });

    it('should return false for unknown hook', () => {
      // @ts-expect-error - Testing invalid hook type
      expect(hasHook('unknown-hook')).toBe(false);
    });
  });

  describe('executeHook', () => {
    it('should return error for unknown hook', async () => {
      // @ts-expect-error - Testing invalid hook type
      const result = await executeHook('unknown-hook', createMockContext());
      expect(result.passed).toBe(false);
      expect(result.error).toContain('Unknown hook');
    });
  });
});

describe('TDD Enforcement Hook', () => {
  describe('Pre-conditions', () => {
    it('should fail if test-gen phase has not run', async () => {
      const context = createMockContext({
        previousPhaseResults: {},
      });

      const result = await tddEnforcementHook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('test-gen phase has not run');
    });

    it('should fail if test-gen phase failed', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(5, false),
        },
      });

      const result = await tddEnforcementHook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('test-gen phase failed');
    });

    it('should fail if no tests were created', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(0, true),
        },
      });

      const result = await tddEnforcementHook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('No tests were created');
    });
  });

  describe('Test Execution', () => {
    it('should pass when tests exist and fail', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(5, true),
        },
      });

      const mockRunner = createMockTestRunner({
        testsFound: true,
        totalTests: 5,
        passingTests: 0,
        failingTests: 5,
        rawOutput: 'Tests: 5 failed, 5 total',
      });

      const hook = createTddEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(true);
      expect(result.data?.failingTests).toBe(5);
      expect(result.data?.totalTests).toBe(5);
    });

    it('should fail when all tests pass (TDD violation)', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(5, true),
        },
      });

      const mockRunner = createMockTestRunner({
        testsFound: true,
        totalTests: 5,
        passingTests: 5,
        failingTests: 0,
        rawOutput: 'Tests: 5 passed, 5 total',
      });

      const hook = createTddEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('TDD VIOLATION');
      expect(result.error).toContain('All 5 tests pass');
    });

    it('should handle mixed passing/failing tests', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(8, true),
        },
      });

      const mockRunner = createMockTestRunner({
        testsFound: true,
        totalTests: 8,
        passingTests: 3,
        failingTests: 5,
        rawOutput: 'Tests: 5 failed, 3 passed, 8 total',
      });

      const hook = createTddEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(true);
      expect(result.data?.failingTests).toBe(5);
      expect(result.data?.passingTests).toBe(3);
      expect(result.data?.totalTests).toBe(8);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain('3 tests already pass');
    });

    it('should fail when no tests found by Jest', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(5, true),
        },
      });

      const mockRunner = createMockTestRunner({
        testsFound: false,
        totalTests: 0,
        passingTests: 0,
        failingTests: 0,
        rawOutput: 'No tests found',
      });

      const hook = createTddEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('No tests found');
    });

    it('should handle test execution errors', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(5, true),
        },
      });

      const mockRunner = createMockTestRunner({
        testsFound: false,
        totalTests: 0,
        passingTests: 0,
        failingTests: 0,
        rawOutput: '',
        error: 'ENOENT: npm not found',
      });

      const hook = createTddEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('Could not run tests');
      expect(result.error).toContain('ENOENT');
    });
  });

  describe('Test Output Parsing', () => {
    it('should parse all-failed output correctly', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(3, true),
        },
      });

      const mockRunner = createMockTestRunner({
        testsFound: true,
        totalTests: 3,
        passingTests: 0,
        failingTests: 3,
        rawOutput: 'Tests: 3 failed, 3 total',
      });

      const hook = createTddEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(true);
      expect(result.data?.failingTests).toBe(3);
      expect(result.data?.passingTests).toBe(0);
      expect(result.data?.totalTests).toBe(3);
    });

    it('should pass with only one failing test', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(10, true),
        },
      });

      const mockRunner = createMockTestRunner({
        testsFound: true,
        totalTests: 10,
        passingTests: 9,
        failingTests: 1,
        rawOutput: 'Tests: 1 failed, 9 passed, 10 total',
      });

      const hook = createTddEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(true);
      expect(result.data?.failingTests).toBe(1);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain('9 tests already pass');
    });
  });

  describe('Hook Metadata', () => {
    it('should have correct name', () => {
      expect(tddEnforcementHook.name).toBe('tdd-enforcement');
    });

    it('should have description', () => {
      expect(tddEnforcementHook.description).toBeTruthy();
      expect(tddEnforcementHook.description.length).toBeGreaterThan(10);
    });

    it('should have execute function', () => {
      expect(typeof tddEnforcementHook.execute).toBe('function');
    });
  });

  describe('Verbose Mode', () => {
    it('should log when verbose is enabled', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          'test-gen': createTestGenResult(5, true),
        },
        verbose: true,
      });

      const mockRunner = createMockTestRunner({
        testsFound: true,
        totalTests: 5,
        passingTests: 0,
        failingTests: 5,
        rawOutput: 'Tests: 5 failed, 5 total',
      });

      // Capture console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const hook = createTddEnforcementHook(mockRunner);
      await hook.execute(context);

      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls.map((call: unknown[]) => call[0]);
      expect(logCalls.some((msg: unknown) => typeof msg === 'string' && msg.includes('[tdd-enforcement]'))).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});

describe('Workflow Integration', () => {
  it('should be configured on dev phase in new-feature workflow', async () => {
    // Import the workflow to verify hook is configured
    const { newFeatureWorkflow } = await import('../src/workflows/new-feature.js');

    const devPhase = newFeatureWorkflow.phases.find(p => p.agent === 'dev');

    expect(devPhase).toBeDefined();
    expect(devPhase?.prePhaseHooks).toContain('tdd-enforcement');
  });
});

describe('createTddEnforcementHook', () => {
  it('should create a valid hook config', () => {
    const mockRunner = createMockTestRunner({
      testsFound: true,
      totalTests: 1,
      passingTests: 0,
      failingTests: 1,
      rawOutput: 'Tests: 1 failed, 1 total',
    });

    const hook = createTddEnforcementHook(mockRunner);

    expect(hook.name).toBe('tdd-enforcement');
    expect(hook.description).toBeTruthy();
    expect(typeof hook.execute).toBe('function');
  });

  it('should use the provided test runner', async () => {
    const context = createMockContext({
      previousPhaseResults: {
        'test-gen': createTestGenResult(1, true),
      },
    });

    let runnerCalled = false;
    const customRunner: TestRunner = async (_workingDirectory) => {
      runnerCalled = true;
      return {
        testsFound: true,
        totalTests: 1,
        passingTests: 0,
        failingTests: 1,
        rawOutput: 'Tests: 1 failed, 1 total',
      };
    };

    const hook = createTddEnforcementHook(customRunner);
    await hook.execute(context);

    expect(runnerCalled).toBe(true);
  });
});
