// ABOUTME: New feature workflow definition for Feature Factory.
// ABOUTME: Full TDD pipeline: architect → spec → test-gen → dev → qa → review → docs.

import type { AgentResult, Workflow } from '../types.js';

/**
 * New Feature Workflow
 *
 * Complete TDD pipeline for implementing new Twilio features:
 * 1. architect - Design review and pattern selection
 * 2. spec - Detailed specification with test scenarios
 * 3. test-gen - Write failing tests (TDD Red Phase)
 * 4. dev - Implement to pass tests (TDD Green Phase)
 * 5. qa - Test execution, coverage, security scanning
 * 6. review - Code review and security audit
 * 7. docs - Documentation updates
 *
 * Human approval required after: architect, spec, review
 */
export const newFeatureWorkflow: Workflow = {
  name: 'new-feature',
  description: 'Full TDD pipeline for new Twilio features',

  phases: [
    {
      agent: 'architect',
      name: 'Design Review',
      approvalRequired: true,
      nextPhaseInput: (result: AgentResult) => ({
        designNotes: result.output.designNotes,
        suggestedPattern: result.output.suggestedPattern,
        twilioServices: result.output.twilioServices,
        filesToCreate: result.output.filesToCreate,
        filesToModify: result.output.filesToModify,
        claudeMdUpdates: result.output.claudeMdUpdates,
      }),
      validation: (result: AgentResult) => {
        // Architect must approve the design
        return result.output.approved === true;
      },
    },
    {
      agent: 'spec',
      name: 'Specification',
      approvalRequired: true,
      nextPhaseInput: (result: AgentResult) => ({
        specification: result.output,
        functionSpecs: result.output.functionSpecs,
        testScenarios: result.output.testScenarios,
      }),
      validation: (result: AgentResult) => {
        // Spec must have function specs and test scenarios
        const functionSpecs = result.output.functionSpecs as unknown[];
        const testScenarios = result.output.testScenarios as Record<
          string,
          unknown
        >;
        return (
          Array.isArray(functionSpecs) &&
          functionSpecs.length > 0 &&
          testScenarios !== undefined
        );
      },
    },
    {
      agent: 'test-gen',
      name: 'TDD Red Phase',
      approvalRequired: false, // Tests must fail, no approval needed
      nextPhaseInput: (result: AgentResult) => ({
        testFiles: result.output.testFiles,
        testsCreated: result.output.testsCreated,
      }),
      validation: (result: AgentResult) => {
        // Tests must exist and ALL must fail
        const testsCreated = result.output.testsCreated as number;
        const allTestsFailing = result.output.allTestsFailing as boolean;
        return testsCreated > 0 && allTestsFailing === true;
      },
    },
    {
      agent: 'dev',
      name: 'TDD Green Phase',
      approvalRequired: false, // Automated validation via tests
      prePhaseHooks: ['tdd-enforcement'], // Verify tests exist and FAIL before dev runs
      nextPhaseInput: (result: AgentResult) => ({
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        commits: result.commits,
        testOutput: result.output.testRunOutput,
      }),
      validation: (result: AgentResult) => {
        // All tests must pass
        return result.output.allTestsPassing === true;
      },
    },
    {
      agent: 'qa',
      name: 'Quality Assurance',
      approvalRequired: false, // Automated analysis
      prePhaseHooks: ['coverage-threshold'], // Enforce 80% coverage
      nextPhaseInput: (result: AgentResult) => ({
        qaVerdict: result.output.verdict,
        qaSummary: result.output.summary,
        testsRun: result.output.testsRun,
        testsPassed: result.output.testsPassed,
        testsFailed: result.output.testsFailed,
        coveragePercent: result.output.coveragePercent,
        coverageGaps: result.output.coverageGaps,
        securityIssues: result.output.securityIssues,
        twimlIssues: result.output.twimlIssues,
        recommendations: result.output.recommendations,
      }),
      validation: (result: AgentResult) => {
        // QA must not have a FAILED verdict
        return result.output.verdict !== 'FAILED';
      },
    },
    {
      agent: 'review',
      name: 'Code Review',
      approvalRequired: true, // Human reviews the review
      nextPhaseInput: (result: AgentResult) => ({
        reviewVerdict: result.output.verdict,
        reviewSummary: result.output.summary,
        issues: result.output.issues,
      }),
      validation: (result: AgentResult) => {
        // Must be approved by reviewer
        return result.output.verdict === 'APPROVED';
      },
    },
    {
      agent: 'docs',
      name: 'Documentation',
      approvalRequired: false, // Final phase, no approval needed
      validation: (result: AgentResult) => {
        // ABOUTME must be verified
        return result.output.aboutMeVerified === true;
      },
    },
  ],
};
