// ABOUTME: Unit tests for Feature Factory tool execution.
// ABOUTME: Tests Read, Write, Edit, Glob, Grep, and Bash tools.

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { getToolSchemas, executeTool, type ToolContext } from '../src/tools.js';

describe('Tool Schemas', () => {
  it('should return schemas for requested tools', () => {
    const schemas = getToolSchemas(['Read', 'Write', 'Glob']);
    expect(schemas).toHaveLength(3);
    expect(schemas.map((s) => s.name)).toEqual(['Read', 'Write', 'Glob']);
  });

  it('should skip undefined tools', () => {
    const schemas = getToolSchemas(['Read', 'WebSearch']); // WebSearch is undefined
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('Read');
  });

  it('should return empty array for no tools', () => {
    const schemas = getToolSchemas([]);
    expect(schemas).toHaveLength(0);
  });
});

describe('Tool Execution', () => {
  let testDir: string;
  let context: ToolContext;

  beforeAll(async () => {
    // Create temp directory for tests
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-tools-test-'));
    context = {
      workingDirectory: testDir,
      verbose: false,
    };
  });

  afterAll(async () => {
    // Clean up temp directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Read tool', () => {
    it('should read file contents with line numbers', async () => {
      const testFile = path.join(testDir, 'test.txt');
      await fs.writeFile(testFile, 'line1\nline2\nline3\n');

      const result = await executeTool('Read', { file_path: testFile }, context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('1→line1');
      expect(result.output).toContain('2→line2');
      expect(result.output).toContain('3→line3');
    });

    it('should handle file not found', async () => {
      const result = await executeTool(
        'Read',
        { file_path: '/nonexistent/file.txt' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to read file');
    });

    it('should respect offset and limit', async () => {
      const testFile = path.join(testDir, 'test2.txt');
      await fs.writeFile(testFile, 'line1\nline2\nline3\nline4\nline5\n');

      const result = await executeTool(
        'Read',
        { file_path: testFile, offset: 2, limit: 2 },
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('2→line2');
      expect(result.output).toContain('3→line3');
      expect(result.output).not.toContain('1→line1');
      expect(result.output).not.toContain('4→line4');
    });
  });

  describe('Write tool', () => {
    it('should create new file', async () => {
      const testFile = path.join(testDir, 'new-file.txt');

      const result = await executeTool(
        'Write',
        { file_path: testFile, content: 'Hello World' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.filesCreated).toContain(testFile);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should overwrite existing file', async () => {
      const testFile = path.join(testDir, 'overwrite.txt');
      await fs.writeFile(testFile, 'old content');

      const result = await executeTool(
        'Write',
        { file_path: testFile, content: 'new content' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.filesModified).toContain(testFile);
      expect(result.filesCreated).toBeUndefined();

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('new content');
    });

    it('should create parent directories', async () => {
      const testFile = path.join(testDir, 'nested', 'dir', 'file.txt');

      const result = await executeTool(
        'Write',
        { file_path: testFile, content: 'nested content' },
        context
      );

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('nested content');
    });
  });

  describe('Edit tool', () => {
    it('should replace string in file', async () => {
      const testFile = path.join(testDir, 'edit.txt');
      await fs.writeFile(testFile, 'Hello World');

      const result = await executeTool(
        'Edit',
        { file_path: testFile, old_string: 'World', new_string: 'Universe' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.filesModified).toContain(testFile);

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('Hello Universe');
    });

    it('should fail when old_string not found', async () => {
      const testFile = path.join(testDir, 'edit2.txt');
      await fs.writeFile(testFile, 'Hello World');

      const result = await executeTool(
        'Edit',
        { file_path: testFile, old_string: 'notfound', new_string: 'new' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('old_string not found');
    });

    it('should replace all when replace_all is true', async () => {
      const testFile = path.join(testDir, 'edit3.txt');
      await fs.writeFile(testFile, 'foo bar foo baz foo');

      const result = await executeTool(
        'Edit',
        {
          file_path: testFile,
          old_string: 'foo',
          new_string: 'qux',
          replace_all: true,
        },
        context
      );

      expect(result.success).toBe(true);
      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('qux bar qux baz qux');
    });
  });

  describe('Glob tool', () => {
    beforeAll(async () => {
      // Create test files for glob
      await fs.writeFile(path.join(testDir, 'file1.ts'), 'ts1');
      await fs.writeFile(path.join(testDir, 'file2.ts'), 'ts2');
      await fs.writeFile(path.join(testDir, 'file.js'), 'js1');
    });

    it('should find files matching pattern', async () => {
      const result = await executeTool('Glob', { pattern: '*.ts' }, context);

      expect(result.success).toBe(true);
      expect(result.output).toContain('file1.ts');
      expect(result.output).toContain('file2.ts');
      expect(result.output).not.toContain('file.js');
    });

    it('should return message for no matches', async () => {
      const result = await executeTool('Glob', { pattern: '*.py' }, context);

      expect(result.success).toBe(true);
      expect(result.output).toBe('No matching files found');
    });
  });

  describe('Grep tool', () => {
    beforeAll(async () => {
      // Create test files for grep
      await fs.writeFile(
        path.join(testDir, 'search1.txt'),
        'line with foo\nother line\nfoo again'
      );
      await fs.writeFile(
        path.join(testDir, 'search2.txt'),
        'no matches here\njust text'
      );
    });

    it('should find pattern matches', async () => {
      const result = await executeTool(
        'Grep',
        { pattern: 'foo', glob: '*.txt' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('search1.txt');
      expect(result.output).toContain('line with foo');
      expect(result.output).toContain('foo again');
    });

    it('should return message for no matches', async () => {
      const result = await executeTool(
        'Grep',
        { pattern: 'notfound123', glob: '*.txt' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('No matches found');
    });
  });

  describe('Bash tool', () => {
    it('should execute simple command', async () => {
      const result = await executeTool(
        'Bash',
        { command: 'echo "hello world"' },
        context
      );

      expect(result.success).toBe(true);
      expect(result.output).toBe('hello world');
    });

    it('should capture exit code on failure', async () => {
      const result = await executeTool(
        'Bash',
        { command: 'exit 42' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Exit code: 42');
    });

    it('should block --no-verify', async () => {
      const result = await executeTool(
        'Bash',
        { command: 'git commit --no-verify -m "test"' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command blocked');
    });

    it('should block git push --force', async () => {
      const result = await executeTool(
        'Bash',
        { command: 'git push --force origin main' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command blocked');
    });

    it('should use working directory', async () => {
      const result = await executeTool('Bash', { command: 'pwd' }, context);

      expect(result.success).toBe(true);
      // Normalize paths to handle macOS symlinks (/var vs /private/var)
      expect(fs.realpath(result.output)).resolves.toBe(
        await fs.realpath(testDir)
      );
    });
  });

  describe('Unknown tool', () => {
    it('should return error for unknown tool', async () => {
      const result = await executeTool(
        'UnknownTool',
        { some: 'param' },
        context
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });
  });
});
