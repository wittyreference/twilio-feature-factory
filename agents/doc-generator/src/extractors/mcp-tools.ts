// ABOUTME: Extracts MCP tool definitions from TypeScript source code.
// ABOUTME: Parses createTool calls to extract names, descriptions, and parameters.

import type {
  McpToolsExtractorResult,
  ToolDefinition,
  ParameterDefinition,
  ModuleSummary,
} from '../types.js';

/**
 * Extracts the module name from a filename.
 * @param filename - Source filename (e.g., 'messaging.ts')
 * @returns Module name without extension (e.g., 'messaging')
 */
function deriveModuleName(filename: string): string {
  return filename.replace(/\.(ts|js)$/, '');
}

/**
 * Parses a Zod schema string to extract parameter definitions.
 * @param schemaStr - The z.object({...}) string content
 * @returns Array of parameter definitions
 */
function parseZodSchema(schemaStr: string): ParameterDefinition[] {
  const params: ParameterDefinition[] = [];

  // Match individual parameter definitions
  // Pattern: paramName: z.type().describe('description')
  const paramPattern =
    /(\w+)\s*:\s*(z\.[\w()[\].'",\s]+?)\.describe\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let match;
  while ((match = paramPattern.exec(schemaStr)) !== null) {
    const [, name, typeChain, description] = match;

    // Determine type from Zod chain
    // Check compound types first before primitives (array contains string, etc.)
    let type = 'unknown';
    if (typeChain.includes('z.array')) type = 'array';
    else if (typeChain.includes('z.object')) type = 'object';
    else if (typeChain.includes('z.string')) type = 'string';
    else if (typeChain.includes('z.number')) type = 'number';
    else if (typeChain.includes('z.boolean')) type = 'boolean';

    // Check if optional
    const required = !typeChain.includes('.optional()');

    // Check for default value
    let defaultValue: unknown;
    const defaultMatch = typeChain.match(/\.default\s*\(\s*(\d+|true|false|['"][^'"]*['"])\s*\)/);
    if (defaultMatch) {
      const defaultStr = defaultMatch[1];
      if (defaultStr === 'true') defaultValue = true;
      else if (defaultStr === 'false') defaultValue = false;
      else if (/^\d+$/.test(defaultStr)) defaultValue = parseInt(defaultStr, 10);
      else defaultValue = defaultStr.replace(/['"]/g, '');
    }

    params.push({
      name,
      type,
      description,
      required,
      defaultValue,
    });
  }

  return params;
}

/**
 * Extracts MCP tool definitions from TypeScript source code.
 * @param sourceCode - TypeScript source code containing createTool calls
 * @param filename - Source filename for module derivation
 * @returns Extracted tool definitions with metadata
 */
export function extractMcpTools(
  sourceCode: string,
  filename: string
): McpToolsExtractorResult {
  const tools: ToolDefinition[] = [];
  const moduleName = deriveModuleName(filename);

  // Pattern to match createTool calls
  // createTool('name', 'description', z.object({...}), async (params) => {...})
  const toolPattern =
    /createTool\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*(z\.object\s*\(\s*\{[\s\S]*?\}\s*\))/g;

  let match;
  while ((match = toolPattern.exec(sourceCode)) !== null) {
    const [, name, description, schemaStr] = match;

    const parameters = parseZodSchema(schemaStr);

    tools.push({
      name,
      description,
      parameters,
      module: moduleName,
      sourceFile: filename,
    });
  }

  // Create module summary
  const modules: ModuleSummary[] = [];
  if (tools.length > 0) {
    modules.push({
      name: moduleName,
      toolCount: tools.length,
    });
  }

  return {
    tools,
    modules,
    totalCount: tools.length,
  };
}
