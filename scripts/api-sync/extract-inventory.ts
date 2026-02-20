// ABOUTME: Extracts tool metadata from MCP tool source files via regex.
// ABOUTME: Produces an inventory of tool names, SDK call paths, and Zod parameter names.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCP_TOOLS_DIR } from './config.js';
import type { ToolInventoryEntry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const TOOLS_DIR = resolve(PROJECT_ROOT, MCP_TOOLS_DIR);
const INVENTORY_PATH = resolve(__dirname, 'inventory.json');

/**
 * Extract tool definitions from a single TypeScript tool file.
 *
 * Uses regex to find createTool() calls and extract:
 * - Tool name (first string argument)
 * - SDK calls (await client.X.Y.Z patterns in the handler)
 * - Zod schema parameter names
 */
function extractToolsFromFile(filePath: string): ToolInventoryEntry[] {
  const content = readFileSync(filePath, 'utf-8');
  const fileName = basename(filePath);
  const tools: ToolInventoryEntry[] = [];

  // Split file into individual tool definitions by finding createTool boundaries.
  // Each createTool call defines one tool. We look for the pattern:
  //   createTool(\n    'tool_name',
  // and capture everything until the next createTool or end of exported function.
  const toolBlocks = splitIntoToolBlocks(content);

  for (const block of toolBlocks) {
    // Extract tool name
    const nameMatch = block.match(/createTool\(\s*['"](\w+)['"]/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    // Extract SDK call paths: await client.something.something(...)
    const sdkCalls: string[] = [];
    const sdkRegex = /await\s+client\.([a-zA-Z0-9_.()]+?)(?:\(|\s)/g;
    let sdkMatch: RegExpExecArray | null;
    while ((sdkMatch = sdkRegex.exec(block)) !== null) {
      // Clean up: remove trailing parens and dots
      let call = sdkMatch[1].replace(/\.$/, '').replace(/\(\)$/, '');
      // Normalize: client.messages(sid).fetch → client.messages.fetch
      call = call.replace(/\([^)]*\)/g, '');
      if (call && !sdkCalls.includes(call)) {
        sdkCalls.push(`client.${call}`);
      }
    }

    // Extract Zod schema parameter names from the z.object({...}) block
    const params = extractZodParams(block);

    tools.push({ name, file: fileName, sdkCalls, params });
  }

  return tools;
}

/**
 * Split file content into blocks, each containing one createTool() call.
 */
function splitIntoToolBlocks(content: string): string[] {
  const blocks: string[] = [];
  const createToolRegex = /\bcreateTool\s*\(/g;
  const positions: number[] = [];

  let match: RegExpExecArray | null;
  while ((match = createToolRegex.exec(content)) !== null) {
    positions.push(match.index);
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : content.length;
    blocks.push(content.slice(start, end));
  }

  return blocks;
}

/**
 * Extract parameter names from the first z.object({...}) in a code block.
 * Handles nested objects by matching only top-level keys.
 */
function extractZodParams(block: string): string[] {
  // Find the z.object({ start
  const zodStart = block.indexOf('z.object({');
  if (zodStart === -1) return [];

  // Find the matching closing brace by counting braces
  let depth = 0;
  let schemaStart = -1;
  let schemaEnd = -1;

  for (let i = zodStart + 'z.object('.length; i < block.length; i++) {
    if (block[i] === '{') {
      if (depth === 0) schemaStart = i + 1;
      depth++;
    } else if (block[i] === '}') {
      depth--;
      if (depth === 0) {
        schemaEnd = i;
        break;
      }
    }
  }

  if (schemaStart === -1 || schemaEnd === -1) return [];

  const schemaBody = block.slice(schemaStart, schemaEnd);

  // Extract top-level property names: lines that start with a word followed by ':'
  // Must be at depth 0 (not inside nested objects)
  const params: string[] = [];
  let objDepth = 0;

  for (const line of schemaBody.split('\n')) {
    const trimmed = line.trim();

    // Track nesting depth
    for (const ch of trimmed) {
      if (ch === '{' || ch === '[') objDepth++;
      else if (ch === '}' || ch === ']') objDepth--;
    }

    // Only match at top level
    if (objDepth <= 0) {
      const paramMatch = trimmed.match(/^(\w+)\s*:/);
      if (paramMatch) {
        params.push(paramMatch[1]);
      }
    }
  }

  return params;
}

/**
 * Main extraction function.
 */
function runExtraction(): void {
  // Skip validation.ts — it's our custom deep validation, not Twilio API tools
  const SKIP_FILES = ['validation.ts'];

  const files = readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.ts') && !SKIP_FILES.includes(f))
    .sort();

  console.log(`Scanning ${files.length} tool files in ${MCP_TOOLS_DIR}...`);

  const inventory: ToolInventoryEntry[] = [];

  for (const file of files) {
    const filePath = resolve(TOOLS_DIR, file);
    const tools = extractToolsFromFile(filePath);
    console.log(`  ${file}: ${tools.length} tools`);
    inventory.push(...tools);
  }

  console.log(`\nTotal: ${inventory.length} tools extracted`);

  writeFileSync(INVENTORY_PATH, JSON.stringify(inventory, null, 2));
  console.log(`Inventory saved: ${INVENTORY_PATH}`);
}

// Export for testing
export { extractToolsFromFile, extractZodParams, splitIntoToolBlocks };

// Run if executed directly
const isMain = process.argv[1]?.endsWith('extract-inventory.ts') ||
  process.argv[1]?.includes('extract-inventory');
if (isMain) {
  runExtraction();
}
