// ABOUTME: Unit tests for git checkpoint operations.
// ABOUTME: Tests tag creation, rollback, cleanup, and slug sanitization with real git repos.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  createCheckpoint,
  rollbackToCheckpoint,
  cleanupCheckpoints,
  listCheckpoints,
  sanitizePhaseSlug,
} from '../src/checkpoints.js';

/**
 * Create a temp directory with an initialized git repo and one commit.
 */
function createTestRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello');
  execSync('git add . && git commit -m "initial"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('sanitizePhaseSlug', () => {
  it('should lowercase and hyphenate', () => {
    expect(sanitizePhaseSlug('TDD Green Phase')).toBe('tdd-green-phase');
  });

  it('should collapse consecutive hyphens', () => {
    expect(sanitizePhaseSlug('Design -- Review')).toBe('design-review');
  });

  it('should strip leading and trailing hyphens', () => {
    expect(sanitizePhaseSlug('--Phase One--')).toBe('phase-one');
  });

  it('should handle special characters', () => {
    expect(sanitizePhaseSlug('QA (Quality & Assurance)')).toBe('qa-quality-assurance');
  });

  it('should handle empty string', () => {
    expect(sanitizePhaseSlug('')).toBe('');
  });

  it('should handle numeric-only names', () => {
    expect(sanitizePhaseSlug('Phase 1')).toBe('phase-1');
  });
});

describe('createCheckpoint', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestRepo();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create a tag at HEAD', () => {
    const result = createCheckpoint({
      workingDirectory: testDir,
      sessionId: 'sess-1',
      phaseName: 'Design Review',
      phaseIndex: 0,
    });

    expect(result.success).toBe(true);
    expect(result.tagName).toBe('ff-checkpoint/sess-1/pre-0-design-review');
    expect(result.commitHash).toBeTruthy();

    // Verify tag exists
    const tags = execSync('git tag -l', { cwd: testDir, stdio: 'pipe' }).toString().trim();
    expect(tags).toContain('ff-checkpoint/sess-1/pre-0-design-review');
  });

  it('should return correct tag name format', () => {
    const result = createCheckpoint({
      workingDirectory: testDir,
      sessionId: 'abc-123',
      phaseName: 'TDD Green Phase',
      phaseIndex: 3,
    });

    expect(result.tagName).toBe('ff-checkpoint/abc-123/pre-3-tdd-green-phase');
  });

  it('should skip non-git directory', () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'));

    const result = createCheckpoint({
      workingDirectory: nonGitDir,
      sessionId: 'sess-1',
      phaseName: 'Phase',
      phaseIndex: 0,
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);

    fs.rmSync(nonGitDir, { recursive: true, force: true });
  });

  it('should skip if tag already exists', () => {
    // Create first checkpoint
    createCheckpoint({
      workingDirectory: testDir,
      sessionId: 'sess-1',
      phaseName: 'Phase',
      phaseIndex: 0,
    });

    // Create second with same parameters — should succeed (idempotent)
    const result = createCheckpoint({
      workingDirectory: testDir,
      sessionId: 'sess-1',
      phaseName: 'Phase',
      phaseIndex: 0,
    });

    expect(result.success).toBe(true);
    expect(result.tagName).toBe('ff-checkpoint/sess-1/pre-0-phase');
  });
});

describe('rollbackToCheckpoint', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestRepo();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should restore committed changes', () => {
    // Create checkpoint
    const checkpoint = createCheckpoint({
      workingDirectory: testDir,
      sessionId: 'sess-1',
      phaseName: 'Phase',
      phaseIndex: 0,
    });

    // Make a commit after the checkpoint
    fs.writeFileSync(path.join(testDir, 'new-file.txt'), 'content');
    execSync('git add . && git commit -m "after checkpoint"', { cwd: testDir, stdio: 'pipe' });

    // Verify file exists
    expect(fs.existsSync(path.join(testDir, 'new-file.txt'))).toBe(true);

    // Rollback
    const result = rollbackToCheckpoint({
      workingDirectory: testDir,
      tagName: checkpoint.tagName!,
    });

    expect(result.success).toBe(true);
    // new-file.txt should be gone (commit was rolled back)
    expect(fs.existsSync(path.join(testDir, 'new-file.txt'))).toBe(false);
  });

  it('should remove uncommitted changes', () => {
    const checkpoint = createCheckpoint({
      workingDirectory: testDir,
      sessionId: 'sess-1',
      phaseName: 'Phase',
      phaseIndex: 0,
    });

    // Modify existing file without committing
    fs.writeFileSync(path.join(testDir, 'hello.txt'), 'modified');

    const result = rollbackToCheckpoint({
      workingDirectory: testDir,
      tagName: checkpoint.tagName!,
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(testDir, 'hello.txt'), 'utf-8')).toBe('hello');
  });

  it('should remove untracked files', () => {
    const checkpoint = createCheckpoint({
      workingDirectory: testDir,
      sessionId: 'sess-1',
      phaseName: 'Phase',
      phaseIndex: 0,
    });

    // Create untracked file
    fs.writeFileSync(path.join(testDir, 'untracked.txt'), 'data');

    const result = rollbackToCheckpoint({
      workingDirectory: testDir,
      tagName: checkpoint.tagName!,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(testDir, 'untracked.txt'))).toBe(false);
  });

  it('should preserve gitignored files', () => {
    // Set up gitignore
    fs.writeFileSync(path.join(testDir, '.gitignore'), 'node_modules/\n');
    execSync('git add . && git commit -m "add gitignore"', { cwd: testDir, stdio: 'pipe' });

    const checkpoint = createCheckpoint({
      workingDirectory: testDir,
      sessionId: 'sess-1',
      phaseName: 'Phase',
      phaseIndex: 0,
    });

    // Create gitignored directory
    fs.mkdirSync(path.join(testDir, 'node_modules'));
    fs.writeFileSync(path.join(testDir, 'node_modules', 'pkg.js'), 'module');

    // Also create untracked file
    fs.writeFileSync(path.join(testDir, 'untracked.txt'), 'data');

    const result = rollbackToCheckpoint({
      workingDirectory: testDir,
      tagName: checkpoint.tagName!,
    });

    expect(result.success).toBe(true);
    // Gitignored files preserved (clean -fd does NOT use -x)
    expect(fs.existsSync(path.join(testDir, 'node_modules', 'pkg.js'))).toBe(true);
    // Untracked (non-ignored) files removed
    expect(fs.existsSync(path.join(testDir, 'untracked.txt'))).toBe(false);
  });

  it('should fail with bad tag name', () => {
    const result = rollbackToCheckpoint({
      workingDirectory: testDir,
      tagName: 'nonexistent-tag',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('cleanupCheckpoints', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestRepo();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should remove all session tags', () => {
    createCheckpoint({ workingDirectory: testDir, sessionId: 'sess-1', phaseName: 'Phase A', phaseIndex: 0 });
    createCheckpoint({ workingDirectory: testDir, sessionId: 'sess-1', phaseName: 'Phase B', phaseIndex: 1 });

    const result = cleanupCheckpoints({ workingDirectory: testDir, sessionId: 'sess-1' });

    expect(result.deleted.length).toBe(2);

    const remaining = execSync('git tag -l', { cwd: testDir, stdio: 'pipe' }).toString().trim();
    expect(remaining).toBe('');
  });

  it('should ignore other session tags', () => {
    createCheckpoint({ workingDirectory: testDir, sessionId: 'sess-1', phaseName: 'Phase', phaseIndex: 0 });
    createCheckpoint({ workingDirectory: testDir, sessionId: 'sess-2', phaseName: 'Phase', phaseIndex: 0 });

    cleanupCheckpoints({ workingDirectory: testDir, sessionId: 'sess-1' });

    const remaining = listCheckpoints({ workingDirectory: testDir, sessionId: 'sess-2' });
    expect(remaining.length).toBe(1);
  });
});

describe('listCheckpoints', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestRepo();
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should return tags for session', () => {
    createCheckpoint({ workingDirectory: testDir, sessionId: 'sess-1', phaseName: 'Phase A', phaseIndex: 0 });
    createCheckpoint({ workingDirectory: testDir, sessionId: 'sess-1', phaseName: 'Phase B', phaseIndex: 1 });
    createCheckpoint({ workingDirectory: testDir, sessionId: 'sess-2', phaseName: 'Phase X', phaseIndex: 0 });

    const tags = listCheckpoints({ workingDirectory: testDir, sessionId: 'sess-1' });
    expect(tags.length).toBe(2);
    expect(tags).toContain('ff-checkpoint/sess-1/pre-0-phase-a');
    expect(tags).toContain('ff-checkpoint/sess-1/pre-1-phase-b');
  });

  it('should return empty array for non-existent session', () => {
    const tags = listCheckpoints({ workingDirectory: testDir, sessionId: 'no-such-session' });
    expect(tags).toEqual([]);
  });
});
