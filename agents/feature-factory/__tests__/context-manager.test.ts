// ABOUTME: Unit tests for context window management module.
// ABOUTME: Tests tool output truncation (Layer 1) and conversation history compaction (Layer 2).

import { describe, it, expect } from '@jest/globals';
import type Anthropic from '@anthropic-ai/sdk';
import {
  truncateToolOutput,
  shouldCompact,
  compactMessages,
  DEFAULT_CONTEXT_MANAGER_CONFIG,
  type ContextManagerConfig,
} from '../src/context-manager.js';

// ============================================================================
// Layer 1: Tool Output Truncation
// ============================================================================

describe('truncateToolOutput', () => {
  describe('Bash', () => {
    it('should pass through short output unchanged', () => {
      const output = 'npm test passed\n5 tests, 0 failures';
      const result = truncateToolOutput('Bash', output);
      expect(result.wasTruncated).toBe(false);
      expect(result.output).toBe(output);
      expect(result.originalLength).toBe(output.length);
      expect(result.truncatedLength).toBe(output.length);
    });

    it('should truncate long output with head/tail split', () => {
      // Create output with 500 lines
      const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}: ${'x'.repeat(50)}`);
      const output = lines.join('\n');

      const result = truncateToolOutput('Bash', output, {
        ...DEFAULT_CONTEXT_MANAGER_CONFIG,
        bashOutputMaxChars: 20_000,
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.truncatedLength).toBeLessThan(result.originalLength);
      expect(result.output).toContain('[TRUNCATED:');
      expect(result.output).toContain('lines omitted');
      // Should contain early lines (errors)
      expect(result.output).toContain('line 1:');
      // Should contain late lines (test summaries)
      expect(result.output).toContain('line 500:');
    });

    it('should include line count in truncation marker', () => {
      const lines = Array.from({ length: 400 }, (_, i) => `line ${i}: ${'x'.repeat(80)}`);
      const output = lines.join('\n');

      const result = truncateToolOutput('Bash', output, {
        ...DEFAULT_CONTEXT_MANAGER_CONFIG,
        bashOutputMaxChars: 30_000,
      });

      expect(result.wasTruncated).toBe(true);
      // 400 total - 150 head - 150 tail = 100 omitted
      expect(result.output).toContain('[TRUNCATED: 100 lines omitted]');
    });
  });

  describe('Read', () => {
    it('should pass through short output unchanged', () => {
      const output = 'const x = 1;\nconst y = 2;';
      const result = truncateToolOutput('Read', output);
      expect(result.wasTruncated).toBe(false);
      expect(result.output).toBe(output);
    });

    it('should apply middle truncation for long output', () => {
      const output = 'A'.repeat(50_000);
      const result = truncateToolOutput('Read', output);

      expect(result.wasTruncated).toBe(true);
      expect(result.output).toContain('[TRUNCATED:');
      expect(result.output).toContain('characters omitted');
      // Should have content from start
      expect(result.output.startsWith('A')).toBe(true);
      // Should have content from end
      expect(result.output.endsWith('A')).toBe(true);
    });
  });

  describe('Grep', () => {
    it('should pass through short output unchanged', () => {
      const output = 'file1.ts:10: match1\nfile2.ts:20: match2';
      const result = truncateToolOutput('Grep', output);
      expect(result.wasTruncated).toBe(false);
    });

    it('should truncate keeping first matches with count', () => {
      const lines = Array.from({ length: 500 }, (_, i) => `file${i}.ts:${i}: match text here`);
      const output = lines.join('\n');

      const result = truncateToolOutput('Grep', output, {
        ...DEFAULT_CONTEXT_MANAGER_CONFIG,
        grepOutputMaxChars: 5_000,
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.output).toContain('[TRUNCATED:');
      expect(result.output).toContain('more matches');
      // First matches should be preserved
      expect(result.output).toContain('file0.ts');
    });
  });

  describe('Glob', () => {
    it('should pass through when under path limit', () => {
      const paths = Array.from({ length: 50 }, (_, i) => `/src/file${i}.ts`);
      const output = paths.join('\n');
      const result = truncateToolOutput('Glob', output);
      expect(result.wasTruncated).toBe(false);
    });

    it('should cap at maxPaths with omitted count', () => {
      const paths = Array.from({ length: 300 }, (_, i) => `/src/file${i}.ts`);
      const output = paths.join('\n');

      const result = truncateToolOutput('Glob', output);

      expect(result.wasTruncated).toBe(true);
      expect(result.output).toContain('[TRUNCATED: 100 more paths]');
      // First 200 paths should be present
      expect(result.output).toContain('/src/file0.ts');
      expect(result.output).toContain('/src/file199.ts');
      // Path 200+ should not be present (before the marker)
      expect(result.output).not.toContain('/src/file200.ts');
    });
  });

  describe('unknown tools', () => {
    it('should apply default max chars', () => {
      const output = 'X'.repeat(25_000);
      const result = truncateToolOutput('SomeUnknownTool', output);

      expect(result.wasTruncated).toBe(true);
      expect(result.output).toContain('[TRUNCATED]');
      expect(result.truncatedLength).toBeLessThanOrEqual(
        DEFAULT_CONTEXT_MANAGER_CONFIG.defaultOutputMaxChars + 20
      );
    });

    it('should pass through short output for unknown tools', () => {
      const output = 'short output';
      const result = truncateToolOutput('SomeUnknownTool', output);
      expect(result.wasTruncated).toBe(false);
      expect(result.output).toBe(output);
    });
  });
});

// ============================================================================
// Layer 2: Conversation History Compaction
// ============================================================================

describe('shouldCompact', () => {
  it('should return false when below threshold', () => {
    expect(shouldCompact(80_000)).toBe(false);
  });

  it('should return true when at or above threshold', () => {
    expect(shouldCompact(120_000)).toBe(true);
    expect(shouldCompact(150_000)).toBe(true);
  });

  it('should respect custom threshold', () => {
    const config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, compactionThresholdTokens: 50_000 };
    expect(shouldCompact(40_000, config)).toBe(false);
    expect(shouldCompact(50_000, config)).toBe(true);
  });
});

describe('compactMessages', () => {
  /**
   * Helper to create a minimal assistant message with tool_use
   */
  function makeAssistantToolMsg(toolName: string, input: Record<string, unknown>): Anthropic.MessageParam {
    return {
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use' as const,
          id: `tool_${Math.random().toString(36).slice(2)}`,
          name: toolName,
          input,
        },
      ],
    };
  }

  /**
   * Helper to create a tool_result user message
   */
  function makeToolResultMsg(toolUseId: string, output: string): Anthropic.MessageParam {
    return {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: toolUseId,
          content: output,
        },
      ],
    };
  }

  it('should be a no-op for short conversations', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Initial prompt' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Follow-up' },
    ];

    const result = compactMessages(messages);
    expect(result.turnPairsRemoved).toBe(0);
    expect(result.messages).toHaveLength(3);
    expect(result.summary).toBe('');
  });

  it('should preserve the initial prompt message', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Initial task description' },
    ];

    // Add 20 turn-pairs (40 messages) to exceed keepRecent
    for (let i = 0; i < 20; i++) {
      const assistantMsg = makeAssistantToolMsg('Read', { file_path: `/src/file${i}.ts` });
      messages.push(assistantMsg);

      const toolUseId = ((assistantMsg.content as Anthropic.ToolUseBlock[])[0]).id;
      messages.push(makeToolResultMsg(toolUseId, `contents of file${i}`));
    }

    const result = compactMessages(messages);
    expect(result.messages[0].role).toBe('user');
    // Initial content should still be there
    const content = result.messages[0].content as string;
    expect(content).toContain('Initial task description');
  });

  it('should preserve recent turn-pairs', () => {
    const config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, keepRecentTurnPairs: 4 };
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Initial prompt' },
    ];

    // Add 12 turn-pairs (24 messages)
    for (let i = 0; i < 12; i++) {
      const assistantMsg = makeAssistantToolMsg('Bash', { command: `echo "step ${i}"` });
      messages.push(assistantMsg);

      const toolUseId = ((assistantMsg.content as Anthropic.ToolUseBlock[])[0]).id;
      messages.push(makeToolResultMsg(toolUseId, `output of step ${i}`));
    }

    const result = compactMessages(messages, config);

    // Should have: 1 initial + 8 recent (4 pairs * 2) = 9
    expect(result.messages).toHaveLength(9);
    expect(result.turnPairsRemoved).toBeGreaterThan(0);
  });

  it('should create a summary of evicted turns', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Build a feature' },
    ];

    // Add turns with recognizable tool calls
    const readMsg = makeAssistantToolMsg('Read', { file_path: '/src/tools.ts' });
    messages.push(readMsg);
    const readToolId = ((readMsg.content as Anthropic.ToolUseBlock[])[0]).id;
    messages.push(makeToolResultMsg(readToolId, 'file contents'));

    const writeMsg = makeAssistantToolMsg('Write', { file_path: '/src/new-file.ts' });
    messages.push(writeMsg);
    const writeToolId = ((writeMsg.content as Anthropic.ToolUseBlock[])[0]).id;
    messages.push(makeToolResultMsg(writeToolId, 'file written'));

    const bashMsg = makeAssistantToolMsg('Bash', { command: 'npm test' });
    messages.push(bashMsg);
    const bashToolId = ((bashMsg.content as Anthropic.ToolUseBlock[])[0]).id;
    messages.push(makeToolResultMsg(bashToolId, 'Tests: 3 passed, 2 failed'));

    // Add enough recent turns to trigger compaction
    for (let i = 0; i < 10; i++) {
      const msg = makeAssistantToolMsg('Edit', { file_path: `/src/recent${i}.ts` });
      messages.push(msg);
      const toolId = ((msg.content as Anthropic.ToolUseBlock[])[0]).id;
      messages.push(makeToolResultMsg(toolId, 'edited'));
    }

    const config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, keepRecentTurnPairs: 4 };
    const result = compactMessages(messages, config);

    // Summary should reference the evicted tools
    expect(result.summary).toContain('CONTEXT COMPACTED');
    expect(result.summary).toContain('Read');
    expect(result.summary).toContain('tools.ts');
  });

  it('should maintain user/assistant message alternation', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Start' },
    ];

    for (let i = 0; i < 15; i++) {
      messages.push({ role: 'assistant', content: `Response ${i}` });
      messages.push({ role: 'user', content: `Followup ${i}` });
    }

    const config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, keepRecentTurnPairs: 4 };
    const result = compactMessages(messages, config);

    // Check alternation: first should be user, then alternate
    expect(result.messages[0].role).toBe('user');
    for (let i = 1; i < result.messages.length; i++) {
      const expected = i % 2 === 1 ? 'assistant' : 'user';
      expect(result.messages[i].role).toBe(expected);
    }
  });

  it('should extract test results from Bash output into summary', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Implement tests' },
    ];

    const bashMsg = makeAssistantToolMsg('Bash', { command: 'npm test' });
    messages.push(bashMsg);
    const bashToolId = ((bashMsg.content as Anthropic.ToolUseBlock[])[0]).id;
    messages.push(makeToolResultMsg(bashToolId, 'Tests: 10 passed, 3 failed'));

    // Add enough recent messages
    for (let i = 0; i < 10; i++) {
      messages.push({ role: 'assistant', content: `step ${i}` });
      messages.push({ role: 'user', content: `result ${i}` });
    }

    const config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, keepRecentTurnPairs: 4 };
    const result = compactMessages(messages, config);

    expect(result.summary).toContain('Test status:');
    expect(result.summary).toContain('10 passed');
  });

  it('should extract file paths from tool results into summary', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Read some files' },
    ];

    const readMsg = makeAssistantToolMsg('Read', { file_path: '/src/index.ts' });
    messages.push(readMsg);
    const readToolId = ((readMsg.content as Anthropic.ToolUseBlock[])[0]).id;
    messages.push(makeToolResultMsg(readToolId, 'Content of /src/index.ts and /src/utils.ts'));

    // Add enough recent messages
    for (let i = 0; i < 10; i++) {
      messages.push({ role: 'assistant', content: `step ${i}` });
      messages.push({ role: 'user', content: `result ${i}` });
    }

    const config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, keepRecentTurnPairs: 4 };
    const result = compactMessages(messages, config);

    expect(result.summary).toContain('Files touched:');
    expect(result.summary).toContain('/src/index.ts');
  });

  it('should handle multi-tool turns in assistant messages', () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'Do work' },
    ];

    // Assistant message with multiple tool calls
    messages.push({
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tool_1', name: 'Read', input: { file_path: '/src/a.ts' } },
        { type: 'tool_use', id: 'tool_2', name: 'Grep', input: { pattern: 'TODO' } },
      ],
    } as Anthropic.MessageParam);

    messages.push({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tool_1', content: 'file a contents' },
        { type: 'tool_result', tool_use_id: 'tool_2', content: 'grep results' },
      ],
    } as Anthropic.MessageParam);

    // Add enough recent turns
    for (let i = 0; i < 10; i++) {
      messages.push({ role: 'assistant', content: `step ${i}` });
      messages.push({ role: 'user', content: `result ${i}` });
    }

    const config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, keepRecentTurnPairs: 4 };
    const result = compactMessages(messages, config);

    // Summary should mention both tools
    expect(result.summary).toContain('Read');
    expect(result.summary).toContain('Grep');
  });

  it('should append summary to initial message with array content', () => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Initial task' }],
      } as Anthropic.MessageParam,
    ];

    for (let i = 0; i < 20; i++) {
      messages.push({ role: 'assistant', content: `step ${i}` });
      messages.push({ role: 'user', content: `result ${i}` });
    }

    const config = { ...DEFAULT_CONTEXT_MANAGER_CONFIG, keepRecentTurnPairs: 4 };
    const result = compactMessages(messages, config);

    // Initial message should contain the summary
    const initialContent = result.messages[0].content;
    expect(Array.isArray(initialContent)).toBe(true);
    if (Array.isArray(initialContent)) {
      const textBlock = initialContent.find(
        (b: unknown) => typeof b === 'object' && b !== null && 'type' in b && (b as { type: string }).type === 'text'
      ) as { type: string; text: string } | undefined;
      expect(textBlock).toBeDefined();
      expect(textBlock?.text).toContain('CONTEXT COMPACTED');
    }
  });
});
