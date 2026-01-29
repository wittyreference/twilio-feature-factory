// ABOUTME: Unit tests for Feature Factory hooks infrastructure.
// ABOUTME: Tests TDD enforcement hook, credential safety, and hook execution system.

import { describe, it, expect, jest } from '@jest/globals';
import {
  executeHook,
  getHook,
  listHooks,
  hasHook,
  tddEnforcementHook,
  coverageThresholdHook,
  testPassingEnforcementHook,
  validateCredentials,
  shouldSkipValidation,
} from '../src/hooks/index.js';
import {
  createTddEnforcementHook,
  type TestRunResult,
  type TestRunner,
} from '../src/hooks/tdd-enforcement.js';
import {
  createTestPassingEnforcementHook,
  type TestRunResult as TestPassingRunResult,
  type TestRunner as TestPassingRunner,
} from '../src/hooks/test-passing-enforcement.js';
import {
  createCoverageThresholdHook,
  DEFAULT_COVERAGE_THRESHOLD,
  type CoverageResult,
  type CoverageRunner,
} from '../src/hooks/coverage-threshold.js';
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

/**
 * Create a successful dev phase result
 */
function createDevResult(
  allTestsPassing: boolean = true,
  success: boolean = true
): AgentResult {
  return {
    agent: 'dev',
    success,
    output: {
      allTestsPassing,
      testRunOutput: 'All tests passed',
    },
    filesCreated: ['src/feature.ts'],
    filesModified: [],
    commits: ['abc123'],
    costUsd: 0.2,
    turnsUsed: 10,
  };
}

/**
 * Create a mock coverage runner for testing
 */
function createMockCoverageRunner(result: CoverageResult): CoverageRunner {
  return async (_workingDirectory: string) => result;
}

/**
 * Create a mock test runner for test-passing-enforcement testing
 */
function createMockTestPassingRunner(result: TestPassingRunResult): TestPassingRunner {
  return async (_workingDirectory: string) => result;
}

describe('Hook Infrastructure', () => {
  describe('getHook', () => {
    it('should return tdd-enforcement hook', () => {
      const hook = getHook('tdd-enforcement');
      expect(hook).toBeDefined();
      expect(hook?.name).toBe('tdd-enforcement');
    });

    it('should return coverage-threshold hook', () => {
      const hook = getHook('coverage-threshold');
      expect(hook).toBeDefined();
      expect(hook?.name).toBe('coverage-threshold');
    });

    it('should return test-passing-enforcement hook', () => {
      const hook = getHook('test-passing-enforcement');
      expect(hook).toBeDefined();
      expect(hook?.name).toBe('test-passing-enforcement');
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
      expect(hooks.length).toBeGreaterThanOrEqual(3);
      expect(hooks.some(h => h.name === 'tdd-enforcement')).toBe(true);
      expect(hooks.some(h => h.name === 'coverage-threshold')).toBe(true);
      expect(hooks.some(h => h.name === 'test-passing-enforcement')).toBe(true);
    });
  });

  describe('hasHook', () => {
    it('should return true for existing hooks', () => {
      expect(hasHook('tdd-enforcement')).toBe(true);
      expect(hasHook('coverage-threshold')).toBe(true);
      expect(hasHook('test-passing-enforcement')).toBe(true);
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
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const hook = createTddEnforcementHook(mockRunner);
      await hook.execute(context);

      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls.map((call: unknown[]) => call[0]);
      expect(logCalls.some((msg: unknown) => typeof msg === 'string' && msg.includes('[tdd-enforcement]'))).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});

// ============================================================================
// Coverage Threshold Hook Tests
// ============================================================================

describe('Coverage Threshold Hook', () => {
  describe('Pre-conditions', () => {
    it('should fail if dev phase has not run', async () => {
      const context = createMockContext({
        previousPhaseResults: {},
      });

      const result = await coverageThresholdHook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('dev phase has not run');
    });

    it('should fail if dev phase failed', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(true, false),
        },
      });

      const result = await coverageThresholdHook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('dev phase failed');
    });

    it('should fail if tests are not passing', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(false, true),
        },
      });

      const result = await coverageThresholdHook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('tests are not passing');
    });
  });

  describe('Coverage Analysis', () => {
    it('should pass when coverage meets threshold', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(true, true),
        },
      });

      const mockRunner = createMockCoverageRunner({
        success: true,
        coveragePercent: 85,
        statementCoverage: 90,
        branchCoverage: 80,
        functionCoverage: 95,
        lineCoverage: 88,
        uncoveredFiles: [],
        rawOutput: 'Coverage summary...',
      });

      const hook = createCoverageThresholdHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(true);
      expect(result.data?.coveragePercent).toBe(85);
    });

    it('should fail when coverage is below threshold', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(true, true),
        },
      });

      const mockRunner = createMockCoverageRunner({
        success: true,
        coveragePercent: 65,
        statementCoverage: 70,
        branchCoverage: 60,
        functionCoverage: 75,
        lineCoverage: 68,
        uncoveredFiles: [
          { file: 'handler.js', coverage: 50, uncoveredLines: [10, 20, 30] },
        ],
        rawOutput: 'Coverage summary...',
      });

      const hook = createCoverageThresholdHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('Coverage threshold not met');
      expect(result.error).toContain('65.0%');
      expect(result.error).toContain(`${DEFAULT_COVERAGE_THRESHOLD}%`);
    });

    it('should report uncovered files when below threshold', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(true, true),
        },
      });

      const mockRunner = createMockCoverageRunner({
        success: true,
        coveragePercent: 70,
        statementCoverage: 75,
        branchCoverage: 65,
        functionCoverage: 80,
        lineCoverage: 72,
        uncoveredFiles: [
          { file: 'handler.js', coverage: 50, uncoveredLines: [10, 20] },
          { file: 'utils.js', coverage: 60, uncoveredLines: [5, 15] },
        ],
        rawOutput: 'Coverage summary...',
      });

      const hook = createCoverageThresholdHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.data?.uncoveredFiles).toHaveLength(2);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.[0]).toContain('handler.js');
    });

    it('should handle coverage runner errors', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(true, true),
        },
      });

      const mockRunner = createMockCoverageRunner({
        success: false,
        coveragePercent: 0,
        statementCoverage: 0,
        branchCoverage: 0,
        functionCoverage: 0,
        lineCoverage: 0,
        uncoveredFiles: [],
        rawOutput: '',
        error: 'Could not parse coverage data',
      });

      const hook = createCoverageThresholdHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('Could not parse coverage data');
    });

    it('should pass with exactly threshold coverage', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(true, true),
        },
      });

      const mockRunner = createMockCoverageRunner({
        success: true,
        coveragePercent: 80,
        statementCoverage: 82,
        branchCoverage: 78,
        functionCoverage: 85,
        lineCoverage: 80,
        uncoveredFiles: [],
        rawOutput: 'Coverage summary...',
      });

      const hook = createCoverageThresholdHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(true);
    });

    it('should allow custom threshold', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(true, true),
        },
      });

      const mockRunner = createMockCoverageRunner({
        success: true,
        coveragePercent: 65,
        statementCoverage: 70,
        branchCoverage: 60,
        functionCoverage: 75,
        lineCoverage: 68,
        uncoveredFiles: [],
        rawOutput: 'Coverage summary...',
      });

      // Custom threshold of 60%
      const hook = createCoverageThresholdHook(mockRunner, 60);
      const result = await hook.execute(context);

      expect(result.passed).toBe(true);
      expect(result.data?.threshold).toBe(60);
    });
  });

  describe('Hook Metadata', () => {
    it('should have correct name', () => {
      expect(coverageThresholdHook.name).toBe('coverage-threshold');
    });

    it('should have description', () => {
      expect(coverageThresholdHook.description).toBeTruthy();
      expect(coverageThresholdHook.description.length).toBeGreaterThan(10);
    });

    it('should have execute function', () => {
      expect(typeof coverageThresholdHook.execute).toBe('function');
    });
  });

  describe('Verbose Mode', () => {
    it('should log when verbose is enabled', async () => {
      const context = createMockContext({
        previousPhaseResults: {
          dev: createDevResult(true, true),
        },
        verbose: true,
      });

      const mockRunner = createMockCoverageRunner({
        success: true,
        coveragePercent: 85,
        statementCoverage: 90,
        branchCoverage: 80,
        functionCoverage: 95,
        lineCoverage: 88,
        uncoveredFiles: [],
        rawOutput: 'Coverage summary...',
      });

      // Capture console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const hook = createCoverageThresholdHook(mockRunner);
      await hook.execute(context);

      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls.map((call: unknown[]) => call[0]);
      expect(
        logCalls.some(
          (msg: unknown) =>
            typeof msg === 'string' && msg.includes('[coverage-threshold]')
        )
      ).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});

describe('createCoverageThresholdHook', () => {
  it('should create a valid hook config', () => {
    const mockRunner = createMockCoverageRunner({
      success: true,
      coveragePercent: 85,
      statementCoverage: 90,
      branchCoverage: 80,
      functionCoverage: 95,
      lineCoverage: 88,
      uncoveredFiles: [],
      rawOutput: 'Coverage summary...',
    });

    const hook = createCoverageThresholdHook(mockRunner);

    expect(hook.name).toBe('coverage-threshold');
    expect(hook.description).toBeTruthy();
    expect(typeof hook.execute).toBe('function');
  });

  it('should use the provided coverage runner', async () => {
    const context = createMockContext({
      previousPhaseResults: {
        dev: createDevResult(true, true),
      },
    });

    let runnerCalled = false;
    const customRunner: CoverageRunner = async (_workingDirectory) => {
      runnerCalled = true;
      return {
        success: true,
        coveragePercent: 85,
        statementCoverage: 90,
        branchCoverage: 80,
        functionCoverage: 95,
        lineCoverage: 88,
        uncoveredFiles: [],
        rawOutput: 'Coverage summary...',
      };
    };

    const hook = createCoverageThresholdHook(customRunner);
    await hook.execute(context);

    expect(runnerCalled).toBe(true);
  });
});

describe('Workflow Integration', () => {
  describe('new-feature workflow', () => {
    it('should be configured on dev phase in new-feature workflow', async () => {
      const { newFeatureWorkflow } = await import('../src/workflows/new-feature.js');

      const devPhase = newFeatureWorkflow.phases.find(p => p.agent === 'dev');

      expect(devPhase).toBeDefined();
      expect(devPhase?.prePhaseHooks).toContain('tdd-enforcement');
    });

    it('should be configured on qa phase in new-feature workflow', async () => {
      const { newFeatureWorkflow } = await import('../src/workflows/new-feature.js');

      const qaPhase = newFeatureWorkflow.phases.find(p => p.agent === 'qa');

      expect(qaPhase).toBeDefined();
      expect(qaPhase?.prePhaseHooks).toContain('coverage-threshold');
    });
  });

  describe('bug-fix workflow', () => {
    it('should have tdd-enforcement on dev phase', async () => {
      const { bugFixWorkflow } = await import('../src/workflows/bug-fix.js');

      const devPhase = bugFixWorkflow.phases.find(p => p.agent === 'dev');

      expect(devPhase).toBeDefined();
      expect(devPhase?.prePhaseHooks).toContain('tdd-enforcement');
    });

    it('should have correct phase order', async () => {
      const { bugFixWorkflow } = await import('../src/workflows/bug-fix.js');

      const agents = bugFixWorkflow.phases.map(p => p.agent);
      expect(agents).toEqual(['architect', 'test-gen', 'dev', 'review', 'qa']);
    });

    it('should require approval after architect and review', async () => {
      const { bugFixWorkflow } = await import('../src/workflows/bug-fix.js');

      const approvalPhases = bugFixWorkflow.phases
        .filter(p => p.approvalRequired)
        .map(p => p.agent);

      expect(approvalPhases).toEqual(['architect', 'review']);
    });
  });

  describe('refactor workflow', () => {
    it('should have test-passing-enforcement on qa baseline phase', async () => {
      const { refactorWorkflow } = await import('../src/workflows/refactor.js');

      const qaBaselinePhase = refactorWorkflow.phases.find(
        p => p.agent === 'qa' && p.name === 'Test Baseline'
      );

      expect(qaBaselinePhase).toBeDefined();
      expect(qaBaselinePhase?.prePhaseHooks).toContain('test-passing-enforcement');
    });

    it('should have test-passing-enforcement on dev phase', async () => {
      const { refactorWorkflow } = await import('../src/workflows/refactor.js');

      const devPhase = refactorWorkflow.phases.find(p => p.agent === 'dev');

      expect(devPhase).toBeDefined();
      expect(devPhase?.prePhaseHooks).toContain('test-passing-enforcement');
    });

    it('should have test-passing-enforcement on final qa phase', async () => {
      const { refactorWorkflow } = await import('../src/workflows/refactor.js');

      const qaFinalPhase = refactorWorkflow.phases.find(
        p => p.agent === 'qa' && p.name === 'Final Verification'
      );

      expect(qaFinalPhase).toBeDefined();
      expect(qaFinalPhase?.prePhaseHooks).toContain('test-passing-enforcement');
    });

    it('should have correct phase order', async () => {
      const { refactorWorkflow } = await import('../src/workflows/refactor.js');

      const agents = refactorWorkflow.phases.map(p => p.agent);
      expect(agents).toEqual(['qa', 'architect', 'dev', 'review', 'qa']);
    });

    it('should require approval after architect and review', async () => {
      const { refactorWorkflow } = await import('../src/workflows/refactor.js');

      const approvalPhases = refactorWorkflow.phases
        .filter(p => p.approvalRequired)
        .map(p => p.agent);

      expect(approvalPhases).toEqual(['architect', 'review']);
    });
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

// ============================================================================
// Test-Passing Enforcement Hook Tests
// ============================================================================

describe('Test-Passing Enforcement Hook', () => {
  describe('Test Execution', () => {
    it('should pass when all tests pass', async () => {
      const context = createMockContext();

      const mockRunner = createMockTestPassingRunner({
        testsFound: true,
        totalTests: 10,
        passingTests: 10,
        failingTests: 0,
        rawOutput: 'Tests: 10 passed, 10 total',
      });

      const hook = createTestPassingEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(true);
      expect(result.data?.totalTests).toBe(10);
      expect(result.data?.passingTests).toBe(10);
      expect(result.data?.failingTests).toBe(0);
    });

    it('should fail when any tests fail (refactor violation)', async () => {
      const context = createMockContext();

      const mockRunner = createMockTestPassingRunner({
        testsFound: true,
        totalTests: 10,
        passingTests: 8,
        failingTests: 2,
        rawOutput: 'Tests: 2 failed, 8 passed, 10 total',
      });

      const hook = createTestPassingEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('REFACTOR SAFETY VIOLATION');
      expect(result.error).toContain('2 tests failing');
    });

    it('should fail when all tests fail', async () => {
      const context = createMockContext();

      const mockRunner = createMockTestPassingRunner({
        testsFound: true,
        totalTests: 5,
        passingTests: 0,
        failingTests: 5,
        rawOutput: 'Tests: 5 failed, 5 total',
      });

      const hook = createTestPassingEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('REFACTOR SAFETY VIOLATION');
      expect(result.error).toContain('5 tests failing');
    });

    it('should fail when no tests found', async () => {
      const context = createMockContext();

      const mockRunner = createMockTestPassingRunner({
        testsFound: false,
        totalTests: 0,
        passingTests: 0,
        failingTests: 0,
        rawOutput: 'No tests found',
      });

      const hook = createTestPassingEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('REFACTOR SAFETY VIOLATION');
      expect(result.error).toContain('No tests found');
      expect(result.error).toContain('safety baseline');
    });

    it('should handle test execution errors', async () => {
      const context = createMockContext();

      const mockRunner = createMockTestPassingRunner({
        testsFound: false,
        totalTests: 0,
        passingTests: 0,
        failingTests: 0,
        rawOutput: '',
        error: 'ENOENT: npm not found',
      });

      const hook = createTestPassingEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.error).toContain('REFACTOR SAFETY VIOLATION');
      expect(result.error).toContain('Could not run tests');
      expect(result.error).toContain('ENOENT');
    });

    it('should include test counts in error data when failing', async () => {
      const context = createMockContext();

      const mockRunner = createMockTestPassingRunner({
        testsFound: true,
        totalTests: 20,
        passingTests: 15,
        failingTests: 5,
        rawOutput: 'Tests: 5 failed, 15 passed, 20 total',
      });

      const hook = createTestPassingEnforcementHook(mockRunner);
      const result = await hook.execute(context);

      expect(result.passed).toBe(false);
      expect(result.data?.totalTests).toBe(20);
      expect(result.data?.passingTests).toBe(15);
      expect(result.data?.failingTests).toBe(5);
    });
  });

  describe('Hook Metadata', () => {
    it('should have correct name', () => {
      expect(testPassingEnforcementHook.name).toBe('test-passing-enforcement');
    });

    it('should have description', () => {
      expect(testPassingEnforcementHook.description).toBeTruthy();
      expect(testPassingEnforcementHook.description.length).toBeGreaterThan(10);
    });

    it('should have execute function', () => {
      expect(typeof testPassingEnforcementHook.execute).toBe('function');
    });
  });

  describe('Verbose Mode', () => {
    it('should log when verbose is enabled', async () => {
      const context = createMockContext({
        verbose: true,
      });

      const mockRunner = createMockTestPassingRunner({
        testsFound: true,
        totalTests: 5,
        passingTests: 5,
        failingTests: 0,
        rawOutput: 'Tests: 5 passed, 5 total',
      });

      // Capture console.log
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const hook = createTestPassingEnforcementHook(mockRunner);
      await hook.execute(context);

      expect(consoleSpy).toHaveBeenCalled();
      const logCalls = consoleSpy.mock.calls.map((call: unknown[]) => call[0]);
      expect(logCalls.some((msg: unknown) => typeof msg === 'string' && msg.includes('[test-passing-enforcement]'))).toBe(true);

      consoleSpy.mockRestore();
    });
  });
});

describe('createTestPassingEnforcementHook', () => {
  it('should create a valid hook config', () => {
    const mockRunner = createMockTestPassingRunner({
      testsFound: true,
      totalTests: 5,
      passingTests: 5,
      failingTests: 0,
      rawOutput: 'Tests: 5 passed, 5 total',
    });

    const hook = createTestPassingEnforcementHook(mockRunner);

    expect(hook.name).toBe('test-passing-enforcement');
    expect(hook.description).toBeTruthy();
    expect(typeof hook.execute).toBe('function');
  });

  it('should use the provided test runner', async () => {
    const context = createMockContext();

    let runnerCalled = false;
    const customRunner: TestPassingRunner = async (_workingDirectory) => {
      runnerCalled = true;
      return {
        testsFound: true,
        totalTests: 3,
        passingTests: 3,
        failingTests: 0,
        rawOutput: 'Tests: 3 passed, 3 total',
      };
    };

    const hook = createTestPassingEnforcementHook(customRunner);
    await hook.execute(context);

    expect(runnerCalled).toBe(true);
  });
});

// ============================================================================
// Credential Safety Tests
// ============================================================================

describe('Credential Safety Hook', () => {
  describe('validateCredentials', () => {
    describe('Account SID detection', () => {
      it('should detect hardcoded Account SID', () => {
        const content = `
          const client = new Twilio('ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', authToken);
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(false);
        expect(result.error).toContain('CREDENTIAL SAFETY VIOLATION');
        expect(result.error).toContain('account sid');
        expect(result.violations).toHaveLength(1);
        expect(result.violations?.[0].type).toBe('account_sid');
      });

      it('should allow Account SID in env var reference', () => {
        const content = `
          const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, authToken);
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(true);
      });

      it('should allow Account SID in context reference', () => {
        const content = `
          const client = context.getTwilioClient();
          const accountSid = context.TWILIO_ACCOUNT_SID;
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(true);
      });
    });

    describe('API Key SID detection', () => {
      it('should detect hardcoded API Key SID', () => {
        const content = `
          const apiKey = 'SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(false);
        expect(result.error).toContain('api key');
        expect(result.violations?.[0].type).toBe('api_key');
      });

      it('should allow API Key SID in env var reference', () => {
        const content = `
          const apiKey = process.env.TWILIO_API_KEY;
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(true);
      });
    });

    describe('Auth Token detection', () => {
      it('should detect hardcoded auth token assignment', () => {
        const content = `
          const authToken = 'cccccccccccccccccccccccccccccccc';
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(false);
        expect(result.error).toContain('auth token');
        expect(result.violations?.[0].type).toBe('auth_token');
      });

      it('should detect AUTH_TOKEN assignment', () => {
        const content = `
          AUTH_TOKEN: "dddddddddddddddddddddddddddddddd"
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(false);
        expect(result.violations?.[0].type).toBe('auth_token');
      });

      it('should allow auth token from env var', () => {
        const content = `
          const authToken = process.env.TWILIO_AUTH_TOKEN;
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(true);
      });
    });

    describe('API Secret detection', () => {
      it('should detect hardcoded API secret', () => {
        const content = `
          const apiSecret = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(false);
        expect(result.error).toContain('api secret');
        expect(result.violations?.[0].type).toBe('api_secret');
      });

      it('should allow API secret from env var', () => {
        const content = `
          const apiSecret = process.env.TWILIO_API_SECRET;
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(true);
      });
    });

    describe('Multiple violations', () => {
      it('should detect multiple credential types', () => {
        // Note: hex chars are 0-9 and a-f only
        const content = `
          const accountSid = 'ACffffffffffffffffffffffffffffffff';
          const apiKeySid = 'SKabcdef1234567890abcdef1234567890';
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(false);
        expect(result.violations).toHaveLength(2);
        expect(result.violations?.map(v => v.type)).toContain('account_sid');
        expect(result.violations?.map(v => v.type)).toContain('api_key');
      });
    });

    describe('Safe content', () => {
      it('should pass for normal code without credentials', () => {
        const content = `
          function sendSms(to, body) {
            return client.messages.create({
              to,
              from: process.env.TWILIO_PHONE_NUMBER,
              body
            });
          }
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(true);
        expect(result.violations).toBeUndefined();
      });

      it('should pass for comments mentioning credential patterns', () => {
        const content = `
          // Account SIDs start with AC followed by 32 hex characters
          // API Keys start with SK followed by 32 hex characters
          const accountSid = process.env.TWILIO_ACCOUNT_SID;
        `;
        const result = validateCredentials(content);

        expect(result.passed).toBe(true);
      });
    });
  });

  describe('shouldSkipValidation', () => {
    it('should skip .env.example files', () => {
      expect(shouldSkipValidation('.env.example')).toBe(true);
      expect(shouldSkipValidation('config/.env.sample')).toBe(true);
    });

    it('should skip markdown files', () => {
      expect(shouldSkipValidation('README.md')).toBe(true);
      expect(shouldSkipValidation('docs/guide.md')).toBe(true);
      expect(shouldSkipValidation('CLAUDE.md')).toBe(true);
    });

    it('should skip test files', () => {
      expect(shouldSkipValidation('foo.test.ts')).toBe(true);
      expect(shouldSkipValidation('bar.spec.js')).toBe(true);
      expect(shouldSkipValidation('__tests__/unit.ts')).toBe(true);
    });

    it('should skip docs directory', () => {
      expect(shouldSkipValidation('docs/api-reference.ts')).toBe(true);
    });

    it('should not skip regular source files', () => {
      expect(shouldSkipValidation('src/index.ts')).toBe(false);
      expect(shouldSkipValidation('functions/voice/handler.js')).toBe(false);
      expect(shouldSkipValidation('lib/twilio-client.ts')).toBe(false);
    });
  });
});
