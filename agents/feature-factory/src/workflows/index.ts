// ABOUTME: Workflow configuration index for Feature Factory.
// ABOUTME: Exports all workflow definitions and provides lookup function.

import type { Workflow, WorkflowType } from '../types.js';
import { newFeatureWorkflow } from './new-feature.js';

/**
 * All available workflow definitions
 */
export const workflows: Record<WorkflowType, Workflow> = {
  'new-feature': newFeatureWorkflow,
  // Planned workflows (not yet implemented)
  'bug-fix': {
    name: 'bug-fix',
    description: 'Bug fix pipeline (not yet implemented)',
    phases: [],
  },
  refactor: {
    name: 'refactor',
    description: 'Refactoring pipeline (not yet implemented)',
    phases: [],
  },
};

/**
 * Get workflow definition by type
 */
export function getWorkflow(workflowType: WorkflowType): Workflow {
  const workflow = workflows[workflowType];
  if (!workflow) {
    throw new Error(`Unknown workflow type: ${workflowType}`);
  }
  if (workflow.phases.length === 0) {
    throw new Error(`Workflow '${workflowType}' is not yet implemented`);
  }
  return workflow;
}

export { newFeatureWorkflow };
