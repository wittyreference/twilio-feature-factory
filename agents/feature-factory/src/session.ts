// ABOUTME: Session persistence for Feature Factory workflows.
// ABOUTME: Enables saving, loading, and resuming interrupted workflows.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { WorkflowState, PersistedSession, SessionMetadata } from './types.js';

const VERSION = '1.0.0';
const SESSIONS_DIR = '.feature-factory/sessions';

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Get the sessions directory path for a working directory
 */
function getSessionsDir(workingDirectory: string): string {
  return path.join(workingDirectory, SESSIONS_DIR);
}

/**
 * Get the session file path
 */
function getSessionPath(workingDirectory: string, sessionId: string): string {
  return path.join(getSessionsDir(workingDirectory), `${sessionId}.json`);
}

/**
 * Ensure sessions directory exists
 */
function ensureSessionsDir(workingDirectory: string): void {
  const dir = getSessionsDir(workingDirectory);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save workflow state to disk
 */
export function saveSession(
  state: WorkflowState,
  workingDirectory: string
): void {
  ensureSessionsDir(workingDirectory);

  const now = new Date().toISOString();

  const metadata: SessionMetadata = {
    sessionId: state.sessionId,
    createdAt: state.startedAt.toISOString(),
    lastUpdatedAt: now,
    workingDirectory,
    version: VERSION,
  };

  const session: PersistedSession = {
    metadata,
    state: {
      ...state,
      // Serialize dates as ISO strings for JSON
      startedAt: state.startedAt,
      completedAt: state.completedAt,
    },
  };

  const sessionPath = getSessionPath(workingDirectory, state.sessionId);
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Load a session from disk
 */
export function loadSession(
  workingDirectory: string,
  sessionId: string
): PersistedSession | null {
  const sessionPath = getSessionPath(workingDirectory, sessionId);

  if (!fs.existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(sessionPath, 'utf-8');
    const session: PersistedSession = JSON.parse(content);

    // Rehydrate dates
    session.state.startedAt = new Date(session.state.startedAt);
    if (session.state.completedAt) {
      session.state.completedAt = new Date(session.state.completedAt);
    }

    return session;
  } catch (error) {
    console.error(`Failed to load session ${sessionId}:`, error);
    return null;
  }
}

/**
 * List all sessions in a working directory
 */
export function listSessions(workingDirectory: string): SessionSummary[] {
  const sessionsDir = getSessionsDir(workingDirectory);

  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
  const sessions: SessionSummary[] = [];

  for (const file of files) {
    try {
      const sessionPath = path.join(sessionsDir, file);
      const content = fs.readFileSync(sessionPath, 'utf-8');
      const session: PersistedSession = JSON.parse(content);

      sessions.push({
        sessionId: session.metadata.sessionId,
        workflow: session.state.workflow,
        description: session.state.description,
        status: session.state.status,
        currentPhase: session.state.currentPhaseIndex,
        totalCostUsd: session.state.totalCostUsd,
        createdAt: session.metadata.createdAt,
        lastUpdatedAt: session.metadata.lastUpdatedAt,
      });
    } catch {
      // Skip invalid session files
      continue;
    }
  }

  // Sort by lastUpdatedAt descending (most recent first)
  sessions.sort((a, b) =>
    new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
  );

  return sessions;
}

/**
 * Delete a session from disk
 */
export function deleteSession(
  workingDirectory: string,
  sessionId: string
): boolean {
  const sessionPath = getSessionPath(workingDirectory, sessionId);

  if (!fs.existsSync(sessionPath)) {
    return false;
  }

  try {
    fs.unlinkSync(sessionPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up old/completed sessions
 */
export function cleanupSessions(
  workingDirectory: string,
  options: CleanupOptions = {}
): number {
  const {
    olderThanDays = 7,
    includeCompleted = true,
    includeFailed = false,
  } = options;

  const sessions = listSessions(workingDirectory);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  let deletedCount = 0;

  for (const session of sessions) {
    const sessionDate = new Date(session.lastUpdatedAt);
    const isOld = sessionDate < cutoffDate;

    const shouldDelete =
      isOld &&
      ((session.status === 'completed' && includeCompleted) ||
        (session.status === 'failed' && includeFailed) ||
        session.status === 'cancelled');

    if (shouldDelete) {
      if (deleteSession(workingDirectory, session.sessionId)) {
        deletedCount++;
      }
    }
  }

  return deletedCount;
}

/**
 * Get the most recent resumable session
 */
export function getResumableSession(
  workingDirectory: string
): PersistedSession | null {
  const sessions = listSessions(workingDirectory);

  // Find most recent session that can be resumed
  const resumable = sessions.find(
    s => s.status === 'running' || s.status === 'awaiting-approval'
  );

  if (!resumable) {
    return null;
  }

  return loadSession(workingDirectory, resumable.sessionId);
}

/**
 * Summary of a session for listing
 */
export interface SessionSummary {
  sessionId: string;
  workflow: string;
  description: string;
  status: string;
  currentPhase: number;
  totalCostUsd: number;
  createdAt: string;
  lastUpdatedAt: string;
}

/**
 * Options for session cleanup
 */
export interface CleanupOptions {
  /** Delete sessions older than N days (default: 7) */
  olderThanDays?: number;
  /** Include completed sessions in cleanup (default: true) */
  includeCompleted?: boolean;
  /** Include failed sessions in cleanup (default: false) */
  includeFailed?: boolean;
}
