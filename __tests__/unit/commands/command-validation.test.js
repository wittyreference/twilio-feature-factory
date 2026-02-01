// ABOUTME: Unit tests for slash command markdown files in .claude/commands/.
// ABOUTME: Validates command structure, readability, and required sections.

const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '../../../.claude/commands');

describe('Slash Command Validation', () => {
  const expectedCommands = [
    'architect.md',
    'context.md',
    'deploy.md',
    'dev.md',
    'docs.md',
    'orchestrate.md',
    'review.md',
    'spec.md',
    'test-gen.md',
    'test.md',
    'twilio-docs.md',
    'twilio-logs.md',
  ];

  describe('Command Files Existence', () => {
    it('all expected command files should exist', () => {
      for (const cmd of expectedCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        expect(fs.existsSync(cmdPath)).toBe(true);
      }
    });

    it('all command files should be readable', () => {
      for (const cmd of expectedCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          expect(() => {
            fs.readFileSync(cmdPath, 'utf-8');
          }).not.toThrow();
        }
      }
    });
  });

  describe('Command File Structure', () => {
    it('all commands should have a title (h1 heading)', () => {
      for (const cmd of expectedCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          const content = fs.readFileSync(cmdPath, 'utf-8');
          // Match h1 heading at start of file or after newline
          expect(content).toMatch(/^# .+/m);
        }
      }
    });

    it('all commands should have a description section', () => {
      for (const cmd of expectedCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          const content = fs.readFileSync(cmdPath, 'utf-8');
          // Should have some descriptive text (at least 100 chars after title)
          const lines = content.split('\n');
          const contentAfterTitle = lines.slice(1).join('\n').trim();
          expect(contentAfterTitle.length).toBeGreaterThan(100);
        }
      }
    });

    it('all commands should have $ARGUMENTS placeholder for input', () => {
      for (const cmd of expectedCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          const content = fs.readFileSync(cmdPath, 'utf-8');
          expect(content).toContain('$ARGUMENTS');
        }
      }
    });

    it('all commands should have h2 sections for structure', () => {
      for (const cmd of expectedCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          const content = fs.readFileSync(cmdPath, 'utf-8');
          // Should have at least one h2 section
          expect(content).toMatch(/^## .+/m);
        }
      }
    });
  });

  describe('Command Content Quality', () => {
    it('development commands should define responsibilities', () => {
      const devCommands = ['architect.md', 'dev.md', 'review.md', 'spec.md', 'test-gen.md', 'docs.md'];

      for (const cmd of devCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          const content = fs.readFileSync(cmdPath, 'utf-8');
          // Should have responsibilities or role section
          expect(
            content.includes('Responsibilities') ||
            content.includes('Role') ||
            content.includes('Your role')
          ).toBe(true);
        }
      }
    });

    it('utility commands should have actionable content', () => {
      const utilityCommands = ['deploy.md', 'twilio-docs.md', 'twilio-logs.md'];

      for (const cmd of utilityCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          const content = fs.readFileSync(cmdPath, 'utf-8');
          // Should have actionable content (usage, example, checklist, process, or commands)
          const hasActionableContent =
            content.includes('Usage') ||
            content.includes('Example') ||
            content.includes('When to') ||
            content.includes('Checklist') ||
            content.includes('Before') ||
            content.includes('Step') ||
            content.includes('```bash') ||  // Has runnable commands
            content.includes('Run the'); // Instructions to run something
          expect(hasActionableContent).toBe(true);
        }
      }
    });

    it('orchestrate command should reference other commands', () => {
      const cmdPath = path.join(COMMANDS_DIR, 'orchestrate.md');
      if (fs.existsSync(cmdPath)) {
        const content = fs.readFileSync(cmdPath, 'utf-8');
        // Orchestrator should mention the commands it coordinates
        expect(content).toMatch(/\/architect|\/spec|\/dev|\/review/);
      }
    });

    it('test-gen command should mention TDD', () => {
      const cmdPath = path.join(COMMANDS_DIR, 'test-gen.md');
      if (fs.existsSync(cmdPath)) {
        const content = fs.readFileSync(cmdPath, 'utf-8');
        expect(content.toLowerCase()).toContain('tdd');
      }
    });
  });

  describe('No Syntax Errors', () => {
    it('markdown should have balanced code fences', () => {
      for (const cmd of expectedCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          const content = fs.readFileSync(cmdPath, 'utf-8');
          const codeFenceCount = (content.match(/```/g) || []).length;
          // Code fences should be balanced (even number)
          expect(codeFenceCount % 2).toBe(0);
        }
      }
    });

    it('markdown should not have unclosed links', () => {
      for (const cmd of expectedCommands) {
        const cmdPath = path.join(COMMANDS_DIR, cmd);
        if (fs.existsSync(cmdPath)) {
          const content = fs.readFileSync(cmdPath, 'utf-8');
          // Check for common unclosed link patterns
          // [text without closing ]( or [text](url without )
          const openBrackets = (content.match(/\[/g) || []).length;
          const closeBrackets = (content.match(/\]/g) || []).length;
          expect(openBrackets).toBe(closeBrackets);
        }
      }
    });
  });
});
