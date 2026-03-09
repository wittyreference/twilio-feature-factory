// ABOUTME: Zod schemas for architect agent phase outputs.
// ABOUTME: 3 variants: new-feature (Design Review), bug-fix (Root Cause Diagnosis), refactor (Refactor Review).

import { z } from 'zod';
import { registerPhaseSchema } from './registry.js';
import { docProtocolFields } from './fragments.js';

/**
 * new-feature: Design Review
 * Validates: approved === true
 * nextPhaseInput accesses: designNotes, suggestedPattern, twilioServices,
 *   filesToCreate, filesToModify, claudeMdUpdates
 */
export const architectNewFeatureSchema = z.object({
  approved: z.boolean().describe('Whether design is approved'),
  designNotes: z.string().optional().describe('Architectural analysis and recommendations'),
  suggestedPattern: z.string().optional().describe('Recommended implementation pattern'),
  twilioServices: z.array(z.string()).optional().describe('Twilio services to use'),
  filesToCreate: z.array(z.string()).optional().describe('New files to create'),
  filesToModify: z.array(z.string()).optional().describe('Existing files to modify'),
  risks: z.array(z.string()).optional().describe('Architectural concerns'),
  claudeMdUpdates: z.array(z.string()).optional().describe('CLAUDE.md files to update'),
  voiceAiConfig: z.record(z.unknown()).optional().describe('Voice AI configuration (if applicable)'),
  ...docProtocolFields,
}).passthrough();

/**
 * bug-fix: Root Cause Diagnosis
 * Validates: rootCause !== undefined && suggestedFix !== undefined
 * nextPhaseInput accesses: diagnosis, rootCause, affectedFiles,
 *   suggestedFix, riskAssessment, reproductionSteps
 */
export const architectBugFixSchema = z.object({
  diagnosis: z.string().optional().describe('Diagnosis summary'),
  rootCause: z.string().describe('Identified root cause'),
  affectedFiles: z.array(z.string()).optional().describe('Files affected by the bug'),
  suggestedFix: z.string().describe('Recommended fix approach'),
  riskAssessment: z.string().optional().describe('Risk level of the fix'),
  reproductionSteps: z.array(z.string()).optional().describe('Steps to reproduce the bug'),
  ...docProtocolFields,
}).passthrough();

/**
 * refactor: Refactor Review
 * Validates: approved === true && refactoringPlan !== undefined
 * nextPhaseInput accesses: rationale, scope, affectedFiles,
 *   expectedImprovements, risks, refactoringPlan
 */
export const architectRefactorSchema = z.object({
  approved: z.boolean().describe('Whether refactoring plan is approved'),
  rationale: z.string().optional().describe('Why refactoring is needed'),
  scope: z.string().optional().describe('Scope of refactoring'),
  affectedFiles: z.array(z.string()).optional().describe('Files to refactor'),
  expectedImprovements: z.array(z.string()).optional().describe('Expected quality improvements'),
  risks: z.array(z.string()).optional().describe('Refactoring risks'),
  refactoringPlan: z.string().describe('Detailed refactoring plan'),
  ...docProtocolFields,
}).passthrough();

// Register all architect schemas
registerPhaseSchema('new-feature', 'architect', 'Design Review', architectNewFeatureSchema);
registerPhaseSchema('bug-fix', 'architect', 'Root Cause Diagnosis', architectBugFixSchema);
registerPhaseSchema('refactor', 'architect', 'Refactor Review', architectRefactorSchema);
