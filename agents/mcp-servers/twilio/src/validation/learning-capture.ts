// ABOUTME: Auto-captures learnings from validation failures to learnings.md.
// ABOUTME: Formats Diagnosis into learnings.md entries with promotion targets.

import * as fs from 'fs';
import * as path from 'path';
import type { Diagnosis, RootCauseCategory } from './diagnostic-bridge';

/**
 * Learning entry ready for capture.
 */
export interface LearningEntry {
  /** When the learning was captured */
  timestamp: Date;

  /** Session identifier */
  sessionId: string;

  /** Pattern ID from diagnosis */
  patternId: string;

  /** Human-readable title for learnings.md */
  title: string;

  /** What was attempted */
  attemptedAction: string;

  /** What actually happened */
  actualResult: string;

  /** Correct approach or fix */
  correctApproach: string;

  /** Which documentation file this should be promoted to */
  promotionTarget: string;

  /** Whether this has been promoted */
  promoted: boolean;
}

/**
 * Configuration for learning capture.
 */
export interface LearningCaptureConfig {
  /** Path to learnings file. Default determined by environment. */
  learningsPath?: string;

  /** Session identifier for grouping. Default: timestamp-based */
  sessionId?: string;

  /** Whether to trigger flywheel after capture. Default: false */
  triggerFlywheel?: boolean;

  /** Custom date for testing. Default: current date */
  date?: Date;
}

/**
 * Maps root cause category to documentation target.
 */
function getPromotionTarget(category: RootCauseCategory, resourceType: string): string {
  const targets: Record<RootCauseCategory, string> = {
    configuration: 'Root CLAUDE.md (Environment Variables section)',
    environment: 'DESIGN_DECISIONS.md (Infrastructure section)',
    timing: 'agents/mcp-servers/twilio/src/validation/CLAUDE.md',
    external: 'functions/messaging/CLAUDE.md or functions/voice/CLAUDE.md',
    code: resourceType === 'call'
      ? 'functions/voice/CLAUDE.md'
      : resourceType === 'message'
        ? 'functions/messaging/CLAUDE.md'
        : `functions/${resourceType}/CLAUDE.md`,
    unknown: 'DESIGN_DECISIONS.md (Gotchas section)',
  };

  return targets[category];
}

/**
 * Formats a Diagnosis into a LearningEntry.
 */
export function formatLearningEntry(
  diagnosis: Diagnosis,
  sessionId: string
): LearningEntry {
  // Extract the most relevant fix suggestion
  const topFix = diagnosis.suggestedFixes[0];
  const correctApproach = topFix
    ? `${topFix.description}. Steps: ${topFix.steps?.join('; ') || 'See fix details'}`
    : 'Investigation required - no confident fix suggestion';

  // Format actual result from evidence
  const primaryEvidence = diagnosis.evidence.filter(e => e.relevance === 'primary');
  const actualResult = primaryEvidence.length > 0
    ? primaryEvidence.map(e => `${e.source}: ${JSON.stringify(e.data).slice(0, 100)}`).join('; ')
    : diagnosis.summary;

  // Get promotion target based on category
  const promotionTarget = getPromotionTarget(
    diagnosis.rootCause.category,
    diagnosis.validationResult.resourceType
  );

  return {
    timestamp: diagnosis.timestamp,
    sessionId,
    patternId: diagnosis.patternId,
    title: diagnosis.summary,
    attemptedAction: `Validate ${diagnosis.validationResult.resourceType} ${diagnosis.validationResult.resourceSid}`,
    actualResult,
    correctApproach,
    promotionTarget,
    promoted: false,
  };
}

/**
 * Formats a LearningEntry as markdown for learnings.md.
 */
export function formatLearningMarkdown(entry: LearningEntry): string {
  const dateStr = entry.timestamp.toISOString().split('T')[0];

  return `
### ${entry.title}

**Pattern ID:** \`${entry.patternId}\`

- **What was tried:** ${entry.attemptedAction}
- **What happened:** ${entry.actualResult}
- **Correct approach:** ${entry.correctApproach}
- **Promote to:** ${entry.promotionTarget}
- **Captured:** ${dateStr}
`;
}

/**
 * Determines the learnings file path based on environment.
 * Uses .meta/learnings.md if .meta/ exists, otherwise .claude/learnings.md.
 */
function getLearningsPath(projectRoot: string): string {
  const metaPath = path.join(projectRoot, '.meta', 'learnings.md');
  const claudePath = path.join(projectRoot, '.claude', 'learnings.md');

  // Check if .meta directory exists
  if (fs.existsSync(path.join(projectRoot, '.meta'))) {
    return metaPath;
  }

  return claudePath;
}

/**
 * LearningCaptureEngine - Auto-captures learnings from validation failures.
 */
export class LearningCaptureEngine {
  private config: Required<LearningCaptureConfig>;
  private projectRoot: string;

  constructor(projectRoot: string, config: LearningCaptureConfig = {}) {
    this.projectRoot = projectRoot;
    this.config = {
      learningsPath: config.learningsPath ?? getLearningsPath(projectRoot),
      sessionId: config.sessionId ?? `session-${Date.now()}`,
      triggerFlywheel: config.triggerFlywheel ?? false,
      date: config.date ?? new Date(),
    };
  }

  /**
   * Captures a learning from a diagnosis.
   * Appends to learnings.md and returns the formatted entry.
   */
  async capture(diagnosis: Diagnosis): Promise<LearningEntry> {
    const entry = formatLearningEntry(diagnosis, this.config.sessionId);
    const markdown = formatLearningMarkdown(entry);

    // Ensure directory exists
    const dir = path.dirname(this.config.learningsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if file exists and read existing content
    let existingContent = '';
    if (fs.existsSync(this.config.learningsPath)) {
      existingContent = fs.readFileSync(this.config.learningsPath, 'utf-8');
    }

    // Check if we need to add a session header
    const dateStr = this.config.date.toISOString().split('T')[0];
    const sessionHeader = `## [${dateStr}] ${this.config.sessionId} - Validation Learnings\n\n**Discoveries:**\n`;

    let newContent: string;
    if (existingContent.includes(sessionHeader)) {
      // Append to existing session
      newContent = existingContent + markdown;
    } else {
      // Start new session
      newContent = existingContent + '\n' + sessionHeader + markdown;
    }

    // Write updated content
    fs.writeFileSync(this.config.learningsPath, newContent);

    // Trigger flywheel if configured
    if (this.config.triggerFlywheel) {
      this.triggerDocFlywheel();
    }

    return entry;
  }

  /**
   * Captures multiple learnings from an array of diagnoses.
   */
  async captureAll(diagnoses: Diagnosis[]): Promise<LearningEntry[]> {
    const entries: LearningEntry[] = [];
    for (const diagnosis of diagnoses) {
      const entry = await this.capture(diagnosis);
      entries.push(entry);
    }
    return entries;
  }

  /**
   * Triggers the documentation flywheel hook.
   */
  private triggerDocFlywheel(): void {
    try {
      const { execSync } = require('child_process');
      const flywheelScript = path.join(this.projectRoot, '.claude', 'hooks', 'flywheel-doc-check.sh');

      if (fs.existsSync(flywheelScript)) {
        execSync(`bash "${flywheelScript}" --force`, {
          cwd: this.projectRoot,
          stdio: 'ignore',
        });
      }
    } catch {
      // Silently fail - flywheel is optional
    }
  }

  /**
   * Gets the path where learnings are being written.
   */
  getLearningsPath(): string {
    return this.config.learningsPath;
  }

  /**
   * Gets the current session ID.
   */
  getSessionId(): string {
    return this.config.sessionId;
  }

  /**
   * Reads all learnings from the file.
   * Returns the raw markdown content.
   */
  readLearnings(): string {
    if (fs.existsSync(this.config.learningsPath)) {
      return fs.readFileSync(this.config.learningsPath, 'utf-8');
    }
    return '';
  }

  /**
   * Checks if a pattern has already been captured in the current file.
   */
  hasPattern(patternId: string): boolean {
    const content = this.readLearnings();
    return content.includes(patternId);
  }
}

/**
 * Creates a LearningCaptureEngine instance.
 */
export function createLearningCaptureEngine(
  projectRoot: string,
  config?: LearningCaptureConfig
): LearningCaptureEngine {
  return new LearningCaptureEngine(projectRoot, config);
}
