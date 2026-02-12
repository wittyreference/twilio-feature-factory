// ABOUTME: TDD enforcement hook for Feature Factory.
// ABOUTME: Verifies tests exist and FAIL before dev agent runs (Red phase).

import { exec } from 'child_process';
import { promisify } from 'util';
import type { HookConfig, HookContext, HookResult } from '../types.js';

const execAsync = promisify(exec);

/**
 * Test runner function type for dependency injection
 */
export type TestRunner = (workingDirectory: string) => Promise<TestRunResult>;

/**
 * Parse Jest output to extract test counts
 */
interface TestRunResult {
  testsFound: boolean;
  totalTests: number;
  passingTests: number;
  failingTests: number;
  rawOutput: string;
  error?: string;
}

/**
 * Run npm test and parse the output
 */
async function runTests(workingDirectory: string): Promise<TestRunResult> {
  try {
    // Run npm test with CI mode to prevent watch mode
    // Use --passWithNoTests=false to ensure we have tests
    const { stdout, stderr } = await execAsync('npm test -- --ci --passWithNoTests=false 2>&1', {
      cwd: workingDirectory,
      timeout: 120000, // 2 minute timeout
      env: { ...process.env, CI: 'true' },
    });

    const output = stdout + stderr;

    // Parse Jest output
    // Look for patterns like "Tests: 5 failed, 3 passed, 8 total"
    // or "Test Suites: 1 failed, 1 total"
    const testsMatch = output.match(/Tests:\s*(\d+)\s*failed,\s*(\d+)\s*passed,\s*(\d+)\s*total/i);
    const allPassedMatch = output.match(/Tests:\s*(\d+)\s*passed,\s*(\d+)\s*total/i);
    const allFailedMatch = output.match(/Tests:\s*(\d+)\s*failed,\s*(\d+)\s*total/i);

    if (testsMatch) {
      return {
        testsFound: true,
        failingTests: parseInt(testsMatch[1], 10),
        passingTests: parseInt(testsMatch[2], 10),
        totalTests: parseInt(testsMatch[3], 10),
        rawOutput: output,
      };
    }

    if (allPassedMatch) {
      // All tests passed (no failures)
      return {
        testsFound: true,
        failingTests: 0,
        passingTests: parseInt(allPassedMatch[1], 10),
        totalTests: parseInt(allPassedMatch[2], 10),
        rawOutput: output,
      };
    }

    if (allFailedMatch) {
      // All tests failed (no passes)
      return {
        testsFound: true,
        failingTests: parseInt(allFailedMatch[1], 10),
        passingTests: 0,
        totalTests: parseInt(allFailedMatch[2], 10),
        rawOutput: output,
      };
    }

    // Check for "no tests found" patterns
    if (output.includes('No tests found') || output.includes('0 total')) {
      return {
        testsFound: false,
        totalTests: 0,
        passingTests: 0,
        failingTests: 0,
        rawOutput: output,
      };
    }

    // Unexpected output format
    return {
      testsFound: false,
      totalTests: 0,
      passingTests: 0,
      failingTests: 0,
      rawOutput: output,
      error: 'Could not parse test output',
    };
  } catch (error) {
    // npm test returns non-zero exit code when tests fail
    // This is expected behavior for TDD Red phase
    if (error instanceof Error && 'stdout' in error) {
      const execError = error as Error & { stdout: string; stderr: string };
      const output = (execError.stdout || '') + (execError.stderr || '');

      // Parse the output even from failed run
      const testsMatch = output.match(/Tests:\s*(\d+)\s*failed,\s*(\d+)\s*passed,\s*(\d+)\s*total/i);
      const allFailedMatch = output.match(/Tests:\s*(\d+)\s*failed,\s*(\d+)\s*total/i);
      const allPassedMatch = output.match(/Tests:\s*(\d+)\s*passed,\s*(\d+)\s*total/i);

      // Also check for suite-level failures (e.g., test files that crash because
      // the implementation doesn't exist yet — the expected TDD Red scenario)
      const suitesFailedMatch = output.match(/Test Suites:\s*(\d+)\s*failed/i);

      if (testsMatch) {
        return {
          testsFound: true,
          failingTests: parseInt(testsMatch[1], 10),
          passingTests: parseInt(testsMatch[2], 10),
          totalTests: parseInt(testsMatch[3], 10),
          rawOutput: output,
        };
      }

      if (allFailedMatch) {
        return {
          testsFound: true,
          failingTests: parseInt(allFailedMatch[1], 10),
          passingTests: 0,
          totalTests: parseInt(allFailedMatch[2], 10),
          rawOutput: output,
        };
      }

      // Suite-level failures with all individual tests passing: test files crash
      // because the implementation module doesn't exist yet. This IS the Red phase.
      if (suitesFailedMatch && allPassedMatch) {
        const suitesFailed = parseInt(suitesFailedMatch[1], 10);
        return {
          testsFound: true,
          failingTests: suitesFailed,
          passingTests: parseInt(allPassedMatch[1], 10),
          totalTests: parseInt(allPassedMatch[2], 10) + suitesFailed,
          rawOutput: output,
        };
      }

      if (allPassedMatch) {
        return {
          testsFound: true,
          failingTests: 0,
          passingTests: parseInt(allPassedMatch[1], 10),
          totalTests: parseInt(allPassedMatch[2], 10),
          rawOutput: output,
        };
      }

      // Check for no tests
      if (output.includes('No tests found') || output.includes('0 total')) {
        return {
          testsFound: false,
          totalTests: 0,
          passingTests: 0,
          failingTests: 0,
          rawOutput: output,
        };
      }
    }

    // Actual error (npm not found, timeout, etc.)
    return {
      testsFound: false,
      totalTests: 0,
      passingTests: 0,
      failingTests: 0,
      rawOutput: '',
      error: error instanceof Error ? error.message : 'Unknown error running tests',
    };
  }
}

/**
 * Create TDD enforcement hook execution function
 * Accepts an optional test runner for dependency injection (testing)
 */
function createTddEnforcementExecutor(testRunner: TestRunner = runTests) {
  return async (context: HookContext): Promise<HookResult> => {
    const { workingDirectory, previousPhaseResults, verbose } = context;

    // Check test-gen phase results
    const testGenResult = previousPhaseResults['test-gen'];
    if (!testGenResult) {
      return {
        passed: false,
        error: 'TDD VIOLATION: test-gen phase has not run. Cannot proceed to dev phase.',
      };
    }

    if (!testGenResult.success) {
      return {
        passed: false,
        error: 'TDD VIOLATION: test-gen phase failed. Cannot proceed to dev phase.',
      };
    }

    // Check that tests were created
    const testsCreated = testGenResult.output.testsCreated as number | undefined;
    if (!testsCreated || testsCreated === 0) {
      return {
        passed: false,
        error: 'TDD VIOLATION: No tests were created in test-gen phase. Cannot proceed without failing tests.',
      };
    }

    // Run the tests to verify they fail
    if (verbose) {
      console.log('  [tdd-enforcement] Running tests to verify Red phase...');
    }

    const testResult = await testRunner(workingDirectory);

    if (testResult.error) {
      return {
        passed: false,
        error: `TDD VIOLATION: Could not run tests: ${testResult.error}`,
        data: { rawOutput: testResult.rawOutput },
      };
    }

    if (!testResult.testsFound) {
      return {
        passed: false,
        error: 'TDD VIOLATION: No tests found when running npm test. Test files may not be configured correctly.',
        data: { rawOutput: testResult.rawOutput },
      };
    }

    // Check if all tests pass (this is BAD for TDD Red phase)
    if (testResult.failingTests === 0) {
      return {
        passed: false,
        error: `TDD VIOLATION: All ${testResult.totalTests} tests pass. The dev agent has nothing to implement. Tests must FAIL before implementation.`,
        data: {
          totalTests: testResult.totalTests,
          passingTests: testResult.passingTests,
          failingTests: testResult.failingTests,
          rawOutput: testResult.rawOutput,
        },
      };
    }

    // Tests exist and are failing - TDD Red phase verified
    if (verbose) {
      console.log(`  [tdd-enforcement] ✓ Red phase verified: ${testResult.failingTests}/${testResult.totalTests} tests failing`);
    }

    const warnings: string[] = [];
    if (testResult.passingTests > 0) {
      warnings.push(`${testResult.passingTests} tests already pass. These may be from previous work or helper tests.`);
    }

    return {
      passed: true,
      data: {
        totalTests: testResult.totalTests,
        passingTests: testResult.passingTests,
        failingTests: testResult.failingTests,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  };
}

/**
 * TDD Enforcement Hook
 *
 * Runs BEFORE the dev agent to verify:
 * 1. Tests exist (from test-gen phase)
 * 2. Tests are FAILING (Red phase requirement)
 *
 * Blocks the dev agent if:
 * - No tests found
 * - All tests already pass (nothing to implement)
 */
export const tddEnforcementHook: HookConfig = {
  name: 'tdd-enforcement',
  description: 'Verifies tests exist and fail before dev agent (TDD Red phase)',
  execute: createTddEnforcementExecutor(),
};

/**
 * Create a TDD enforcement hook with custom test runner (for testing)
 */
export function createTddEnforcementHook(testRunner: TestRunner): HookConfig {
  return {
    name: 'tdd-enforcement',
    description: 'Verifies tests exist and fail before dev agent (TDD Red phase)',
    execute: createTddEnforcementExecutor(testRunner),
  };
}

/**
 * Export helpers for direct testing
 */
export { runTests };
export type { TestRunResult };
