// ABOUTME: Git checkpoint operations for Feature Factory phase rollback.
// ABOUTME: Creates lightweight tags before phases, enables surgical rollback on failure.

import { execSync } from 'child_process';

/**
 * Result from a checkpoint operation
 */
export interface CheckpointResult {
  success: boolean;
  tagName?: string;
  commitHash?: string;
  skipped?: boolean;   // true if not a git repo or checkpoints disabled
  error?: string;
}

/**
 * Sanitize a phase name into a URL-safe slug for git tag names.
 * Lowercase, replace non-alphanumeric with hyphens, collapse consecutive, strip edges.
 */
export function sanitizePhaseSlug(phaseName: string): string {
  return phaseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Create a git checkpoint tag at HEAD before a phase runs.
 * Tag format: ff-checkpoint/<sessionId>/pre-<phaseIndex>-<phase-slug>
 */
export function createCheckpoint(options: {
  workingDirectory: string;
  sessionId: string;
  phaseName: string;
  phaseIndex: number;
}): CheckpointResult {
  const { workingDirectory, sessionId, phaseName, phaseIndex } = options;

  // Check if this is a git repository
  try {
    execSync('git rev-parse --git-dir', {
      cwd: workingDirectory,
      stdio: 'pipe',
    });
  } catch {
    return { success: false, skipped: true, error: 'Not a git repository' };
  }

  const slug = sanitizePhaseSlug(phaseName);
  const tagName = `ff-checkpoint/${sessionId}/pre-${phaseIndex}-${slug}`;

  // Check if tag already exists
  try {
    execSync(`git rev-parse --verify refs/tags/${tagName}`, {
      cwd: workingDirectory,
      stdio: 'pipe',
    });
    // Tag exists — skip
    const commitHash = execSync('git rev-parse HEAD', {
      cwd: workingDirectory,
      stdio: 'pipe',
    }).toString().trim();
    return { success: true, tagName, commitHash };
  } catch {
    // Tag doesn't exist — create it
  }

  try {
    const commitHash = execSync('git rev-parse HEAD', {
      cwd: workingDirectory,
      stdio: 'pipe',
    }).toString().trim();

    execSync(`git tag ${tagName}`, {
      cwd: workingDirectory,
      stdio: 'pipe',
    });

    return { success: true, tagName, commitHash };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create checkpoint',
    };
  }
}

/**
 * Roll back working tree to a checkpoint tag.
 * Uses git reset --hard + git clean -fd (preserves gitignored files).
 */
export function rollbackToCheckpoint(options: {
  workingDirectory: string;
  tagName: string;
}): { success: boolean; error?: string } {
  const { workingDirectory, tagName } = options;

  try {
    execSync(`git reset --hard ${tagName}`, {
      cwd: workingDirectory,
      stdio: 'pipe',
    });

    execSync('git clean -fd', {
      cwd: workingDirectory,
      stdio: 'pipe',
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Rollback failed',
    };
  }
}

/**
 * Delete all checkpoint tags for a session.
 */
export function cleanupCheckpoints(options: {
  workingDirectory: string;
  sessionId: string;
}): { deleted: string[] } {
  const { workingDirectory, sessionId } = options;
  const tags = listCheckpoints({ workingDirectory, sessionId });
  const deleted: string[] = [];

  for (const tag of tags) {
    try {
      execSync(`git tag -d ${tag}`, {
        cwd: workingDirectory,
        stdio: 'pipe',
      });
      deleted.push(tag);
    } catch {
      // Skip tags that can't be deleted
    }
  }

  return { deleted };
}

/**
 * List all checkpoint tags for a session.
 */
export function listCheckpoints(options: {
  workingDirectory: string;
  sessionId: string;
}): string[] {
  const { workingDirectory, sessionId } = options;

  try {
    const output = execSync(`git tag -l "ff-checkpoint/${sessionId}/*"`, {
      cwd: workingDirectory,
      stdio: 'pipe',
    }).toString().trim();

    if (!output) {
      return [];
    }

    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
