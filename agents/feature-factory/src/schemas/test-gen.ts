// ABOUTME: Zod schemas for test-gen agent phase outputs.
// ABOUTME: 2 variants: new-feature (TDD Red Phase), bug-fix (Regression Tests).

import { z } from 'zod';
import { registerPhaseSchema } from './registry.js';
import { testFileRefSchema, docProtocolFields } from './fragments.js';

/**
 * new-feature: TDD Red Phase
 * Validates: testsCreated > 0 && allTestsFailing === true
 * nextPhaseInput accesses: testFiles, testsCreated
 */
export const testGenNewFeatureSchema = z.object({
  testsCreated: z.number().describe('Count of test files created'),
  testFiles: z.array(testFileRefSchema).optional().describe('Test file paths and descriptions'),
  coverageGoals: z.array(z.string()).optional().describe('What tests cover'),
  allTestsFailing: z.boolean().describe('All tests fail (MUST be true)'),
  testRunOutput: z.string().optional().describe('Output from npm test'),
  ...docProtocolFields,
}).passthrough();

/**
 * bug-fix: Regression Tests
 * Validates: testsCreated > 0 && allTestsFailing === true && reproducedBug === true
 * nextPhaseInput accesses: testFiles, testsCreated, reproducedBug
 */
export const testGenBugFixSchema = z.object({
  testsCreated: z.number().describe('Count of test files created'),
  testFiles: z.array(testFileRefSchema).optional().describe('Test file paths and descriptions'),
  coverageGoals: z.array(z.string()).optional().describe('What tests cover'),
  allTestsFailing: z.boolean().describe('All tests fail (MUST be true)'),
  reproducedBug: z.boolean().describe('Whether the bug was reproduced in tests'),
  testRunOutput: z.string().optional().describe('Output from npm test'),
  ...docProtocolFields,
}).passthrough();

// Register test-gen schemas
registerPhaseSchema('new-feature', 'test-gen', 'TDD Red Phase', testGenNewFeatureSchema);
registerPhaseSchema('bug-fix', 'test-gen', 'Regression Tests', testGenBugFixSchema);
