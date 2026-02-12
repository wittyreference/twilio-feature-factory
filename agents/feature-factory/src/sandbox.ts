// ABOUTME: Sandbox lifecycle management for Feature Factory.
// ABOUTME: Isolates workflow execution in a temp directory, copies results back on success.

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Configuration for creating a sandbox
 */
export interface SandboxConfig {
  sourceDirectory: string;
  verbose?: boolean;
}

/**
 * Information about a created sandbox
 */
export interface SandboxInfo {
  sandboxDirectory: string;
  sourceDirectory: string;
  startCommitHash: string;
}

/**
 * Result of copying sandbox results back to source
 */
export interface CopyBackResult {
  filesCopied: string[];
  skipped: string[];
}

/**
 * Create an isolated sandbox directory by cloning the source repo.
 * Uses `git clone --local` for speed (hard-links immutable git objects).
 * Symlinks node_modules from source to avoid reinstalling.
 */
export async function createSandbox(config: SandboxConfig): Promise<SandboxInfo> {
  const { sourceDirectory, verbose } = config;

  // Verify source is a git repo
  try {
    execSync('git rev-parse --git-dir', {
      cwd: sourceDirectory,
      stdio: 'pipe',
    });
  } catch {
    throw new Error(
      `Source directory is not a git repository: ${sourceDirectory}`
    );
  }

  // Verify clean working tree
  await ensureCleanWorkingTree(sourceDirectory);

  // Create temp directory
  const sandboxDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'feature-factory-sandbox-')
  );

  if (verbose) {
    console.log(`  [sandbox] Created temp dir: ${sandboxDirectory}`);
  }

  try {
    // Clone using --local for fast hard-linked clone
    execSync(
      `git clone --local "${sourceDirectory}" "${sandboxDirectory}/repo"`,
      { stdio: 'pipe' }
    );

    // Move contents from repo subdirectory to sandbox root
    const repoDir = path.join(sandboxDirectory, 'repo');
    const entries = await fs.readdir(repoDir, { withFileTypes: true });
    for (const entry of entries) {
      await fs.rename(
        path.join(repoDir, entry.name),
        path.join(sandboxDirectory, entry.name)
      );
    }
    await fs.rmdir(repoDir);

    if (verbose) {
      console.log('  [sandbox] Cloned repository');
    }

    // Symlink node_modules if present in source
    const sourceNodeModules = path.join(sourceDirectory, 'node_modules');
    const sandboxNodeModules = path.join(sandboxDirectory, 'node_modules');

    try {
      await fs.access(sourceNodeModules);
      await fs.symlink(sourceNodeModules, sandboxNodeModules, 'dir');
      if (verbose) {
        console.log('  [sandbox] Symlinked node_modules');
      }
    } catch {
      // No source node_modules — run npm install only if package.json exists
      const sandboxPackageJson = path.join(sandboxDirectory, 'package.json');
      try {
        await fs.access(sandboxPackageJson);
        if (verbose) {
          console.log('  [sandbox] No node_modules in source, running npm install');
        }
        execSync('npm install', {
          cwd: sandboxDirectory,
          stdio: verbose ? 'inherit' : 'pipe',
        });
      } catch {
        // No package.json either — nothing to install
        if (verbose) {
          console.log('  [sandbox] No node_modules or package.json, skipping install');
        }
      }
    }

    // Record HEAD commit hash for later diffing
    const startCommitHash = execSync('git rev-parse HEAD', {
      cwd: sandboxDirectory,
      encoding: 'utf-8',
    }).trim();

    if (verbose) {
      console.log(`  [sandbox] Start commit: ${startCommitHash}`);
    }

    return {
      sandboxDirectory,
      sourceDirectory,
      startCommitHash,
    };
  } catch (error) {
    // Clean up on failure
    await cleanupSandbox(sandboxDirectory);
    throw error;
  }
}

/**
 * Copy changed files from sandbox back to the source directory.
 * Finds committed, uncommitted, and untracked changes since sandbox creation.
 * Skips session data files (.feature-factory/sessions/).
 */
export async function copyResultsBack(sandbox: SandboxInfo): Promise<CopyBackResult> {
  const { sandboxDirectory, sourceDirectory, startCommitHash } = sandbox;
  const filesCopied: string[] = [];
  const skipped: string[] = [];

  // Collect all changed files from three sources
  const changedFiles = new Set<string>();

  // 1. Committed changes since start
  try {
    const committed = execSync(
      `git diff --name-only ${startCommitHash}..HEAD`,
      { cwd: sandboxDirectory, encoding: 'utf-8' }
    ).trim();
    if (committed) {
      for (const file of committed.split('\n')) {
        changedFiles.add(file);
      }
    }
  } catch {
    // No committed changes or invalid hash
  }

  // 2. Uncommitted modified files
  try {
    const uncommitted = execSync('git diff --name-only', {
      cwd: sandboxDirectory,
      encoding: 'utf-8',
    }).trim();
    if (uncommitted) {
      for (const file of uncommitted.split('\n')) {
        changedFiles.add(file);
      }
    }
  } catch {
    // No uncommitted changes
  }

  // 3. New untracked files
  try {
    const untracked = execSync(
      'git ls-files --others --exclude-standard',
      { cwd: sandboxDirectory, encoding: 'utf-8' }
    ).trim();
    if (untracked) {
      for (const file of untracked.split('\n')) {
        changedFiles.add(file);
      }
    }
  } catch {
    // No untracked files
  }

  // Copy each changed file back to source
  for (const relPath of changedFiles) {
    // Skip session data files
    if (relPath.startsWith('.feature-factory/sessions/')) {
      skipped.push(`${relPath} (session data)`);
      continue;
    }

    const sandboxFile = path.join(sandboxDirectory, relPath);
    const sourceFile = path.join(sourceDirectory, relPath);

    try {
      // Verify file still exists in sandbox (could have been deleted)
      await fs.access(sandboxFile);

      // Create parent directories in source
      await fs.mkdir(path.dirname(sourceFile), { recursive: true });

      // Copy file
      await fs.copyFile(sandboxFile, sourceFile);
      filesCopied.push(relPath);
    } catch {
      skipped.push(`${relPath} (not found in sandbox)`);
    }
  }

  return { filesCopied, skipped };
}

/**
 * Remove the sandbox directory.
 * Removes symlinked node_modules first to prevent rm -rf from following the symlink.
 * Failures are logged but not thrown.
 */
export async function cleanupSandbox(sandboxDirectory: string): Promise<void> {
  try {
    // Remove symlinked node_modules first (prevents following symlink into source)
    const nodeModulesPath = path.join(sandboxDirectory, 'node_modules');
    try {
      const stat = await fs.lstat(nodeModulesPath);
      if (stat.isSymbolicLink()) {
        await fs.unlink(nodeModulesPath);
      }
    } catch {
      // node_modules doesn't exist or already removed
    }

    // Remove the sandbox directory
    await fs.rm(sandboxDirectory, { recursive: true, force: true });
  } catch (error) {
    console.warn(
      `  [sandbox] Cleanup warning: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Verify the source directory has a clean working tree.
 * Throws with file list and instructions if dirty.
 */
export async function ensureCleanWorkingTree(sourceDirectory: string): Promise<void> {
  const status = execSync('git status --porcelain', {
    cwd: sourceDirectory,
    encoding: 'utf-8',
  }).trim();

  if (status) {
    const files = status
      .split('\n')
      .map((line) => line.trim())
      .slice(0, 10);

    const fileList = files.join('\n  ');
    const more = status.split('\n').length > 10
      ? `\n  ... and ${status.split('\n').length - 10} more`
      : '';

    throw new Error(
      `Sandbox requires a clean working tree. Uncommitted changes found:\n  ${fileList}${more}\n\n` +
      'Please commit or stash your changes before running in sandbox mode.'
    );
  }
}
