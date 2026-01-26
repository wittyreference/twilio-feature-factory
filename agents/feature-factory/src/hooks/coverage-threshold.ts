// ABOUTME: Coverage threshold enforcement hook for Feature Factory.
// ABOUTME: Verifies test coverage meets 80% threshold before QA phase runs.

import { exec } from 'child_process';
import { promisify } from 'util';
import type { HookConfig, HookContext, HookResult } from '../types.js';

const execAsync = promisify(exec);

/**
 * Coverage runner function type for dependency injection
 */
export type CoverageRunner = (workingDirectory: string) => Promise<CoverageResult>;

/**
 * Coverage analysis result
 */
export interface CoverageResult {
  success: boolean;
  coveragePercent: number;
  statementCoverage: number;
  branchCoverage: number;
  functionCoverage: number;
  lineCoverage: number;
  uncoveredFiles: UncoveredFile[];
  rawOutput: string;
  error?: string;
}

/**
 * Information about an uncovered file
 */
export interface UncoveredFile {
  file: string;
  coverage: number;
  uncoveredLines: number[];
}

/**
 * Default coverage threshold (percentage)
 */
export const DEFAULT_COVERAGE_THRESHOLD = 80;

/**
 * Run npm test with coverage and parse results
 */
async function runCoverage(workingDirectory: string): Promise<CoverageResult> {
  try {
    // Run tests with coverage in CI mode
    const { stdout, stderr } = await execAsync(
      'npm test -- --coverage --ci --coverageReporters=text-summary --coverageReporters=json-summary 2>&1',
      {
        cwd: workingDirectory,
        timeout: 180000, // 3 minute timeout for coverage
        env: { ...process.env, CI: 'true' },
      }
    );

    const output = stdout + stderr;
    return parseCoverageOutput(output);
  } catch (error) {
    // npm test may return non-zero if tests fail but coverage still runs
    if (error instanceof Error && 'stdout' in error) {
      const execError = error as Error & { stdout: string; stderr: string };
      const output = (execError.stdout || '') + (execError.stderr || '');
      return parseCoverageOutput(output);
    }

    return {
      success: false,
      coveragePercent: 0,
      statementCoverage: 0,
      branchCoverage: 0,
      functionCoverage: 0,
      lineCoverage: 0,
      uncoveredFiles: [],
      rawOutput: '',
      error: error instanceof Error ? error.message : 'Unknown error running coverage',
    };
  }
}

/**
 * Parse Jest coverage output
 */
function parseCoverageOutput(output: string): CoverageResult {
  // Look for coverage summary in text format
  // Example:
  // Coverage summary
  // Statements   : 85.71% ( 12/14 )
  // Branches     : 75.00% ( 6/8 )
  // Functions    : 100.00% ( 4/4 )
  // Lines        : 85.71% ( 12/14 )

  const stmtMatch = output.match(/Statements\s*:\s*([\d.]+)%/i);
  const branchMatch = output.match(/Branches?\s*:\s*([\d.]+)%/i);
  const funcMatch = output.match(/Functions?\s*:\s*([\d.]+)%/i);
  const lineMatch = output.match(/Lines?\s*:\s*([\d.]+)%/i);

  const statementCoverage = stmtMatch ? parseFloat(stmtMatch[1]) : 0;
  const branchCoverage = branchMatch ? parseFloat(branchMatch[1]) : 0;
  const functionCoverage = funcMatch ? parseFloat(funcMatch[1]) : 0;
  const lineCoverage = lineMatch ? parseFloat(lineMatch[1]) : 0;

  // Calculate overall coverage as average of statement and branch
  const coveragePercent =
    statementCoverage > 0 || branchCoverage > 0
      ? (statementCoverage + branchCoverage) / 2
      : 0;

  // Parse uncovered files from the coverage table
  // Example line: "handler.js | 65.00 | 50.00 | 75.00 | 65.00 | 12,34,56"
  const uncoveredFiles: UncoveredFile[] = [];
  const fileLines = output.match(/^\s*[\w/.-]+\.(?:js|ts)\s*\|\s*[\d.]+/gm) || [];

  for (const line of fileLines) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 5) {
      const file = parts[0];
      const fileCoverage = parseFloat(parts[1]) || 0;
      const uncoveredLinesStr = parts[5] || '';
      const uncoveredLines = uncoveredLinesStr
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));

      if (fileCoverage < DEFAULT_COVERAGE_THRESHOLD) {
        uncoveredFiles.push({
          file,
          coverage: fileCoverage,
          uncoveredLines,
        });
      }
    }
  }

  const success = coveragePercent > 0;

  return {
    success,
    coveragePercent,
    statementCoverage,
    branchCoverage,
    functionCoverage,
    lineCoverage,
    uncoveredFiles,
    rawOutput: output,
    error: success ? undefined : 'Could not parse coverage data from output',
  };
}

/**
 * Create coverage threshold hook execution function
 * Accepts an optional coverage runner for dependency injection (testing)
 */
function createCoverageThresholdExecutor(
  coverageRunner: CoverageRunner = runCoverage,
  threshold: number = DEFAULT_COVERAGE_THRESHOLD
) {
  return async (context: HookContext): Promise<HookResult> => {
    const { workingDirectory, previousPhaseResults, verbose } = context;

    // Check dev phase results
    const devResult = previousPhaseResults['dev'];
    if (!devResult) {
      return {
        passed: false,
        error: 'Coverage threshold hook: dev phase has not run.',
      };
    }

    if (!devResult.success) {
      return {
        passed: false,
        error: 'Coverage threshold hook: dev phase failed. Cannot check coverage.',
      };
    }

    // Check if all tests passed
    if (devResult.output.allTestsPassing !== true) {
      return {
        passed: false,
        error: 'Coverage threshold hook: tests are not passing. Fix tests before checking coverage.',
      };
    }

    // Run coverage analysis
    if (verbose) {
      console.log('  [coverage-threshold] Running coverage analysis...');
    }

    const coverageResult = await coverageRunner(workingDirectory);

    if (coverageResult.error && coverageResult.coveragePercent === 0) {
      return {
        passed: false,
        error: `Coverage threshold hook: ${coverageResult.error}`,
        data: { rawOutput: coverageResult.rawOutput },
      };
    }

    // Check against threshold
    if (coverageResult.coveragePercent < threshold) {
      const uncoveredSummary = coverageResult.uncoveredFiles
        .slice(0, 5) // Show top 5 uncovered files
        .map(f => `  - ${f.file}: ${f.coverage.toFixed(1)}%`)
        .join('\n');

      return {
        passed: false,
        error: `Coverage threshold not met: ${coverageResult.coveragePercent.toFixed(1)}% < ${threshold}%`,
        data: {
          coveragePercent: coverageResult.coveragePercent,
          statementCoverage: coverageResult.statementCoverage,
          branchCoverage: coverageResult.branchCoverage,
          functionCoverage: coverageResult.functionCoverage,
          lineCoverage: coverageResult.lineCoverage,
          uncoveredFiles: coverageResult.uncoveredFiles,
          threshold,
        },
        warnings: uncoveredSummary
          ? [`Files below threshold:\n${uncoveredSummary}`]
          : undefined,
      };
    }

    // Coverage meets threshold
    if (verbose) {
      console.log(
        `  [coverage-threshold] ✓ Coverage: ${coverageResult.coveragePercent.toFixed(1)}% (threshold: ${threshold}%)`
      );
    }

    const warnings: string[] = [];
    if (coverageResult.uncoveredFiles.length > 0) {
      warnings.push(
        `${coverageResult.uncoveredFiles.length} file(s) below ${threshold}% coverage`
      );
    }

    return {
      passed: true,
      data: {
        coveragePercent: coverageResult.coveragePercent,
        statementCoverage: coverageResult.statementCoverage,
        branchCoverage: coverageResult.branchCoverage,
        functionCoverage: coverageResult.functionCoverage,
        lineCoverage: coverageResult.lineCoverage,
        uncoveredFiles: coverageResult.uncoveredFiles,
        threshold,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  };
}

/**
 * Coverage Threshold Hook
 *
 * Runs BEFORE the QA agent to verify:
 * 1. Dev phase completed successfully
 * 2. All tests are passing
 * 3. Coverage meets the 80% threshold
 *
 * Blocks the QA agent if:
 * - Dev phase didn't complete
 * - Tests are failing
 * - Coverage is below threshold
 */
export const coverageThresholdHook: HookConfig = {
  name: 'coverage-threshold',
  description: 'Verifies test coverage meets 80% threshold before QA phase',
  execute: createCoverageThresholdExecutor(),
};

/**
 * Create a coverage threshold hook with custom runner and threshold (for testing)
 */
export function createCoverageThresholdHook(
  coverageRunner: CoverageRunner,
  threshold: number = DEFAULT_COVERAGE_THRESHOLD
): HookConfig {
  return {
    name: 'coverage-threshold',
    description: `Verifies test coverage meets ${threshold}% threshold before QA phase`,
    execute: createCoverageThresholdExecutor(coverageRunner, threshold),
  };
}

/**
 * Export helpers for direct testing
 */
export { runCoverage, parseCoverageOutput };
