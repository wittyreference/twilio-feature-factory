// ABOUTME: Unit tests for LLM integration generator.
// ABOUTME: Tests SDK integration code, streaming, and tool calling configuration.

import { generateLLMIntegration } from '../../src/generators/llm-integration.js';
import type { LLMIntegrationInput, GeneratedFile } from '../../src/types.js';

describe('LLM Integration Generator', () => {
  const defaultInput: LLMIntegrationInput = {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    streamingEnabled: true,
    toolCalling: false,
  };

  describe('generateLLMIntegration', () => {
    it('should return an array of GeneratedFile objects', () => {
      const result = generateLLMIntegration(defaultInput);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      result.forEach((file) => {
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('content');
        expect(file).toHaveProperty('type');
      });
    });

    it('should generate an LLM integration file', () => {
      const result = generateLLMIntegration(defaultInput);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration).toBeDefined();
      expect(integration?.path).toMatch(/llm\.(ts|js)$/);
    });

    it('should include the specified model', () => {
      const result = generateLLMIntegration(defaultInput);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('claude-sonnet-4-20250514');
    });

    it('should include ABOUTME comments', () => {
      const result = generateLLMIntegration(defaultInput);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('// ABOUTME:');
    });
  });

  describe('Anthropic provider', () => {
    it('should import Anthropic SDK', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'anthropic',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('@anthropic-ai/sdk');
      expect(integration?.content).toContain('Anthropic');
    });

    it('should use messages.stream API when streaming enabled', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'anthropic',
        streamingEnabled: true,
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('messages.stream');
    });

    it('should use messages.create API when streaming disabled', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'anthropic',
        streamingEnabled: false,
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('messages.create');
    });

    it('should reference ANTHROPIC_API_KEY env var', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'anthropic',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('ANTHROPIC_API_KEY');
    });

    it('should use streaming when enabled', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'anthropic',
        streamingEnabled: true,
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toMatch(/stream|Stream/);
    });

    it('should not use streaming when disabled', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'anthropic',
        streamingEnabled: false,
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      // Should use regular create, not stream
      expect(integration?.content).toContain('create');
    });
  });

  describe('OpenAI provider', () => {
    it('should import OpenAI SDK', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'openai',
        model: 'gpt-4o',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('openai');
      expect(integration?.content).toContain('OpenAI');
    });

    it('should use chat.completions API', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'openai',
        model: 'gpt-4o',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('chat.completions');
    });

    it('should reference OPENAI_API_KEY env var', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'openai',
        model: 'gpt-4o',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('OPENAI_API_KEY');
    });
  });

  describe('tool calling', () => {
    it('should include tools parameter when tool calling enabled', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        toolCalling: true,
        tools: [
          {
            name: 'get_weather',
            description: 'Get current weather',
            inputSchema: { type: 'object', properties: { location: { type: 'string' } } },
          },
        ],
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('tools');
      expect(integration?.content).toContain('get_weather');
    });

    it('should include tool execution handling', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        toolCalling: true,
        tools: [
          { name: 'some_tool', description: 'A tool', inputSchema: {} },
        ],
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toMatch(/tool_use|tool_calls|function_call/i);
    });

    it('should not include tools when tool calling disabled', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        toolCalling: false,
        tools: undefined,
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      // Should not have tool definitions array
      expect(integration?.content).not.toMatch(/tools\s*:\s*\[/);
    });
  });

  describe('optional parameters', () => {
    it('should include maxTokens when specified', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        maxTokens: 2048,
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('2048');
    });

    it('should use default maxTokens when not specified', () => {
      const result = generateLLMIntegration(defaultInput);
      const integration = result.find((f) => f.type === 'llm-integration');

      // Should have some max_tokens value
      expect(integration?.content).toMatch(/max_tokens|maxTokens/);
    });

    it('should include temperature when specified', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        temperature: 0.7,
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('0.7');
    });
  });

  describe('model variations', () => {
    it('should support Claude Opus', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'anthropic',
        model: 'claude-opus-4-20250514',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('claude-opus-4-20250514');
    });

    it('should support Claude Haiku', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'anthropic',
        model: 'claude-haiku-3-5-20241022',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('claude-haiku-3-5-20241022');
    });

    it('should support GPT-4o', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'openai',
        model: 'gpt-4o',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('gpt-4o');
    });

    it('should support GPT-4o-mini', () => {
      const input: LLMIntegrationInput = {
        ...defaultInput,
        provider: 'openai',
        model: 'gpt-4o-mini',
      };
      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toContain('gpt-4o-mini');
    });
  });

  describe('exported functions', () => {
    it('should export a sendMessage function', () => {
      const result = generateLLMIntegration(defaultInput);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toMatch(/export.*sendMessage|sendMessage.*export/);
    });

    it('should export conversation history management', () => {
      const result = generateLLMIntegration(defaultInput);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration?.content).toMatch(/messages|history|conversation/i);
    });
  });
});
