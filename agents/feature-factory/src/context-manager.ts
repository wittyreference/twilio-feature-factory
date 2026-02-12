// ABOUTME: Context window management for Feature Factory agentic loops.
// ABOUTME: Provides tool output truncation (Layer 1) and conversation history compaction (Layer 2).

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Configuration for context window management
 */
export interface ContextManagerConfig {
  /** Max characters for Bash tool output (default: 30,000 ~7.5k tokens) */
  bashOutputMaxChars: number;

  /** Max characters for Read tool output (default: 40,000 ~10k tokens) */
  readOutputMaxChars: number;

  /** Max characters for Grep tool output (default: 20,000 ~5k tokens) */
  grepOutputMaxChars: number;

  /** Max file paths for Glob output (default: 200) */
  globMaxPaths: number;

  /** Max characters for unrecognized tool output (default: 20,000 ~5k tokens) */
  defaultOutputMaxChars: number;

  /** Input token count that triggers compaction (default: 120,000 = 60% of 200k) */
  compactionThresholdTokens: number;

  /** Number of recent turn-pairs to keep during compaction (default: 8 = 16 messages) */
  keepRecentTurnPairs: number;
}

/**
 * Result of a truncation operation
 */
export interface TruncationResult {
  /** The (possibly truncated) output */
  output: string;

  /** Whether truncation was applied */
  wasTruncated: boolean;

  /** Original length in characters */
  originalLength: number;

  /** Truncated length in characters */
  truncatedLength: number;
}

/**
 * Result of a compaction operation
 */
export interface CompactionResult {
  /** The compacted message array */
  messages: Anthropic.MessageParam[];

  /** Number of turn-pairs removed */
  turnPairsRemoved: number;

  /** Summary text that was generated */
  summary: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONTEXT_MANAGER_CONFIG: ContextManagerConfig = {
  bashOutputMaxChars: 30_000,
  readOutputMaxChars: 40_000,
  grepOutputMaxChars: 20_000,
  globMaxPaths: 200,
  defaultOutputMaxChars: 20_000,
  compactionThresholdTokens: 120_000,
  keepRecentTurnPairs: 8,
};

// ============================================================================
// Layer 1: Tool Output Truncation
// ============================================================================

/**
 * Truncate tool output based on tool-specific strategies.
 *
 * - Bash: Head/tail split preserving errors (top) and summaries (bottom)
 * - Read: Middle truncation keeping start/end of file
 * - Grep: Character cap keeping first matches
 * - Glob: Path count cap
 * - Others: Simple character cap
 */
export function truncateToolOutput(
  toolName: string,
  output: string,
  config: ContextManagerConfig = DEFAULT_CONTEXT_MANAGER_CONFIG
): TruncationResult {
  const originalLength = output.length;

  switch (toolName) {
    case 'Bash':
      return truncateBashOutput(output, config.bashOutputMaxChars, originalLength);

    case 'Read':
      return truncateMiddle(output, config.readOutputMaxChars, originalLength);

    case 'Grep':
      return truncateGrep(output, config.grepOutputMaxChars, originalLength);

    case 'Glob':
      return truncateGlob(output, config.globMaxPaths, originalLength);

    default:
      return truncateSimple(output, config.defaultOutputMaxChars, originalLength);
  }
}

/**
 * Bash: Head/tail split — keep first 150 lines + last 150 lines.
 * Test summaries (pass/fail counts) are at the end; errors at the start.
 */
function truncateBashOutput(
  output: string,
  maxChars: number,
  originalLength: number
): TruncationResult {
  if (output.length <= maxChars) {
    return { output, wasTruncated: false, originalLength, truncatedLength: originalLength };
  }

  const lines = output.split('\n');
  const headLines = 150;
  const tailLines = 150;

  if (lines.length <= headLines + tailLines) {
    // Few lines but very long — fall back to char truncation
    return truncateMiddle(output, maxChars, originalLength);
  }

  const head = lines.slice(0, headLines).join('\n');
  const tail = lines.slice(-tailLines).join('\n');
  const omitted = lines.length - headLines - tailLines;
  const truncated = `${head}\n\n[TRUNCATED: ${omitted} lines omitted]\n\n${tail}`;

  // If still too long after line-based truncation, apply char cap
  if (truncated.length > maxChars) {
    return truncateMiddle(truncated, maxChars, originalLength);
  }

  return {
    output: truncated,
    wasTruncated: true,
    originalLength,
    truncatedLength: truncated.length,
  };
}

/**
 * Middle truncation — keep first/last portions within char limit.
 */
function truncateMiddle(
  output: string,
  maxChars: number,
  originalLength: number
): TruncationResult {
  if (output.length <= maxChars) {
    return { output, wasTruncated: false, originalLength, truncatedLength: originalLength };
  }

  const halfMax = Math.floor((maxChars - 60) / 2); // 60 chars for truncation marker
  const head = output.slice(0, halfMax);
  const tail = output.slice(-halfMax);
  const omitted = output.length - halfMax * 2;
  const truncated = `${head}\n\n[TRUNCATED: ${omitted} characters omitted]\n\n${tail}`;

  return {
    output: truncated,
    wasTruncated: true,
    originalLength,
    truncatedLength: truncated.length,
  };
}

/**
 * Grep: Character cap, keep first matches, append omitted count.
 */
function truncateGrep(
  output: string,
  maxChars: number,
  originalLength: number
): TruncationResult {
  if (output.length <= maxChars) {
    return { output, wasTruncated: false, originalLength, truncatedLength: originalLength };
  }

  const lines = output.split('\n');
  let charCount = 0;
  let keptLines = 0;

  for (const line of lines) {
    if (charCount + line.length + 1 > maxChars - 80) break; // 80 chars for marker
    charCount += line.length + 1;
    keptLines++;
  }

  const kept = lines.slice(0, keptLines).join('\n');
  const omitted = lines.length - keptLines;
  const truncated = `${kept}\n\n[TRUNCATED: ${omitted} more matches]`;

  return {
    output: truncated,
    wasTruncated: true,
    originalLength,
    truncatedLength: truncated.length,
  };
}

/**
 * Glob: Cap at maxPaths, append omitted count.
 */
function truncateGlob(
  output: string,
  maxPaths: number,
  originalLength: number
): TruncationResult {
  const paths = output.split('\n').filter(Boolean);

  if (paths.length <= maxPaths) {
    return { output, wasTruncated: false, originalLength, truncatedLength: originalLength };
  }

  const kept = paths.slice(0, maxPaths).join('\n');
  const omitted = paths.length - maxPaths;
  const truncated = `${kept}\n\n[TRUNCATED: ${omitted} more paths]`;

  return {
    output: truncated,
    wasTruncated: true,
    originalLength,
    truncatedLength: truncated.length,
  };
}

/**
 * Simple character cap with marker.
 */
function truncateSimple(
  output: string,
  maxChars: number,
  originalLength: number
): TruncationResult {
  if (output.length <= maxChars) {
    return { output, wasTruncated: false, originalLength, truncatedLength: originalLength };
  }

  const truncated = output.slice(0, maxChars) + '\n\n[TRUNCATED]';

  return {
    output: truncated,
    wasTruncated: true,
    originalLength,
    truncatedLength: truncated.length,
  };
}

// ============================================================================
// Layer 2: Conversation History Compaction
// ============================================================================

/**
 * Check if compaction should be triggered based on accumulated input tokens.
 */
export function shouldCompact(
  inputTokensUsed: number,
  config: ContextManagerConfig = DEFAULT_CONTEXT_MANAGER_CONFIG
): boolean {
  return inputTokensUsed >= config.compactionThresholdTokens;
}

/**
 * Compact conversation messages by evicting older turn-pairs and replacing
 * them with a heuristic summary appended to the initial prompt.
 *
 * Invariants:
 * - messages[0] (initial user prompt) is always preserved
 * - Last keepRecentTurnPairs * 2 messages are always preserved
 * - User/assistant alternation is maintained
 * - Summary is appended to messages[0] content
 */
export function compactMessages(
  messages: Anthropic.MessageParam[],
  config: ContextManagerConfig = DEFAULT_CONTEXT_MANAGER_CONFIG
): CompactionResult {
  const keepRecent = config.keepRecentTurnPairs * 2;

  // Not enough messages to compact — need at least initial + recent + something to evict
  if (messages.length <= keepRecent + 1) {
    return {
      messages: [...messages],
      turnPairsRemoved: 0,
      summary: '',
    };
  }

  // Partition: [initial] [evictable...] [recent...]
  const initial = messages[0];
  const evictable = messages.slice(1, messages.length - keepRecent);
  const recent = messages.slice(messages.length - keepRecent);

  // Build summary from evicted messages
  const summaryLines: string[] = [];
  const filesTouched = new Set<string>();
  let testStatus = '';

  for (let i = 0; i < evictable.length; i++) {
    const msg = evictable[i];
    const turnNumber = i + 2; // messages[0] is turn 1

    if (msg.role === 'assistant') {
      const toolSummary = extractToolSummary(msg);
      if (toolSummary) {
        summaryLines.push(`- Turn ${turnNumber}: ${toolSummary}`);
      }
    } else if (msg.role === 'user') {
      const resultSummary = extractResultSummary(msg);
      if (resultSummary.files.length > 0) {
        resultSummary.files.forEach(f => filesTouched.add(f));
      }
      if (resultSummary.testStatus) {
        testStatus = resultSummary.testStatus;
      }
    }
  }

  // Build the compaction summary block
  const turnPairsRemoved = Math.floor(evictable.length / 2);
  const evictEnd = evictable.length + 1;

  let summary = `\n\n[CONTEXT COMPACTED - Turns 2-${evictEnd} summarized]\n## Earlier work:\n`;
  summary += summaryLines.join('\n');
  if (filesTouched.size > 0) {
    summary += `\nFiles touched: ${[...filesTouched].join(', ')}`;
  }
  if (testStatus) {
    summary += `\nTest status: ${testStatus}`;
  }

  // Append summary to initial message content
  const newInitial = appendToMessageContent(initial, summary);

  return {
    messages: [newInitial, ...recent],
    turnPairsRemoved,
    summary,
  };
}

/**
 * Extract a one-line summary of tool calls from an assistant message.
 */
function extractToolSummary(msg: Anthropic.MessageParam): string {
  if (!Array.isArray(msg.content)) return '';

  const toolParts: string[] = [];

  for (const block of msg.content) {
    if (typeof block === 'object' && 'type' in block && block.type === 'tool_use') {
      const toolBlock = block as Anthropic.ToolUseBlock;
      const input = toolBlock.input as Record<string, unknown>;
      const firstArg = extractFirstArg(toolBlock.name, input);
      toolParts.push(firstArg ? `${toolBlock.name} ${firstArg}` : toolBlock.name);
    }
  }

  return toolParts.length > 0 ? toolParts.join(', ') : '';
}

/**
 * Extract the most relevant first argument from a tool call for summary.
 */
function extractFirstArg(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return typeof input.file_path === 'string' ? shortenPath(input.file_path) : '';
    case 'Bash':
      return typeof input.command === 'string' ? truncateArg(input.command, 60) : '';
    case 'Grep':
      return typeof input.pattern === 'string' ? `"${truncateArg(input.pattern, 30)}"` : '';
    case 'Glob':
      return typeof input.pattern === 'string' ? input.pattern : '';
    default:
      return '';
  }
}

/**
 * Extract file paths and test status from tool_result messages.
 */
function extractResultSummary(msg: Anthropic.MessageParam): {
  files: string[];
  testStatus: string;
} {
  const files: string[] = [];
  let testStatus = '';

  if (!Array.isArray(msg.content)) return { files, testStatus };

  for (const block of msg.content) {
    if (typeof block === 'object' && 'type' in block && block.type === 'tool_result') {
      const resultBlock = block as Anthropic.ToolResultBlockParam;
      const content = typeof resultBlock.content === 'string' ? resultBlock.content : '';

      // Extract test results from Bash output
      const testMatch = content.match(/Tests:\s*(\d+)\s*passed,?\s*(\d+)?\s*failed?/i);
      if (testMatch) {
        testStatus = testMatch[0];
      }

      // Alternative test result format from Jest
      const jestMatch = content.match(/Test Suites:.*\nTests:.*(?:passed|failed)/m);
      if (jestMatch) {
        testStatus = jestMatch[0].replace(/\n/g, ', ');
      }

      // Extract file paths from content
      const pathMatches = content.match(/(?:\/[\w./-]+\.(?:ts|js|json|md))/g);
      if (pathMatches) {
        files.push(...pathMatches.slice(0, 5)); // Limit to 5 most relevant
      }
    }
  }

  return { files, testStatus };
}

/**
 * Append text to a message's content, handling both string and array content.
 */
function appendToMessageContent(
  msg: Anthropic.MessageParam,
  text: string
): Anthropic.MessageParam {
  if (typeof msg.content === 'string') {
    return { ...msg, content: msg.content + text };
  }

  if (Array.isArray(msg.content)) {
    // Find the last text block and append to it
    const newContent = [...msg.content];
    let lastTextIndex = -1;
    for (let i = newContent.length - 1; i >= 0; i--) {
      const b = newContent[i];
      if (typeof b === 'object' && 'type' in b && b.type === 'text') {
        lastTextIndex = i;
        break;
      }
    }

    if (lastTextIndex >= 0) {
      const textBlock = newContent[lastTextIndex] as Anthropic.TextBlockParam;
      newContent[lastTextIndex] = { ...textBlock, text: textBlock.text + text };
    } else {
      // No text block exists, add one
      newContent.push({ type: 'text', text });
    }

    return { ...msg, content: newContent };
  }

  return msg;
}

/**
 * Shorten a file path for summary display.
 */
function shortenPath(filePath: string): string {
  const parts = filePath.split('/');
  if (parts.length <= 3) return filePath;
  return `.../${parts.slice(-3).join('/')}`;
}

/**
 * Truncate a string argument for display.
 */
function truncateArg(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + '...';
}
