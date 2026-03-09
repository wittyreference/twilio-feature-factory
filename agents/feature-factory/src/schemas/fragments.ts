// ABOUTME: Shared composable Zod schema fragments for phase output validation.
// ABOUTME: Reusable pieces used across multiple agent schemas.

import { z } from 'zod';

/**
 * Verdict for QA phases: PASSED, NEEDS_ATTENTION, or FAILED
 */
export const qaVerdictSchema = z.enum(['PASSED', 'NEEDS_ATTENTION', 'FAILED']);

/**
 * Verdict for review phases: APPROVED, NEEDS_CHANGES, or REJECTED
 */
export const reviewVerdictSchema = z.enum(['APPROVED', 'NEEDS_CHANGES', 'REJECTED']);

/**
 * Test result fields common to test-gen, dev, and QA outputs
 */
export const testResultFields = {
  testsRun: z.number().optional().describe('Total tests executed'),
  testsPassed: z.number().optional().describe('Passing tests'),
  testsFailed: z.number().optional().describe('Failing tests'),
  testOutput: z.string().optional().describe('Relevant test output excerpt'),
  testRunOutput: z.string().optional().describe('Full npm test output'),
};

/**
 * Reference to a test file created by test-gen
 */
export const testFileRefSchema = z.object({
  path: z.string().optional().describe('File path'),
  description: z.string().optional().describe('What this test file covers'),
  name: z.string().optional().describe('Test file name'),
}).passthrough();

/**
 * Coverage gap identified by QA
 */
export const coverageGapSchema = z.object({
  file: z.string().optional().describe('File path'),
  coverage: z.number().optional().describe('Coverage percentage'),
  recommendation: z.string().optional().describe('How to improve coverage'),
}).passthrough();

/**
 * Security issue found during QA or review
 */
export const securityIssueSchema = z.object({
  severity: z.string().optional().describe('critical, high, medium, low'),
  description: z.string().optional().describe('Issue description'),
  location: z.string().optional().describe('File and line'),
  recommendation: z.string().optional().describe('Fix suggestion'),
}).passthrough();

/**
 * Review issue found during code review
 */
export const reviewIssueSchema = z.object({
  severity: z.string().optional().describe('critical, major, minor, suggestion'),
  description: z.string().optional().describe('Issue description'),
  file: z.string().optional().describe('File path'),
  line: z.number().optional().describe('Line number'),
}).passthrough();

/**
 * Documentation protocol fields shared across agents
 */
export const docProtocolFields = {
  docsConsulted: z.array(z.string()).optional().describe('CLAUDE.md files reviewed'),
  learningsToCapture: z.array(z.string()).optional().describe('Discoveries to record'),
  docsToUpdate: z.array(z.string()).optional().describe('Docs needing updates'),
};

/**
 * File tracking fields shared across dev-like agents
 */
export const fileTrackingFields = {
  filesCreated: z.array(z.string()).optional().describe('Created file paths'),
  filesModified: z.array(z.string()).optional().describe('Modified file paths'),
  commits: z.array(z.string()).optional().describe('Commit hashes'),
};
