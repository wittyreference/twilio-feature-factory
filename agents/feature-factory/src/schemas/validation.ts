// ABOUTME: Advisory validation for phase outputs using Zod schemas.
// ABOUTME: Never blocks workflows — logs results for observability.

import { getPhaseSchema } from './registry.js';
import type { PhaseOutputValidation } from '../types.js';
import type { WorkflowType, AgentType } from '../types.js';

/**
 * Validate a phase output against its registered schema.
 * Advisory only — never throws, always returns a result.
 *
 * @param output - The parsed agent output
 * @param workflowType - The workflow being executed
 * @param agent - The agent that produced the output
 * @param phaseName - The phase name (handles agents appearing multiple times)
 * @returns Validation result with errors if any
 */
export function validatePhaseOutput(
  output: Record<string, unknown>,
  workflowType: WorkflowType,
  agent: AgentType,
  phaseName: string
): PhaseOutputValidation {
  const schema = getPhaseSchema(workflowType, agent, phaseName);

  if (!schema) {
    return {
      valid: true,
      errors: [],
      schemaKey: `${workflowType}:${agent}:${phaseName}`,
      skipped: true,
    };
  }

  const result = schema.safeParse(output);

  if (result.success) {
    return {
      valid: true,
      errors: [],
      schemaKey: `${workflowType}:${agent}:${phaseName}`,
    };
  }

  return {
    valid: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
    schemaKey: `${workflowType}:${agent}:${phaseName}`,
  };
}
