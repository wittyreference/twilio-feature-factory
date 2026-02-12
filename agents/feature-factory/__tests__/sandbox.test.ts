// ABOUTME: Unit and integration tests for sandbox mode.
// ABOUTME: Tests sandbox lifecycle (create, copy-back, cleanup) and path validation.

import * as fs from 'fs/promises';
import { writeFileSync, existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  createSandbox,
  copyResultsBack,
  cleanupSandbox,
  ensureCleanWorkingTree,
  type SandboxInfo,
} from '../src/sandbox.js';
import { executeTool, type ToolContext } from '../src/tools.js';

// Helper: create a temporary git repo for testing
async function createTestRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(path.join(dir, 'hello.txt'), 'hello');
  execSync('git add . && git commit -m "initial"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('Sandbox Lifecycle', () => {
  let testRepoDir: string;

  beforeEach(async () => {
    testRepoDir = await createTestRepo();
  });

  afterEach(async () => {
    await fs.rm(testRepoDir, { recursive: true, force: true });
  });

  it('should create a sandbox by cloning the repo', async () => {
    const sandbox = await createSandbox({ sourceDirectory: testRepoDir });

    try {
      // Sandbox directory exists
      const stat = await fs.stat(sandbox.sandboxDirectory);
      expect(stat.isDirectory()).toBe(true);

      // Contains the cloned file
      const content = await fs.readFile(
        path.join(sandbox.sandboxDirectory, 'hello.txt'),
        'utf-8'
      );
      expect(content).toBe('hello');

      // Has a valid startCommitHash
      expect(sandbox.startCommitHash).toMatch(/^[a-f0-9]{40}$/);

      // Source directory is preserved
      expect(sandbox.sourceDirectory).toBe(testRepoDir);
    } finally {
      await cleanupSandbox(sandbox.sandboxDirectory);
    }
  });

  it('should fail on dirty working tree', async () => {
    // Make the working tree dirty
    writeFileSync(path.join(testRepoDir, 'dirty.txt'), 'uncommitted');

    await expect(
      createSandbox({ sourceDirectory: testRepoDir })
    ).rejects.toThrow('clean working tree');
  });

  it('should fail on non-git directory', async () => {
    const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-nogit-'));

    try {
      await expect(
        createSandbox({ sourceDirectory: nonGitDir })
      ).rejects.toThrow('not a git repository');
    } finally {
      await fs.rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it('should symlink node_modules when present', async () => {
    // Create node_modules in source
    const nodeModulesDir = path.join(testRepoDir, 'node_modules');
    await fs.mkdir(nodeModulesDir, { recursive: true });
    writeFileSync(path.join(nodeModulesDir, 'marker.txt'), 'exists');
    // .gitignore node_modules so the working tree stays clean
    writeFileSync(path.join(testRepoDir, '.gitignore'), 'node_modules/\n');
    execSync('git add .gitignore && git commit -m "add gitignore"', {
      cwd: testRepoDir,
      stdio: 'pipe',
    });

    const sandbox = await createSandbox({ sourceDirectory: testRepoDir });

    try {
      const sandboxNM = path.join(sandbox.sandboxDirectory, 'node_modules');
      const stat = await fs.lstat(sandboxNM);
      expect(stat.isSymbolicLink()).toBe(true);

      // Should resolve to the source node_modules
      const target = await fs.readlink(sandboxNM);
      expect(target).toBe(nodeModulesDir);
    } finally {
      await cleanupSandbox(sandbox.sandboxDirectory);
    }
  });

  describe('copyResultsBack', () => {
    it('should copy committed changes to source', async () => {
      const sandbox = await createSandbox({ sourceDirectory: testRepoDir });

      try {
        // Make and commit a change in sandbox
        writeFileSync(
          path.join(sandbox.sandboxDirectory, 'new-file.txt'),
          'created in sandbox'
        );
        execSync('git add . && git commit -m "add new file"', {
          cwd: sandbox.sandboxDirectory,
          stdio: 'pipe',
        });

        const result = await copyResultsBack(sandbox);

        expect(result.filesCopied).toContain('new-file.txt');

        // Verify file was copied to source
        const content = await fs.readFile(
          path.join(testRepoDir, 'new-file.txt'),
          'utf-8'
        );
        expect(content).toBe('created in sandbox');
      } finally {
        await cleanupSandbox(sandbox.sandboxDirectory);
      }
    });

    it('should copy uncommitted changes to source', async () => {
      const sandbox = await createSandbox({ sourceDirectory: testRepoDir });

      try {
        // Modify existing file without committing
        writeFileSync(
          path.join(sandbox.sandboxDirectory, 'hello.txt'),
          'modified in sandbox'
        );

        const result = await copyResultsBack(sandbox);

        expect(result.filesCopied).toContain('hello.txt');

        const content = await fs.readFile(
          path.join(testRepoDir, 'hello.txt'),
          'utf-8'
        );
        expect(content).toBe('modified in sandbox');
      } finally {
        await cleanupSandbox(sandbox.sandboxDirectory);
      }
    });

    it('should copy new untracked files to source', async () => {
      const sandbox = await createSandbox({ sourceDirectory: testRepoDir });

      try {
        // Create an untracked file
        writeFileSync(
          path.join(sandbox.sandboxDirectory, 'untracked.txt'),
          'not in git'
        );

        const result = await copyResultsBack(sandbox);

        expect(result.filesCopied).toContain('untracked.txt');
      } finally {
        await cleanupSandbox(sandbox.sandboxDirectory);
      }
    });

    it('should skip .feature-factory/sessions/ files', async () => {
      const sandbox = await createSandbox({ sourceDirectory: testRepoDir });

      try {
        // Create a session data file
        const sessionsDir = path.join(
          sandbox.sandboxDirectory,
          '.feature-factory',
          'sessions'
        );
        await fs.mkdir(sessionsDir, { recursive: true });
        writeFileSync(
          path.join(sessionsDir, 'session-123.json'),
          '{"data":"session"}'
        );

        // Also create a real file that should be copied
        writeFileSync(
          path.join(sandbox.sandboxDirectory, 'real-file.txt'),
          'should copy'
        );

        const result = await copyResultsBack(sandbox);

        expect(result.filesCopied).toContain('real-file.txt');
        expect(result.skipped).toEqual(
          expect.arrayContaining([
            expect.stringContaining('.feature-factory/sessions/'),
          ])
        );
        expect(result.filesCopied).not.toContain(
          '.feature-factory/sessions/session-123.json'
        );
      } finally {
        await cleanupSandbox(sandbox.sandboxDirectory);
      }
    });

    it('should create parent directories when copying', async () => {
      const sandbox = await createSandbox({ sourceDirectory: testRepoDir });

      try {
        // Create file in nested directory
        const nestedDir = path.join(sandbox.sandboxDirectory, 'src', 'deep');
        await fs.mkdir(nestedDir, { recursive: true });
        writeFileSync(path.join(nestedDir, 'nested.txt'), 'deep file');

        const result = await copyResultsBack(sandbox);

        expect(result.filesCopied).toContain('src/deep/nested.txt');

        const content = await fs.readFile(
          path.join(testRepoDir, 'src', 'deep', 'nested.txt'),
          'utf-8'
        );
        expect(content).toBe('deep file');
      } finally {
        await cleanupSandbox(sandbox.sandboxDirectory);
      }
    });
  });

  describe('cleanupSandbox', () => {
    it('should remove the sandbox directory', async () => {
      const sandbox = await createSandbox({ sourceDirectory: testRepoDir });

      await cleanupSandbox(sandbox.sandboxDirectory);

      expect(existsSync(sandbox.sandboxDirectory)).toBe(false);
    });

    it('should handle already-deleted directory gracefully', async () => {
      const fakePath = path.join(os.tmpdir(), 'nonexistent-sandbox-dir');

      // Should not throw
      await expect(cleanupSandbox(fakePath)).resolves.toBeUndefined();
    });
  });

  describe('ensureCleanWorkingTree', () => {
    it('should pass for clean working tree', async () => {
      await expect(ensureCleanWorkingTree(testRepoDir)).resolves.toBeUndefined();
    });

    it('should throw for dirty working tree with file list', async () => {
      writeFileSync(path.join(testRepoDir, 'dirty.txt'), 'uncommitted');

      await expect(ensureCleanWorkingTree(testRepoDir)).rejects.toThrow(
        /dirty\.txt/
      );
    });
  });
});

describe('Sandbox Path Validation', () => {
  let sandboxDir: string;
  let context: ToolContext;

  beforeAll(async () => {
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-path-test-'));
    await fs.writeFile(path.join(sandboxDir, 'test.txt'), 'sandbox file');
    await fs.mkdir(path.join(sandboxDir, 'subdir'), { recursive: true });
    await fs.writeFile(
      path.join(sandboxDir, 'subdir', 'nested.txt'),
      'nested file'
    );

    context = {
      workingDirectory: sandboxDir,
      verbose: false,
      sandboxBoundary: sandboxDir,
    };
  });

  afterAll(async () => {
    await fs.rm(sandboxDir, { recursive: true, force: true });
  });

  it('should allow relative paths within sandbox', async () => {
    const result = await executeTool(
      'Read',
      { file_path: 'test.txt' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('sandbox file');
  });

  it('should allow absolute paths within sandbox', async () => {
    const result = await executeTool(
      'Read',
      { file_path: path.join(sandboxDir, 'test.txt') },
      context
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain('sandbox file');
  });

  it('should reject absolute paths outside sandbox', async () => {
    const result = await executeTool(
      'Read',
      { file_path: '/etc/hosts' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SANDBOX VIOLATION');
  });

  it('should reject traversal paths that escape sandbox', async () => {
    const result = await executeTool(
      'Read',
      { file_path: '../../etc/passwd' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SANDBOX VIOLATION');
  });

  it('should reject Glob search path outside sandbox', async () => {
    const result = await executeTool(
      'Glob',
      { pattern: '*', path: '/tmp' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SANDBOX VIOLATION');
  });

  it('should reject Grep search path outside sandbox', async () => {
    const result = await executeTool(
      'Grep',
      { pattern: 'test', path: '/tmp' },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('SANDBOX VIOLATION');
  });

  it('should allow operations without sandbox boundary', async () => {
    const noSandboxContext: ToolContext = {
      workingDirectory: sandboxDir,
      verbose: false,
      // no sandboxBoundary
    };

    const result = await executeTool(
      'Read',
      { file_path: '/etc/hosts' },
      noSandboxContext
    );

    // Should succeed or fail for file reasons, but NOT sandbox violation
    if (!result.success) {
      expect(result.error).not.toContain('SANDBOX VIOLATION');
    }
  });
});
