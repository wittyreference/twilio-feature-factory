// ABOUTME: Extracts agent configurations from TypeScript source code.
// ABOUTME: Parses AgentConfig objects to extract roles, tools, and schemas.

import type {
  AgentsExtractorResult,
  AgentDefinition,
} from '../types.js';

/**
 * Parses a tools array from a string.
 * @param toolsStr - The tools array content
 * @returns Array of tool names
 */
function parseToolsArray(toolsStr: string): string[] {
  const tools: string[] = [];
  const toolPattern = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = toolPattern.exec(toolsStr)) !== null) {
    tools.push(match[1]);
  }
  return tools;
}

/**
 * Parses a schema object from a string.
 * @param schemaStr - The schema object content
 * @returns Record of field names to descriptions
 */
function parseSchemaObject(schemaStr: string): Record<string, string> {
  const schema: Record<string, string> = {};

  // Match field: 'type - description' patterns
  const fieldPattern = /(\w+)\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = fieldPattern.exec(schemaStr)) !== null) {
    const [, name, value] = match;
    schema[name] = value;
  }

  return schema;
}

/**
 * Creates a summary from a system prompt.
 * Extracts the first meaningful paragraph or section.
 * @param systemPrompt - Full system prompt
 * @returns Truncated summary (max 400 chars)
 */
function createSystemPromptSummary(systemPrompt: string): string {
  // Remove template literal markers if any
  const cleaned = systemPrompt.replace(/^`|`$/g, '').trim();

  // Get first paragraph or up to first section header
  const firstSection = cleaned.split(/\n##/)[0];
  const firstParagraph = firstSection.split(/\n\n/)[0];

  // Truncate to reasonable length
  const maxLength = 400;
  if (firstParagraph.length <= maxLength) {
    return firstParagraph.trim();
  }

  return firstParagraph.substring(0, maxLength - 3).trim() + '...';
}

/**
 * Extracts agent configurations from TypeScript source code.
 * @param sourceCode - TypeScript source code containing AgentConfig definitions
 * @param filename - Source filename for reference
 * @returns Extracted agent configurations
 */
export function extractAgents(
  sourceCode: string,
  filename: string
): AgentsExtractorResult {
  const agents: AgentDefinition[] = [];

  // Pattern to match agent config definitions
  // Handle both single-line and multi-line agent definitions
  // Look for AgentConfig = { ... }; with balanced braces
  const agentPattern =
    /(?:export\s+)?const\s+\w+\s*:\s*AgentConfig\s*=\s*\{([\s\S]*?)\};/g;

  let match;
  while ((match = agentPattern.exec(sourceCode)) !== null) {
    const configContent = match[1];

    // Extract individual fields
    const nameMatch = configContent.match(/name\s*:\s*['"]([^'"]+)['"]/);
    const descMatch = configContent.match(/description\s*:\s*['"]([^'"]+)['"]/);
    const maxTurnsMatch = configContent.match(/maxTurns\s*:\s*(\d+)/);
    const modelMatch = configContent.match(/model\s*:\s*['"]([^'"]+)['"]/);

    // Extract system prompt (handle template literals and regular strings)
    const systemPromptMatch = configContent.match(
      /systemPrompt\s*:\s*(?:`([\s\S]*?)`|['"]([^'"]*?)['"])/
    );

    // Extract tools array
    const toolsMatch = configContent.match(/tools\s*:\s*\[([^\]]*)\]/);

    // Extract input/output schemas
    const inputSchemaMatch = configContent.match(
      /inputSchema\s*:\s*\{([^}]*)\}/
    );
    const outputSchemaMatch = configContent.match(
      /outputSchema\s*:\s*\{([^}]*)\}/
    );

    if (nameMatch && descMatch) {
      const systemPrompt = systemPromptMatch
        ? systemPromptMatch[1] || systemPromptMatch[2] || ''
        : '';

      agents.push({
        name: nameMatch[1],
        description: descMatch[1],
        systemPromptSummary: createSystemPromptSummary(systemPrompt),
        tools: toolsMatch ? parseToolsArray(toolsMatch[1]) : [],
        maxTurns: maxTurnsMatch ? parseInt(maxTurnsMatch[1], 10) : 10,
        model: modelMatch ? modelMatch[1] : undefined,
        inputSchema: inputSchemaMatch
          ? parseSchemaObject(inputSchemaMatch[1])
          : {},
        outputSchema: outputSchemaMatch
          ? parseSchemaObject(outputSchemaMatch[1])
          : {},
        sourceFile: filename,
      });
    }
  }

  return { agents };
}
