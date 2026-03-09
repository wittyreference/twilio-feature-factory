// ABOUTME: Zod schema for docs agent phase output.
// ABOUTME: 1 variant: new-feature (Documentation).

import { z } from 'zod';
import { registerPhaseSchema } from './registry.js';
import { docProtocolFields } from './fragments.js';

/**
 * new-feature: Documentation
 * Validates: aboutMeVerified === true
 * No nextPhaseInput (final phase)
 */
export const docsNewFeatureSchema = z.object({
  filesUpdated: z.array(z.string()).optional().describe('Documentation files updated'),
  readmeUpdated: z.boolean().optional().describe('Whether README was updated'),
  claudeMdUpdates: z.array(z.string()).optional().describe('CLAUDE.md files updated'),
  aboutMeVerified: z.boolean().describe('All files have ABOUTME'),
  examplesAdded: z.array(z.string()).optional().describe('Examples added'),
  learningsCaptured: z.number().optional().describe('Count of learnings written'),
  ...docProtocolFields,
}).passthrough();

// Register docs schema
registerPhaseSchema('new-feature', 'docs', 'Documentation', docsNewFeatureSchema);
