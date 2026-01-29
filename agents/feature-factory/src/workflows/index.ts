// ABOUTME: Workflow configuration index for Feature Factory.
// ABOUTME: Exports all workflow definitions and provides lookup function.

import type { Workflow, WorkflowType } from '../types.js';
import { newFeatureWorkflow } from './new-feature.js';
import { bugFixWorkflow } from './bug-fix.js';
import { refactorWorkflow } from './refactor.js';

/**
 * All available workflow definitions
 */
export const workflows: Record<WorkflowType, Workflow> = {
  'new-feature': newFeatureWorkflow,
  'bug-fix': bugFixWorkflow,
  refactor: refactorWorkflow,
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
export { bugFixWorkflow };
export { refactorWorkflow };
