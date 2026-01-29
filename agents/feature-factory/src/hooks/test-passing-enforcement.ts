// ABOUTME: Test-passing enforcement hook for Feature Factory.
// ABOUTME: Verifies all tests PASS before refactor phases (safe refactoring).

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
    const { stdout, stderr } = await execAsync('npm test -- --ci 2>&1', {
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
    if (error instanceof Error && 'stdout' in error) {
      const execError = error as Error & { stdout: string; stderr: string };
      const output = (execError.stdout || '') + (execError.stderr || '');

      // Parse the output even from failed run
      const testsMatch = output.match(/Tests:\s*(\d+)\s*failed,\s*(\d+)\s*passed,\s*(\d+)\s*total/i);
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

      if (allFailedMatch) {
        return {
          testsFound: true,
          failingTests: parseInt(allFailedMatch[1], 10),
          passingTests: 0,
          totalTests: parseInt(allFailedMatch[2], 10),
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
 * Create test-passing enforcement hook execution function
 * Accepts an optional test runner for dependency injection (testing)
 */
function createTestPassingEnforcementExecutor(testRunner: TestRunner = runTests) {
  return async (context: HookContext): Promise<HookResult> => {
    const { workingDirectory, verbose } = context;

    // Run the tests to verify they all pass
    if (verbose) {
      console.log('  [test-passing-enforcement] Running tests to verify all pass...');
    }

    const testResult = await testRunner(workingDirectory);

    if (testResult.error) {
      return {
        passed: false,
        error: `REFACTOR SAFETY VIOLATION: Could not run tests: ${testResult.error}`,
        data: { rawOutput: testResult.rawOutput },
      };
    }

    if (!testResult.testsFound) {
      return {
        passed: false,
        error: 'REFACTOR SAFETY VIOLATION: No tests found. Cannot refactor without passing tests as a safety baseline.',
        data: { rawOutput: testResult.rawOutput },
      };
    }

    // Check if any tests fail (this is BAD for refactoring)
    if (testResult.failingTests > 0) {
      return {
        passed: false,
        error: `REFACTOR SAFETY VIOLATION: ${testResult.failingTests} tests failing. Cannot refactor with failing tests. Fix tests first or use bug-fix workflow.`,
        data: {
          totalTests: testResult.totalTests,
          passingTests: testResult.passingTests,
          failingTests: testResult.failingTests,
          rawOutput: testResult.rawOutput,
        },
      };
    }

    // All tests pass - safe to refactor
    if (verbose) {
      console.log(`  [test-passing-enforcement] ✓ All ${testResult.totalTests} tests pass - safe to proceed`);
    }

    return {
      passed: true,
      data: {
        totalTests: testResult.totalTests,
        passingTests: testResult.passingTests,
        failingTests: testResult.failingTests,
      },
    };
  };
}

/**
 * Test-Passing Enforcement Hook
 *
 * Runs BEFORE refactor phases to verify:
 * 1. Tests exist (baseline for safe refactoring)
 * 2. All tests PASS (behavior preservation guarantee)
 *
 * Blocks refactoring if:
 * - No tests found (no safety baseline)
 * - Any tests fail (behavior not preserved)
 */
export const testPassingEnforcementHook: HookConfig = {
  name: 'test-passing-enforcement',
  description: 'Verifies all tests pass before refactoring (behavior preservation)',
  execute: createTestPassingEnforcementExecutor(),
};

/**
 * Create a test-passing enforcement hook with custom test runner (for testing)
 */
export function createTestPassingEnforcementHook(testRunner: TestRunner): HookConfig {
  return {
    name: 'test-passing-enforcement',
    description: 'Verifies all tests pass before refactoring (behavior preservation)',
    execute: createTestPassingEnforcementExecutor(testRunner),
  };
}

/**
 * Export helpers for direct testing
 */
export { runTests };
export type { TestRunResult };
