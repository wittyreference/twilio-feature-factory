// ABOUTME: Tool definitions and execution for Feature Factory agents.
// ABOUTME: Provides Read, Write, Edit, Glob, Grep, Bash, and MCP Twilio tools for subagents.

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { glob } from 'glob';
import type { AgentTool, CoreTool } from './types.js';
import type Anthropic from '@anthropic-ai/sdk';
import {
  isMcpInitialized,
  isMcpTool,
  getMcpToolSchemas,
  executeMcpTool,
} from './mcp-tools.js';

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  filesCreated?: string[];
  filesModified?: string[];
}

/**
 * Context for tool execution
 */
export interface ToolContext {
  workingDirectory: string;
  verbose?: boolean;
}

/**
 * Tool schema type for Anthropic API
 */
export type ToolSchema = Anthropic.Tool;

/**
 * Get tool schemas for specified tools (core + MCP if enabled)
 */
export function getToolSchemas(tools: AgentTool[]): ToolSchema[] {
  const schemas: ToolSchema[] = [];

  // Get MCP tool schemas if initialized
  const mcpSchemas = isMcpInitialized() ? getMcpToolSchemas() : [];
  const mcpSchemaMap = new Map(mcpSchemas.map((s) => [s.name, s]));

  for (const tool of tools) {
    // Check core tools first
    const coreSchema = CORE_TOOL_SCHEMAS[tool as CoreTool];
    if (coreSchema) {
      schemas.push(coreSchema);
      continue;
    }

    // Check MCP tools
    const mcpSchema = mcpSchemaMap.get(tool);
    if (mcpSchema) {
      schemas.push(mcpSchema);
    }
  }

  return schemas;
}

/**
 * Execute a tool with given input (core or MCP)
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  // Check if this is an MCP tool
  if (isMcpInitialized() && isMcpTool(toolName)) {
    return await executeMcpTool(toolName, input);
  }

  // Check core tools
  const executor = CORE_TOOL_EXECUTORS[toolName as CoreTool];

  if (!executor) {
    return {
      success: false,
      output: '',
      error: `Unknown tool: ${toolName}`,
    };
  }

  try {
    return await executor(input, context);
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Tool schemas for Anthropic API
 */
const CORE_TOOL_SCHEMAS: Record<CoreTool, ToolSchema | undefined> = {
  Read: {
    name: 'Read',
    description:
      'Read a file from the filesystem. Returns file contents with line numbers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute or relative path to the file to read',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (1-indexed)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read',
        },
      },
      required: ['file_path'],
    },
  },

  Write: {
    name: 'Write',
    description:
      'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'The absolute or relative path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
  },

  Edit: {
    name: 'Edit',
    description:
      'Edit a file by replacing a specific string with another. The old_string must match exactly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'The path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find and replace',
        },
        new_string: {
          type: 'string',
          description: 'The string to replace it with',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace all occurrences (default: false)',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },

  Glob: {
    name: 'Glob',
    description:
      'Find files matching a glob pattern. Returns list of matching file paths.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description:
            'The glob pattern to match (e.g., "**/*.ts", "src/**/*.js")',
        },
        path: {
          type: 'string',
          description: 'Directory to search in (default: working directory)',
        },
      },
      required: ['pattern'],
    },
  },

  Grep: {
    name: 'Grep',
    description:
      'Search for a pattern in files. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for',
        },
        path: {
          type: 'string',
          description: 'File or directory to search in',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g., "*.ts")',
        },
      },
      required: ['pattern'],
    },
  },

  Bash: {
    name: 'Bash',
    description:
      'Execute a bash command. Returns stdout and stderr. Use for git, npm, and other shell operations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 120000)',
        },
      },
      required: ['command'],
    },
  },

  // Not implemented for subagents
  WebSearch: undefined,
  WebFetch: undefined,
  AskUserQuestion: undefined,
};

/**
 * Tool execution functions
 */
const CORE_TOOL_EXECUTORS: Record<
  CoreTool,
  | ((
      input: Record<string, unknown>,
      context: ToolContext
    ) => Promise<ToolResult>)
  | undefined
> = {
  Read: async (input, context): Promise<ToolResult> => {
    const filePath = resolvePath(input.file_path as string, context);
    const offset = (input.offset as number) || 1;
    const limit = (input.limit as number) || 2000;

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const startLine = Math.max(0, offset - 1);
      const endLine = Math.min(lines.length, startLine + limit);
      const selectedLines = lines.slice(startLine, endLine);

      // Format with line numbers
      const formatted = selectedLines
        .map((line, i) => `${String(startLine + i + 1).padStart(6)}→${line}`)
        .join('\n');

      return {
        success: true,
        output: formatted,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  Write: async (input, context): Promise<ToolResult> => {
    const filePath = resolvePath(input.file_path as string, context);
    const content = input.content as string;
    const isNew = !(await fileExists(filePath));

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');

      return {
        success: true,
        output: `Successfully wrote ${content.length} bytes to ${filePath}`,
        filesCreated: isNew ? [filePath] : undefined,
        filesModified: isNew ? undefined : [filePath],
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  Edit: async (input, context): Promise<ToolResult> => {
    const filePath = resolvePath(input.file_path as string, context);
    const oldString = input.old_string as string;
    const newString = input.new_string as string;
    const replaceAll = (input.replace_all as boolean) || false;

    try {
      const content = await fs.readFile(filePath, 'utf-8');

      if (!content.includes(oldString)) {
        return {
          success: false,
          output: '',
          error: `old_string not found in file: ${filePath}`,
        };
      }

      const newContent = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      await fs.writeFile(filePath, newContent, 'utf-8');

      return {
        success: true,
        output: `Successfully edited ${filePath}`,
        filesModified: [filePath],
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  Glob: async (input, context): Promise<ToolResult> => {
    const pattern = input.pattern as string;
    const searchPath = input.path
      ? resolvePath(input.path as string, context)
      : context.workingDirectory;

    try {
      const matches = await glob(pattern, {
        cwd: searchPath,
        nodir: true,
        absolute: true,
      });

      return {
        success: true,
        output:
          matches.length > 0 ? matches.join('\n') : 'No matching files found',
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Glob failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  Grep: async (input, context): Promise<ToolResult> => {
    const pattern = input.pattern as string;
    const searchPath = input.path
      ? resolvePath(input.path as string, context)
      : context.workingDirectory;
    const globPattern = (input.glob as string) || '**/*';

    try {
      // Find files matching glob
      const files = await glob(globPattern, {
        cwd: searchPath,
        nodir: true,
        absolute: true,
        ignore: ['**/node_modules/**', '**/.git/**'],
      });

      const regex = new RegExp(pattern, 'g');
      const results: string[] = [];

      for (const file of files.slice(0, 100)) {
        // Limit to 100 files
        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${file}:${i + 1}:${lines[i]}`);
              regex.lastIndex = 0; // Reset regex state
            }
          }
        } catch {
          // Skip binary or unreadable files
        }
      }

      return {
        success: true,
        output: results.length > 0 ? results.join('\n') : 'No matches found',
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: `Grep failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  Bash: async (input, context): Promise<ToolResult> => {
    const command = input.command as string;
    const timeout = (input.timeout as number) || 120000;

    // Security: Block dangerous commands
    const blockedPatterns = [
      /--no-verify/,
      /git\s+push\s+--force/,
      /rm\s+-rf\s+\//,
      /sudo\s+rm/,
    ];

    for (const blocked of blockedPatterns) {
      if (blocked.test(command)) {
        return {
          success: false,
          output: '',
          error: `Command blocked: ${command}`,
        };
      }
    }

    return new Promise((resolve) => {
      const child = spawn('bash', ['-c', command], {
        cwd: context.workingDirectory,
        timeout,
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');

        resolve({
          success: code === 0,
          output: output.trim(),
          error: code !== 0 ? `Exit code: ${code}` : undefined,
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          output: '',
          error: error.message,
        });
      });
    });
  },

  // Not implemented
  WebSearch: undefined,
  WebFetch: undefined,
  AskUserQuestion: undefined,
};

/**
 * Resolve a path relative to working directory
 */
function resolvePath(filePath: string, context: ToolContext): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(context.workingDirectory, filePath);
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
