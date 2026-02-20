// ABOUTME: Tests for the MCP tool inventory extraction logic.
// ABOUTME: Verifies regex-based extraction of tool names, SDK calls, and Zod params.

import { extractToolsFromFile, extractZodParams, splitIntoToolBlocks } from '../extract-inventory.js';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SAMPLE_TOOL_FILE = `
import { z } from 'zod';

function createTool(name, description, schema, handler) {
  return { name, description, inputSchema: schema, handler };
}

export function sampleTools(context) {
  const { client } = context;

  const listItems = createTool(
    'list_items',
    'List all items.',
    z.object({
      limit: z.number().optional().describe('Max results'),
      status: z.enum(['active', 'closed']).optional(),
    }),
    async ({ limit, status }) => {
      const items = await client.items.list({ limit });
      return { content: [{ type: 'text', text: JSON.stringify(items) }] };
    }
  );

  const createItem = createTool(
    'create_item',
    'Create a new item.',
    z.object({
      name: z.string().describe('Item name'),
      value: z.number().describe('Item value'),
      tags: z.array(z.string()).optional(),
    }),
    async ({ name, value, tags }) => {
      const item = await client.items.create({ name, value, tags });
      return { content: [{ type: 'text', text: JSON.stringify(item) }] };
    }
  );

  return [listItems, createItem];
}
`;

describe('Tool extraction', () => {
  let tempFile: string;

  beforeAll(() => {
    tempFile = resolve(tmpdir(), 'test-tools.ts');
    writeFileSync(tempFile, SAMPLE_TOOL_FILE);
  });

  afterAll(() => {
    try { unlinkSync(tempFile); } catch {}
  });

  test('extracts correct number of tools', () => {
    const tools = extractToolsFromFile(tempFile);
    expect(tools).toHaveLength(2);
  });

  test('extracts tool names', () => {
    const tools = extractToolsFromFile(tempFile);
    expect(tools[0].name).toBe('list_items');
    expect(tools[1].name).toBe('create_item');
  });

  test('extracts SDK calls', () => {
    const tools = extractToolsFromFile(tempFile);
    expect(tools[0].sdkCalls).toContain('client.items.list');
    expect(tools[1].sdkCalls).toContain('client.items.create');
  });

  test('extracts Zod parameter names', () => {
    const tools = extractToolsFromFile(tempFile);
    expect(tools[0].params).toEqual(expect.arrayContaining(['limit', 'status']));
    expect(tools[1].params).toEqual(expect.arrayContaining(['name', 'value', 'tags']));
  });
});

describe('splitIntoToolBlocks', () => {
  test('splits content at createTool boundaries', () => {
    const content = `
      const a = createTool('a', 'desc', schema, handler);
      const b = createTool('b', 'desc', schema, handler);
    `;
    const blocks = splitIntoToolBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain("'a'");
    expect(blocks[1]).toContain("'b'");
  });
});

describe('extractZodParams', () => {
  test('extracts top-level params from z.object', () => {
    const block = `
      createTool('test', 'desc',
        z.object({
          name: z.string(),
          age: z.number().optional(),
          active: z.boolean(),
        }),
        async () => {}
      );
    `;
    const params = extractZodParams(block);
    expect(params).toEqual(expect.arrayContaining(['name', 'age', 'active']));
  });

  test('returns empty array when no z.object found', () => {
    const params = extractZodParams('no zod here');
    expect(params).toEqual([]);
  });
});
