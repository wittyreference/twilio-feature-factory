// ABOUTME: Work discovery interface for autonomous agent workflows.
// ABOUTME: Defines types for discovered work from validation failures and other sources.

/**
 * Root cause category (mirrors DiagnosticBridge types).
 */
export type RootCauseCategory =
  | 'configuration'
  | 'environment'
  | 'timing'
  | 'external'
  | 'code'
  | 'unknown';

/**
 * Fix action type (mirrors DiagnosticBridge types).
 */
export type FixActionType = 'config' | 'code' | 'wait' | 'escalate';

/**
 * Diagnosis structure (mirrors DiagnosticBridge Diagnosis interface).
 * Defined locally to avoid cross-package TypeScript compilation issues.
 */
export interface Diagnosis {
  patternId: string;
  summary: string;
  rootCause: {
    category: RootCauseCategory;
    description: string;
    confidence: number;
  };
  evidence: Array<{
    source: string;
    data: unknown;
    relevance: 'primary' | 'supporting';
  }>;
  suggestedFixes: Array<{
    description: string;
    actionType: FixActionType;
    confidence: number;
    automated: boolean;
    steps?: string[];
  }>;
  isKnownPattern: boolean;
  previousOccurrences: number;
  validationResult: {
    success: boolean;
    resourceSid: string;
    resourceType: string;
    primaryStatus: string;
    checks: Record<string, unknown>;
    errors: string[];
    warnings: string[];
    duration: number;
  };
  timestamp: Date;
}

/**
 * Source of discovered work.
 */
export type WorkSource =
  | 'validation-failure'  // From DeepValidator validation failure event
  | 'debugger-alert'      // From Twilio debugger logs
  | 'user-request'        // Explicit user request
  | 'scheduled'           // Scheduled maintenance/checks
  | 'webhook-error';      // From function execution errors

/**
 * Priority level for discovered work.
 */
export type WorkPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Suggested workflow to handle the work.
 */
export type SuggestedWorkflow = 'bug-fix' | 'refactor' | 'new-feature' | 'investigation' | 'manual-review';

/**
 * Tier classification for autonomous handling.
 * Tier 1-2: Can be auto-handled without human intervention
 * Tier 3-4: Requires human approval or manual handling
 */
export type AutomationTier = 1 | 2 | 3 | 4;

/**
 * Work item discovered by the autonomous system.
 */
export interface DiscoveredWork {
  /** Unique identifier for this work item */
  id: string;

  /** When the work was discovered */
  discoveredAt: Date;

  /** Source that discovered this work */
  source: WorkSource;

  /** Priority level */
  priority: WorkPriority;

  /** Automation tier (1-2 auto, 3-4 human) */
  tier: AutomationTier;

  /** Suggested workflow to handle this */
  suggestedWorkflow: SuggestedWorkflow;

  /** Human-readable summary */
  summary: string;

  /** Detailed description of the work needed */
  description: string;

  /** Diagnosis from DiagnosticBridge (if from validation failure) */
  diagnosis?: Diagnosis;

  /** Related resource SIDs */
  resourceSids?: string[];

  /** Tags for categorization */
  tags?: string[];

  /** Current status */
  status: 'pending' | 'in-progress' | 'completed' | 'escalated' | 'deferred';

  /** Agent or human assigned to this work */
  assignedTo?: string;

  /** Timestamp when work was started */
  startedAt?: Date;

  /** Timestamp when work was completed */
  completedAt?: Date;

  /** Resolution notes */
  resolution?: string;
}

/**
 * Configuration for work discovery.
 */
export interface WorkDiscoveryConfig {
  /** Enable automatic work discovery. Default: true */
  enabled?: boolean;

  /** Poll interval in milliseconds. Default: 60000 (1 minute) */
  pollInterval?: number;

  /** Maximum items to queue. Default: 100 */
  maxQueueSize?: number;

  /** Auto-handle tiers 1-2 without human approval. Default: false */
  autoHandleLowTier?: boolean;

  /** Sources to monitor. Default: all sources */
  enabledSources?: WorkSource[];

  /** Minimum priority to process. Default: 'low' */
  minPriority?: WorkPriority;
}

/**
 * Determines the priority based on diagnosis.
 */
export function determinePriority(diagnosis: Diagnosis): WorkPriority {
  // Critical: Authentication, configuration errors that block operations
  if (diagnosis.rootCause.category === 'configuration' && diagnosis.rootCause.confidence > 0.8) {
    return 'critical';
  }

  // High: Code errors, webhook failures
  if (diagnosis.rootCause.category === 'code') {
    return 'high';
  }

  // Medium: External/carrier issues, timing issues
  if (diagnosis.rootCause.category === 'external' || diagnosis.rootCause.category === 'timing') {
    return 'medium';
  }

  // Low: Unknown issues, low confidence diagnoses
  return 'low';
}

/**
 * Determines the automation tier based on diagnosis.
 * Tier 1: Simple config fix (auto-handle)
 * Tier 2: Code fix with high confidence (auto-handle)
 * Tier 3: Complex issue requiring human review
 * Tier 4: External/unknown requiring manual intervention
 */
export function determineAutomationTier(diagnosis: Diagnosis): AutomationTier {
  const { category, confidence } = diagnosis.rootCause;
  const hasAutomatedFix = diagnosis.suggestedFixes.some(
    (f: { automated: boolean; confidence: number }) => f.automated && f.confidence > 0.7
  );

  // Tier 1: Simple config fix with high confidence automated fix
  if (category === 'configuration' && hasAutomatedFix && confidence > 0.8) {
    return 1;
  }

  // Tier 2: Code fix with medium-high confidence
  if (category === 'code' && hasAutomatedFix && confidence > 0.6) {
    return 2;
  }

  // Tier 3: Requires human review but has fix suggestions
  if (diagnosis.suggestedFixes.length > 0 && confidence > 0.5) {
    return 3;
  }

  // Tier 4: External issues or unknown - requires manual intervention
  return 4;
}

/**
 * Suggests a workflow based on diagnosis.
 */
export function suggestWorkflow(diagnosis: Diagnosis): SuggestedWorkflow {
  const { category } = diagnosis.rootCause;

  switch (category) {
    case 'configuration':
      return 'bug-fix'; // Config issues are usually simple fixes

    case 'code':
      // Check if it's a structural issue (case-insensitive check)
      if (diagnosis.suggestedFixes.some((f: { description: string }) => f.description.toLowerCase().includes('refactor'))) {
        return 'refactor';
      }
      return 'bug-fix';

    case 'timing':
      return 'investigation'; // Need to understand why timing is off

    case 'external':
      return 'manual-review'; // Can't fix carrier/external issues programmatically

    case 'unknown':
    default:
      return 'investigation';
  }
}

/**
 * Creates a DiscoveredWork item from a validation failure event.
 */
export function createWorkFromValidation(
  diagnosis: Diagnosis,
  source: WorkSource = 'validation-failure'
): DiscoveredWork {
  const priority = determinePriority(diagnosis);
  const tier = determineAutomationTier(diagnosis);
  const workflow = suggestWorkflow(diagnosis);

  return {
    id: `work-${diagnosis.patternId}-${Date.now()}`,
    discoveredAt: new Date(),
    source,
    priority,
    tier,
    suggestedWorkflow: workflow,
    summary: diagnosis.summary,
    description: formatWorkDescription(diagnosis),
    diagnosis,
    resourceSids: extractResourceSids(diagnosis),
    tags: [diagnosis.rootCause.category, workflow],
    status: 'pending',
  };
}

/**
 * Formats a detailed work description from diagnosis.
 */
function formatWorkDescription(diagnosis: Diagnosis): string {
  const lines: string[] = [
    `**Root Cause**: ${diagnosis.rootCause.description}`,
    `**Category**: ${diagnosis.rootCause.category}`,
    `**Confidence**: ${(diagnosis.rootCause.confidence * 100).toFixed(0)}%`,
    '',
    '**Evidence**:',
    ...diagnosis.evidence.map((e: { source: string; relevance: string }) => `- ${e.source}: ${e.relevance}`),
    '',
    '**Suggested Fixes**:',
    ...diagnosis.suggestedFixes.map(
      (f: { actionType: string; description: string; confidence: number; automated: boolean }) =>
        `- [${f.actionType}] ${f.description} (confidence: ${(f.confidence * 100).toFixed(0)}%, automated: ${f.automated})`
    ),
  ];

  if (diagnosis.isKnownPattern) {
    lines.push('', `**Note**: This is a known pattern (seen ${diagnosis.previousOccurrences} times before)`);
  }

  return lines.join('\n');
}

/**
 * Extracts resource SIDs from diagnosis.
 */
function extractResourceSids(diagnosis: Diagnosis): string[] {
  const sids: string[] = [];

  // From validation result
  if (diagnosis.validationResult.resourceSid) {
    sids.push(diagnosis.validationResult.resourceSid);
  }

  // From evidence
  for (const evidence of diagnosis.evidence) {
    if (typeof evidence.data === 'object' && evidence.data !== null) {
      const data = evidence.data as Record<string, unknown>;
      for (const key of ['sid', 'resourceSid', 'callSid', 'messageSid']) {
        if (typeof data[key] === 'string' && data[key]) {
          sids.push(data[key] as string);
        }
      }
    }
  }

  return [...new Set(sids)]; // Deduplicate
}
