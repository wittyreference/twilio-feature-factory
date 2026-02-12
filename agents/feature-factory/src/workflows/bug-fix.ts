// ABOUTME: Bug-fix workflow definition for Feature Factory.
// ABOUTME: Diagnosis pipeline: architect → test-gen → dev → review → qa.

import type { AgentResult, Workflow } from '../types.js';

/**
 * Bug-Fix Workflow
 *
 * Diagnosis and fix pipeline for existing bugs:
 * 1. architect - Root cause diagnosis and analysis
 * 2. test-gen - Write regression tests that reproduce the bug (must FAIL)
 * 3. dev - Minimal fix to pass tests (TDD Green Phase)
 * 4. review - Validate fix is correct and minimal
 * 5. qa - Ensure no unintended side effects
 *
 * Key difference from new-feature:
 * - No spec phase (scope is the bug itself)
 * - Architect does diagnosis, not design
 * - Focus on minimal, targeted changes
 *
 * Human approval required after: architect, review
 */
export const bugFixWorkflow: Workflow = {
  name: 'bug-fix',
  description: 'Diagnosis and fix pipeline for existing bugs',

  phases: [
    {
      agent: 'architect',
      name: 'Root Cause Diagnosis',
      approvalRequired: true,
      nextPhaseInput: (result: AgentResult) => ({
        diagnosis: result.output.diagnosis,
        rootCause: result.output.rootCause,
        affectedFiles: result.output.affectedFiles,
        suggestedFix: result.output.suggestedFix,
        riskAssessment: result.output.riskAssessment,
        reproductionSteps: result.output.reproductionSteps,
      }),
      validation: (result: AgentResult) => {
        // Architect must identify root cause
        return (
          result.output.rootCause !== undefined &&
          result.output.suggestedFix !== undefined
        );
      },
    },
    {
      agent: 'test-gen',
      name: 'Regression Tests',
      approvalRequired: false, // Tests must fail, no approval needed
      nextPhaseInput: (result: AgentResult) => ({
        testFiles: result.output.testFiles,
        testsCreated: result.output.testsCreated,
        reproducedBug: result.output.reproducedBug,
      }),
      validation: (result: AgentResult) => {
        // Tests must exist, reproduce the bug, and FAIL
        const testsCreated = result.output.testsCreated as number;
        const allTestsFailing = result.output.allTestsFailing as boolean;
        const reproducedBug = result.output.reproducedBug as boolean;
        return testsCreated > 0 && allTestsFailing === true && reproducedBug === true;
      },
    },
    {
      agent: 'dev',
      name: 'Bug Fix Implementation',
      approvalRequired: false, // Automated validation via tests
      prePhaseHooks: ['tdd-enforcement'], // Verify regression tests FAIL before fix
      maxRetries: 2, // Dev agent benefits most from retry with feedback
      nextPhaseInput: (result: AgentResult) => ({
        filesModified: result.filesModified,
        commits: result.commits,
        testOutput: result.output.testRunOutput,
        fixDescription: result.output.fixDescription,
      }),
      validation: (result: AgentResult) => {
        // All tests must pass after fix
        return result.output.allTestsPassing === true;
      },
    },
    {
      agent: 'review',
      name: 'Fix Review',
      approvalRequired: true, // Human reviews the fix
      nextPhaseInput: (result: AgentResult) => ({
        reviewVerdict: result.output.verdict,
        reviewSummary: result.output.summary,
        issues: result.output.issues,
        isMinimalFix: result.output.isMinimalFix,
      }),
      validation: (result: AgentResult) => {
        // Must be approved and verified as minimal
        return (
          result.output.verdict === 'APPROVED' &&
          result.output.isMinimalFix === true
        );
      },
    },
    {
      agent: 'qa',
      name: 'Regression Check',
      approvalRequired: false, // Final automated check
      nextPhaseInput: (result: AgentResult) => ({
        qaVerdict: result.output.verdict,
        qaSummary: result.output.summary,
        testsRun: result.output.testsRun,
        testsPassed: result.output.testsPassed,
        testsFailed: result.output.testsFailed,
        noRegressions: result.output.noRegressions,
        coveragePercent: result.output.coveragePercent,
      }),
      validation: (result: AgentResult) => {
        // QA must pass and confirm no regressions
        return (
          result.output.verdict !== 'FAILED' &&
          result.output.noRegressions === true
        );
      },
    },
  ],
};
