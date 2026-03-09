// ABOUTME: Zod schemas for QA agent phase outputs.
// ABOUTME: 4 variants: new-feature, bug-fix, refactor-baseline, refactor-final.

import { z } from 'zod';
import { registerPhaseSchema } from './registry.js';
import {
  qaVerdictSchema,
  testResultFields,
  coverageGapSchema,
  securityIssueSchema,
  docProtocolFields,
} from './fragments.js';

/**
 * Shared QA output fields across all workflows
 */
const sharedQaFields = {
  ...testResultFields,
  coveragePercent: z.number().optional().describe('Overall coverage percentage'),
  coverageMeetsThreshold: z.boolean().optional().describe('Coverage >= 80%'),
  verdict: qaVerdictSchema.describe('PASSED, NEEDS_ATTENTION, or FAILED'),
  summary: z.string().optional().describe('Brief summary of analysis'),
  ...docProtocolFields,
};

/**
 * new-feature: Quality Assurance
 * Validates: verdict !== 'FAILED'
 * nextPhaseInput accesses: verdict, summary, testsRun, testsPassed, testsFailed,
 *   coveragePercent, coverageGaps, securityIssues, twimlIssues, recommendations
 */
export const qaNewFeatureSchema = z.object({
  ...sharedQaFields,
  coverageGaps: z.array(coverageGapSchema).optional().describe('Files below threshold'),
  securityIssues: z.array(securityIssueSchema).optional().describe('Security findings'),
  twimlIssues: z.array(z.record(z.unknown())).optional().describe('TwiML pattern issues'),
  deepValidationResults: z.array(z.record(z.unknown())).optional().describe('MCP validation results'),
  recommendations: z.array(z.string()).optional().describe('Actionable recommendations'),
  patternViolations: z.array(z.record(z.unknown())).optional().describe('Pattern deviations'),
}).passthrough();

/**
 * bug-fix: Regression Check
 * Validates: verdict !== 'FAILED' && noRegressions === true
 * nextPhaseInput accesses: verdict, summary, testsRun, testsPassed, testsFailed,
 *   noRegressions, coveragePercent
 */
export const qaBugFixSchema = z.object({
  ...sharedQaFields,
  noRegressions: z.boolean().describe('No regressions detected'),
  coverageGaps: z.array(coverageGapSchema).optional().describe('Files below threshold'),
  securityIssues: z.array(securityIssueSchema).optional().describe('Security findings'),
  recommendations: z.array(z.string()).optional().describe('Actionable recommendations'),
}).passthrough();

/**
 * refactor: Test Baseline (first QA phase)
 * Validates: verdict !== 'FAILED' && testsFailed === 0
 * nextPhaseInput accesses: verdict, testsRun, testsPassed, coveragePercent
 *   (aliased as baseline*)
 */
export const qaRefactorBaselineSchema = z.object({
  ...sharedQaFields,
  coverageGaps: z.array(coverageGapSchema).optional().describe('Files below threshold'),
}).passthrough();

/**
 * refactor: Final Verification (last QA phase)
 * Validates: verdict !== 'FAILED' && testsFailed === 0 && noRegressions === true
 * nextPhaseInput accesses: verdict, testsRun, testsPassed, testsFailed,
 *   coveragePercent, noRegressions (aliased as final*)
 */
export const qaRefactorFinalSchema = z.object({
  ...sharedQaFields,
  noRegressions: z.boolean().describe('No regressions detected'),
  coverageGaps: z.array(coverageGapSchema).optional().describe('Files below threshold'),
}).passthrough();

// Register QA schemas
registerPhaseSchema('new-feature', 'qa', 'Quality Assurance', qaNewFeatureSchema);
registerPhaseSchema('bug-fix', 'qa', 'Regression Check', qaBugFixSchema);
registerPhaseSchema('refactor', 'qa', 'Test Baseline', qaRefactorBaselineSchema);
registerPhaseSchema('refactor', 'qa', 'Final Verification', qaRefactorFinalSchema);
