// ABOUTME: Zod schema for spec agent phase output.
// ABOUTME: 1 variant: new-feature (Specification).

import { z } from 'zod';
import { registerPhaseSchema } from './registry.js';
import { docProtocolFields } from './fragments.js';

/**
 * new-feature: Specification
 * Validates: functionSpecs is non-empty array && testScenarios defined
 * nextPhaseInput accesses: specification (full output), functionSpecs, testScenarios
 */
export const specNewFeatureSchema = z.object({
  overview: z.string().optional().describe('High-level feature description'),
  userStories: z.array(z.record(z.unknown())).optional().describe('User stories with acceptance criteria'),
  functionSpecs: z.array(z.record(z.unknown())).describe('Detailed function specifications'),
  testScenarios: z.record(z.unknown()).describe('Test scenarios by category'),
  dependencies: z.array(z.string()).optional().describe('External dependencies'),
  assumptions: z.array(z.string()).optional().describe('Assumptions made'),
  voiceAiSpecs: z.record(z.unknown()).optional().describe('Voice AI specifications (if applicable)'),
  ...docProtocolFields,
}).passthrough();

// Register spec schema
registerPhaseSchema('new-feature', 'spec', 'Specification', specNewFeatureSchema);
