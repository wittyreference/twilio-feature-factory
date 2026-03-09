// ABOUTME: Zod schemas for dev agent phase outputs.
// ABOUTME: 3 variants: new-feature (TDD Green), bug-fix (Bug Fix Implementation), refactor (Refactor Implementation).

import { z } from 'zod';
import { registerPhaseSchema } from './registry.js';
import { fileTrackingFields, docProtocolFields } from './fragments.js';

/**
 * Shared dev output fields across all workflows
 */
const sharedDevFields = {
  allTestsPassing: z.boolean().describe('All tests pass (MUST be true)'),
  testRunOutput: z.string().optional().describe('Final npm test output'),
  ...fileTrackingFields,
  ...docProtocolFields,
};

/**
 * new-feature: TDD Green Phase
 * Validates: allTestsPassing === true
 * nextPhaseInput accesses: filesCreated, filesModified, commits, testRunOutput
 */
export const devNewFeatureSchema = z.object({
  testsPassedBefore: z.number().optional().describe('Tests passing before (should be 0)'),
  testsPassedAfter: z.number().optional().describe('Tests passing after'),
  ...sharedDevFields,
}).passthrough();

/**
 * bug-fix: Bug Fix Implementation
 * Validates: allTestsPassing === true
 * nextPhaseInput accesses: filesModified, commits, testRunOutput, fixDescription
 */
export const devBugFixSchema = z.object({
  fixDescription: z.string().optional().describe('Description of the fix applied'),
  testsPassedBefore: z.number().optional().describe('Tests passing before'),
  testsPassedAfter: z.number().optional().describe('Tests passing after'),
  ...sharedDevFields,
}).passthrough();

/**
 * refactor: Refactor Implementation
 * Validates: allTestsPassing === true
 * nextPhaseInput accesses: filesModified, commits, testRunOutput, changesDescription
 */
export const devRefactorSchema = z.object({
  changesDescription: z.string().optional().describe('Description of refactoring changes'),
  ...sharedDevFields,
}).passthrough();

// Register dev schemas
registerPhaseSchema('new-feature', 'dev', 'TDD Green Phase', devNewFeatureSchema);
registerPhaseSchema('bug-fix', 'dev', 'Bug Fix Implementation', devBugFixSchema);
registerPhaseSchema('refactor', 'dev', 'Refactor Implementation', devRefactorSchema);
