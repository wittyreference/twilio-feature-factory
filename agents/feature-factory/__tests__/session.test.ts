// ABOUTME: Unit tests for session persistence module.
// ABOUTME: Tests save, load, list, delete, and cleanup operations.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  generateSessionId,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  cleanupSessions,
  getResumableSession,
} from '../src/session.js';
import type { WorkflowState } from '../src/types.js';

describe('Session Persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test sessions
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-session-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      const id3 = generateSessionId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate IDs in expected format', () => {
      const id = generateSessionId();
      // Format: timestamp-random (e.g., "m1abc-1234abcd")
      expect(id).toMatch(/^[a-z0-9]+-[a-f0-9]+$/);
    });
  });

  describe('saveSession and loadSession', () => {
    it('should save and load a session', () => {
      const sessionId = generateSessionId();
      const state: WorkflowState = {
        sessionId,
        workflow: 'new-feature',
        description: 'Test feature',
        currentPhaseIndex: 1,
        status: 'running',
        phaseResults: {},
        totalCostUsd: 0.05,
        totalTurns: 10,
        startedAt: new Date('2026-01-25T10:00:00Z'),
      };

      saveSession(state, tempDir);

      const loaded = loadSession(tempDir, sessionId);

      expect(loaded).not.toBeNull();
      expect(loaded!.state.sessionId).toBe(sessionId);
      expect(loaded!.state.workflow).toBe('new-feature');
      expect(loaded!.state.description).toBe('Test feature');
      expect(loaded!.state.currentPhaseIndex).toBe(1);
      expect(loaded!.state.status).toBe('running');
      expect(loaded!.state.totalCostUsd).toBe(0.05);
      expect(loaded!.state.totalTurns).toBe(10);
      expect(loaded!.state.startedAt).toBeInstanceOf(Date);
    });

    it('should create sessions directory if it does not exist', () => {
      const subDir = path.join(tempDir, 'nested', 'dir');
      const sessionId = generateSessionId();
      const state: WorkflowState = {
        sessionId,
        workflow: 'new-feature',
        description: 'Test',
        currentPhaseIndex: 0,
        status: 'running',
        phaseResults: {},
        totalCostUsd: 0,
        totalTurns: 0,
        startedAt: new Date(),
      };

      saveSession(state, subDir);

      expect(fs.existsSync(path.join(subDir, '.feature-factory', 'sessions'))).toBe(true);
    });

    it('should return null for non-existent session', () => {
      const loaded = loadSession(tempDir, 'non-existent-id');
      expect(loaded).toBeNull();
    });

    it('should preserve completedAt date when present', () => {
      const sessionId = generateSessionId();
      const completedAt = new Date('2026-01-25T12:00:00Z');
      const state: WorkflowState = {
        sessionId,
        workflow: 'new-feature',
        description: 'Completed test',
        currentPhaseIndex: 5,
        status: 'completed',
        phaseResults: {},
        totalCostUsd: 1.5,
        totalTurns: 50,
        startedAt: new Date('2026-01-25T10:00:00Z'),
        completedAt,
      };

      saveSession(state, tempDir);
      const loaded = loadSession(tempDir, sessionId);

      expect(loaded!.state.completedAt).toBeInstanceOf(Date);
      expect(loaded!.state.completedAt!.toISOString()).toBe(completedAt.toISOString());
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', () => {
      const sessions = listSessions(tempDir);
      expect(sessions).toEqual([]);
    });

    it('should list all sessions sorted by lastUpdatedAt descending', () => {
      // Create sessions with different timestamps by manually setting lastUpdatedAt
      const sessionsDir = path.join(tempDir, '.feature-factory', 'sessions');

      const sessions = [
        { id: generateSessionId(), desc: 'First', daysAgo: 3 },
        { id: generateSessionId(), desc: 'Second', daysAgo: 2 },
        { id: generateSessionId(), desc: 'Third', daysAgo: 1 },
      ];

      for (const s of sessions) {
        const state: WorkflowState = {
          sessionId: s.id,
          workflow: 'new-feature',
          description: s.desc,
          currentPhaseIndex: 0,
          status: 'running',
          phaseResults: {},
          totalCostUsd: 0,
          totalTurns: 0,
          startedAt: new Date(),
        };
        saveSession(state, tempDir);

        // Manually update lastUpdatedAt to control sorting
        const sessionPath = path.join(sessionsDir, `${s.id}.json`);
        const content = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
        content.metadata.lastUpdatedAt = new Date(Date.now() - s.daysAgo * 24 * 60 * 60 * 1000).toISOString();
        fs.writeFileSync(sessionPath, JSON.stringify(content));
      }

      const listed = listSessions(tempDir);

      expect(listed).toHaveLength(3);
      // Most recent should be first (Third has smallest daysAgo = most recent)
      expect(listed[0].description).toBe('Third');
      expect(listed[1].description).toBe('Second');
      expect(listed[2].description).toBe('First');
    });

    it('should include correct summary information', () => {
      const sessionId = generateSessionId();
      const state: WorkflowState = {
        sessionId,
        workflow: 'bug-fix',
        description: 'Fix important bug',
        currentPhaseIndex: 2,
        status: 'awaiting-approval',
        phaseResults: {},
        totalCostUsd: 0.75,
        totalTurns: 25,
        startedAt: new Date(),
      };

      saveSession(state, tempDir);
      const listed = listSessions(tempDir);

      expect(listed).toHaveLength(1);
      expect(listed[0].sessionId).toBe(sessionId);
      expect(listed[0].workflow).toBe('bug-fix');
      expect(listed[0].description).toBe('Fix important bug');
      expect(listed[0].status).toBe('awaiting-approval');
      expect(listed[0].currentPhase).toBe(2);
      expect(listed[0].totalCostUsd).toBe(0.75);
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session', () => {
      const sessionId = generateSessionId();
      const state: WorkflowState = {
        sessionId,
        workflow: 'new-feature',
        description: 'To delete',
        currentPhaseIndex: 0,
        status: 'cancelled',
        phaseResults: {},
        totalCostUsd: 0,
        totalTurns: 0,
        startedAt: new Date(),
      };

      saveSession(state, tempDir);
      expect(listSessions(tempDir)).toHaveLength(1);

      const deleted = deleteSession(tempDir, sessionId);

      expect(deleted).toBe(true);
      expect(listSessions(tempDir)).toHaveLength(0);
    });

    it('should return false for non-existent session', () => {
      const deleted = deleteSession(tempDir, 'non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('cleanupSessions', () => {
    it('should clean up old completed sessions', () => {
      // Create an old completed session
      const oldSessionId = generateSessionId();
      const oldState: WorkflowState = {
        sessionId: oldSessionId,
        workflow: 'new-feature',
        description: 'Old completed',
        currentPhaseIndex: 5,
        status: 'completed',
        phaseResults: {},
        totalCostUsd: 1.0,
        totalTurns: 30,
        startedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };
      saveSession(oldState, tempDir);

      // Manually set the lastUpdatedAt to be old by editing the file
      const sessionPath = path.join(tempDir, '.feature-factory', 'sessions', `${oldSessionId}.json`);
      const content = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
      content.metadata.lastUpdatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(sessionPath, JSON.stringify(content));

      // Create a recent session
      const recentSessionId = generateSessionId();
      const recentState: WorkflowState = {
        sessionId: recentSessionId,
        workflow: 'new-feature',
        description: 'Recent running',
        currentPhaseIndex: 1,
        status: 'running',
        phaseResults: {},
        totalCostUsd: 0.5,
        totalTurns: 15,
        startedAt: new Date(),
      };
      saveSession(recentState, tempDir);

      expect(listSessions(tempDir)).toHaveLength(2);

      const deleted = cleanupSessions(tempDir, { olderThanDays: 7, includeCompleted: true });

      expect(deleted).toBe(1);
      expect(listSessions(tempDir)).toHaveLength(1);
      expect(listSessions(tempDir)[0].sessionId).toBe(recentSessionId);
    });
  });

  describe('getResumableSession', () => {
    it('should return null when no resumable sessions exist', () => {
      const resumable = getResumableSession(tempDir);
      expect(resumable).toBeNull();
    });

    it('should return most recent running session', () => {
      // Create a completed session
      const completedId = generateSessionId();
      saveSession({
        sessionId: completedId,
        workflow: 'new-feature',
        description: 'Completed',
        currentPhaseIndex: 5,
        status: 'completed',
        phaseResults: {},
        totalCostUsd: 1.0,
        totalTurns: 30,
        startedAt: new Date(Date.now() - 1000),
      }, tempDir);

      // Create a running session
      const runningId = generateSessionId();
      saveSession({
        sessionId: runningId,
        workflow: 'new-feature',
        description: 'Running',
        currentPhaseIndex: 2,
        status: 'running',
        phaseResults: {},
        totalCostUsd: 0.5,
        totalTurns: 15,
        startedAt: new Date(),
      }, tempDir);

      const resumable = getResumableSession(tempDir);

      expect(resumable).not.toBeNull();
      expect(resumable!.state.sessionId).toBe(runningId);
      expect(resumable!.state.status).toBe('running');
    });

    it('should return awaiting-approval session as resumable', () => {
      const awaitingId = generateSessionId();
      saveSession({
        sessionId: awaitingId,
        workflow: 'new-feature',
        description: 'Awaiting approval',
        currentPhaseIndex: 3,
        status: 'awaiting-approval',
        phaseResults: {},
        totalCostUsd: 0.75,
        totalTurns: 20,
        startedAt: new Date(),
      }, tempDir);

      const resumable = getResumableSession(tempDir);

      expect(resumable).not.toBeNull();
      expect(resumable!.state.status).toBe('awaiting-approval');
    });
  });
});
