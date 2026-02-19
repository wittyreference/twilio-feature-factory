// ABOUTME: Tier-based approval policy for autonomous worker decisions.
// ABOUTME: Pure functions that route work to auto-execute, confirm, or escalate.

import type {
  DiscoveredWork,
  WorkPriority,
  WorkSource,
  AutomationTier,
} from '../discovery/work-discovery.js';

/**
 * Approval decision for a work item.
 */
export type ApprovalAction = 'auto-execute' | 'confirm' | 'escalate';

/**
 * Result of evaluating approval policy for a work item.
 */
export interface ApprovalDecision {
  /** The routing decision */
  decision: ApprovalAction;
  /** Human-readable reason for the decision */
  reason: string;
  /** The work item's tier */
  tier: AutomationTier;
  /** The work item's source */
  source: WorkSource;
}

/**
 * Approval policy configuration.
 */
export interface ApprovalPolicy {
  /** Default action per tier. */
  tierDefaults: Record<AutomationTier, ApprovalAction>;
  /** Override action by work source. Takes precedence over priorityOverrides and tierDefaults. */
  sourceOverrides?: Partial<Record<WorkSource, ApprovalAction>>;
  /** Override action by priority. Takes precedence over tierDefaults. */
  priorityOverrides?: Partial<Record<WorkPriority, ApprovalAction>>;
  /** Maximum estimated cost for auto-execute. Items above this get bumped to confirm. Default: $10. */
  maxAutoExecuteBudgetUsd: number;
}

/**
 * Options for approval evaluation.
 */
export interface ApprovalEvaluationOptions {
  /** Estimated cost of executing this work item in USD. */
  estimatedCostUsd?: number;
}

/**
 * Creates the default approval policy.
 * Tier 1-2: auto-execute, Tier 3: confirm, Tier 4: escalate.
 */
export function createDefaultPolicy(): ApprovalPolicy {
  return {
    tierDefaults: {
      1: 'auto-execute',
      2: 'auto-execute',
      3: 'confirm',
      4: 'escalate',
    },
    maxAutoExecuteBudgetUsd: 10,
  };
}

/**
 * Evaluate the approval policy for a work item.
 *
 * Override precedence: sourceOverrides > priorityOverrides > tierDefaults.
 * manual-review workflows always escalate.
 * Budget enforcement bumps auto-execute to confirm if over budget.
 */
export function evaluateApproval(
  work: DiscoveredWork,
  policy: ApprovalPolicy,
  options: ApprovalEvaluationOptions = {}
): ApprovalDecision {
  // manual-review workflows always escalate
  if (work.suggestedWorkflow === 'manual-review') {
    return {
      decision: 'escalate',
      reason: 'manual-review workflow requires human handling',
      tier: work.tier,
      source: work.source,
    };
  }

  let decision: ApprovalAction;
  let reason: string;

  // Check source overrides first (highest precedence)
  if (policy.sourceOverrides && work.source in policy.sourceOverrides) {
    decision = policy.sourceOverrides[work.source]!;
    reason = `source override: ${work.source} → ${decision}`;
  }
  // Check priority overrides next
  else if (policy.priorityOverrides && work.priority in policy.priorityOverrides) {
    decision = policy.priorityOverrides[work.priority]!;
    reason = `priority override: ${work.priority} → ${decision}`;
  }
  // Fall back to tier defaults
  else {
    decision = policy.tierDefaults[work.tier];
    reason = `tier ${work.tier} default → ${decision}`;
  }

  // Budget enforcement: bump auto-execute to confirm if over budget
  if (
    decision === 'auto-execute' &&
    options.estimatedCostUsd !== undefined &&
    options.estimatedCostUsd > policy.maxAutoExecuteBudgetUsd
  ) {
    decision = 'confirm';
    reason = `estimated cost $${options.estimatedCostUsd.toFixed(2)} exceeds auto-execute budget of $${policy.maxAutoExecuteBudgetUsd.toFixed(2)}`;
  }

  return {
    decision,
    reason,
    tier: work.tier,
    source: work.source,
  };
}
