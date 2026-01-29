// ABOUTME: Refactor workflow definition for Feature Factory.
// ABOUTME: Safe refactoring pipeline: qa → architect → dev → review → qa.

import type { AgentResult, Workflow } from '../types.js';

/**
 * Refactor Workflow
 *
 * Safe refactoring pipeline that preserves behavior:
 * 1. qa (baseline) - Verify all tests PASS before starting
 * 2. architect - Review refactoring rationale and scope
 * 3. dev - Implement refactoring, keep tests green
 * 4. review - Validate code quality improvement
 * 5. qa (final) - Confirm no regressions
 *
 * Key difference from new-feature:
 * - Tests must PASS throughout (not TDD red-green)
 * - No test-gen phase (using existing tests)
 * - test-passing-enforcement hook at multiple phases
 *
 * Human approval required after: architect, review
 */
export const refactorWorkflow: Workflow = {
  name: 'refactor',
  description: 'Safe refactoring pipeline that preserves behavior',

  phases: [
    {
      agent: 'qa',
      name: 'Test Baseline',
      approvalRequired: false, // Automated verification
      prePhaseHooks: ['test-passing-enforcement'], // MUST pass before we start
      nextPhaseInput: (result: AgentResult) => ({
        baselineVerdict: result.output.verdict,
        baselineTestsRun: result.output.testsRun,
        baselineTestsPassed: result.output.testsPassed,
        baselineCoverage: result.output.coveragePercent,
      }),
      validation: (result: AgentResult) => {
        // All tests must pass to establish baseline
        return (
          result.output.verdict !== 'FAILED' &&
          result.output.testsFailed === 0
        );
      },
    },
    {
      agent: 'architect',
      name: 'Refactor Review',
      approvalRequired: true,
      nextPhaseInput: (result: AgentResult) => ({
        rationale: result.output.rationale,
        scope: result.output.scope,
        affectedFiles: result.output.affectedFiles,
        expectedImprovements: result.output.expectedImprovements,
        risks: result.output.risks,
        refactoringPlan: result.output.refactoringPlan,
      }),
      validation: (result: AgentResult) => {
        // Architect must approve the refactoring plan
        return (
          result.output.approved === true &&
          result.output.refactoringPlan !== undefined
        );
      },
    },
    {
      agent: 'dev',
      name: 'Refactor Implementation',
      approvalRequired: false, // Automated validation via tests
      prePhaseHooks: ['test-passing-enforcement'], // Tests must still pass
      nextPhaseInput: (result: AgentResult) => ({
        filesModified: result.filesModified,
        commits: result.commits,
        testOutput: result.output.testRunOutput,
        changesDescription: result.output.changesDescription,
      }),
      validation: (result: AgentResult) => {
        // All tests must still pass after refactoring
        return result.output.allTestsPassing === true;
      },
    },
    {
      agent: 'review',
      name: 'Code Quality Review',
      approvalRequired: true, // Human reviews the improvement
      nextPhaseInput: (result: AgentResult) => ({
        reviewVerdict: result.output.verdict,
        reviewSummary: result.output.summary,
        improvementsValidated: result.output.improvementsValidated,
        issues: result.output.issues,
      }),
      validation: (result: AgentResult) => {
        // Must be approved as a valid improvement
        return (
          result.output.verdict === 'APPROVED' &&
          result.output.improvementsValidated === true
        );
      },
    },
    {
      agent: 'qa',
      name: 'Final Verification',
      approvalRequired: false, // Final automated check
      prePhaseHooks: ['test-passing-enforcement'], // Final pass verification
      nextPhaseInput: (result: AgentResult) => ({
        finalVerdict: result.output.verdict,
        testsRun: result.output.testsRun,
        testsPassed: result.output.testsPassed,
        testsFailed: result.output.testsFailed,
        coveragePercent: result.output.coveragePercent,
        noRegressions: result.output.noRegressions,
      }),
      validation: (result: AgentResult) => {
        // All tests must pass and no regressions
        return (
          result.output.verdict !== 'FAILED' &&
          result.output.testsFailed === 0 &&
          result.output.noRegressions === true
        );
      },
    },
  ],
};
