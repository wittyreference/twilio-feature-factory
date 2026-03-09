// ABOUTME: Zod schemas for review agent phase outputs.
// ABOUTME: 3 variants: new-feature (Code Review), bug-fix (Fix Review), refactor (Code Quality Review).

import { z } from 'zod';
import { registerPhaseSchema } from './registry.js';
import { reviewVerdictSchema, reviewIssueSchema, docProtocolFields } from './fragments.js';

/**
 * Shared review output fields
 */
const sharedReviewFields = {
  verdict: reviewVerdictSchema.describe('APPROVED, NEEDS_CHANGES, or REJECTED'),
  summary: z.string().optional().describe('Brief review summary'),
  issues: z.array(reviewIssueSchema).optional().describe('Issues found'),
  securityConcerns: z.array(z.string()).optional().describe('Security-related findings'),
  suggestions: z.array(z.string()).optional().describe('Optional improvements'),
  approvedToMerge: z.boolean().optional().describe('Can code be merged'),
  docComplianceVerified: z.boolean().optional().describe('Whether agents consulted docs properly'),
  ...docProtocolFields,
};

/**
 * new-feature: Code Review
 * Validates: verdict === 'APPROVED'
 * nextPhaseInput accesses: verdict, summary, issues
 */
export const reviewNewFeatureSchema = z.object({
  ...sharedReviewFields,
}).passthrough();

/**
 * bug-fix: Fix Review
 * Validates: verdict === 'APPROVED' && isMinimalFix === true
 * nextPhaseInput accesses: verdict, summary, issues, isMinimalFix
 */
export const reviewBugFixSchema = z.object({
  ...sharedReviewFields,
  isMinimalFix: z.boolean().describe('Whether the fix is minimal and targeted'),
}).passthrough();

/**
 * refactor: Code Quality Review
 * Validates: verdict === 'APPROVED' && improvementsValidated === true
 * nextPhaseInput accesses: verdict, summary, improvementsValidated, issues
 */
export const reviewRefactorSchema = z.object({
  ...sharedReviewFields,
  improvementsValidated: z.boolean().describe('Whether improvements were validated'),
}).passthrough();

// Register review schemas
registerPhaseSchema('new-feature', 'review', 'Code Review', reviewNewFeatureSchema);
registerPhaseSchema('bug-fix', 'review', 'Fix Review', reviewBugFixSchema);
registerPhaseSchema('refactor', 'review', 'Code Quality Review', reviewRefactorSchema);
