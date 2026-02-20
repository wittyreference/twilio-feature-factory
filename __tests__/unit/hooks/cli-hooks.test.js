// ABOUTME: Unit tests for CLI hook scripts in .claude/hooks/.
// ABOUTME: Validates credential blocking, git safety, and hook executability.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOKS_DIR = path.join(__dirname, '../../../.claude/hooks');

/**
 * Helper to run a hook with JSON on stdin (matching Claude Code's hook protocol).
 * Hooks receive tool input as JSON on stdin, not env vars.
 */
function runHookWithStdin(hookPath, stdinJson, extraEnv = {}) {
  try {
    const result = execSync(`bash "${hookPath}"`, {
      input: stdinJson,
      env: { ...process.env, ...extraEnv },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stderr: '', stdout: result };
  } catch (error) {
    return {
      exitCode: error.status,
      stderr: error.stderr || '',
      stdout: error.stdout || '',
    };
  }
}

describe('CLI Hook Scripts', () => {
  describe('Hook Files', () => {
    const expectedHooks = [
      'pre-write-validate.sh',
      'pre-bash-validate.sh',
      'post-write.sh',
      'post-bash.sh',
      'notify-ready.sh',
      'subagent-log.sh',
      'flywheel-doc-check.sh',
      'flywheel-session-summary.sh',
    ];

    it('all expected hooks should exist', () => {
      for (const hook of expectedHooks) {
        const hookPath = path.join(HOOKS_DIR, hook);
        expect(fs.existsSync(hookPath)).toBe(true);
      }
    });

    it('all hooks should be executable', () => {
      for (const hook of expectedHooks) {
        const hookPath = path.join(HOOKS_DIR, hook);
        if (fs.existsSync(hookPath)) {
          const stats = fs.statSync(hookPath);
          const isExecutable = (stats.mode & 0o111) !== 0;
          expect(isExecutable).toBe(true);
        }
      }
    });

    it('all hooks should have ABOUTME comment', () => {
      for (const hook of expectedHooks) {
        const hookPath = path.join(HOOKS_DIR, hook);
        if (fs.existsSync(hookPath)) {
          const content = fs.readFileSync(hookPath, 'utf-8');
          expect(content).toContain('# ABOUTME:');
        }
      }
    });
  });

  describe('pre-write-validate.sh - Credential Safety', () => {
    const hookPath = path.join(HOOKS_DIR, 'pre-write-validate.sh');

    function runHook(content, filePath = 'scripts/test-func.js') {
      const stdinJson = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: filePath, content },
      });
      return runHookWithStdin(hookPath, stdinJson, {
        CLAUDE_ALLOW_PRODUCTION_WRITE: 'true',
      });
    }

    it('should block hardcoded Account SID', () => {
      const content = 'const sid = "AC12345678901234567890123456789012";';
      const result = runHook(content);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Hardcoded Twilio Account SID');
    });

    it('should block hardcoded API Key SID', () => {
      const content = 'const apiKey = "SK12345678901234567890123456789012";';
      const result = runHook(content);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Hardcoded Twilio API Key');
    });

    it('should block hardcoded auth token assignment', () => {
      const content = 'authToken = "12345678901234567890123456789012"';
      const result = runHook(content);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Hardcoded Twilio Auth Token');
    });

    it('should allow process.env.TWILIO_ACCOUNT_SID reference', () => {
      const content = 'const sid = process.env.TWILIO_ACCOUNT_SID;';
      const result = runHook(content);
      expect(result.exitCode).toBe(0);
    });

    it('should allow context.TWILIO_ACCOUNT_SID reference', () => {
      const content = 'const sid = context.TWILIO_ACCOUNT_SID;';
      const result = runHook(content);
      expect(result.exitCode).toBe(0);
    });

    it('should allow ACCOUNT_SID in variable name pattern', () => {
      const content = 'ACCOUNT_SID = "AC12345678901234567890123456789012";';
      const result = runHook(content);
      expect(result.exitCode).toBe(0);
    });

    it('should allow code without credentials', () => {
      const content = 'const greeting = "Hello, World!";';
      const result = runHook(content);
      expect(result.exitCode).toBe(0);
    });

    it('should handle empty content', () => {
      const result = runHook('');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('pre-bash-validate.sh - Git Safety', () => {
    const hookPath = path.join(HOOKS_DIR, 'pre-bash-validate.sh');

    function runHook(command) {
      const stdinJson = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command },
      });
      return runHookWithStdin(hookPath, stdinJson, {
        SKIP_PENDING_ACTIONS: 'true',
      });
    }

    it('should block git commit --no-verify', () => {
      const result = runHook('git commit --no-verify -m "test"');
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('--no-verify');
    });

    it('should block git commit -n (short form)', () => {
      const result = runHook('git commit -n -m "test"');
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('--no-verify');
    });

    it('should block git push --force to main', () => {
      const result = runHook('git push --force origin main');
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Force push');
    });

    it('should block git push --force to master', () => {
      const result = runHook('git push --force origin master');
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('Force push');
    });

    it('should allow normal git commit', () => {
      const result = runHook('git commit -m "test commit"');
      expect(result.exitCode).toBe(0);
    });

    it('should allow git push without force', () => {
      const result = runHook('git push origin feature-branch');
      expect(result.exitCode).toBe(0);
    });

    it('should allow git push --force to non-main branches', () => {
      const result = runHook('git push --force origin feature-branch');
      expect(result.exitCode).toBe(0);
    });

    it('should allow non-git commands', () => {
      const result = runHook('npm test');
      expect(result.exitCode).toBe(0);
    });

    it('should handle empty command', () => {
      const result = runHook('');
      expect(result.exitCode).toBe(0);
    });
  });
});
