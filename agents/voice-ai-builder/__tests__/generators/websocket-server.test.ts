// ABOUTME: Unit tests for WebSocket server generator.
// ABOUTME: Tests server scaffolding, message handling, and LLM integration code.

import { generateWebSocketServer } from '../../src/generators/websocket-server.js';
import type { WebSocketGeneratorInput, GeneratedFile } from '../../src/types.js';

describe('WebSocket Server Generator', () => {
  const defaultInput: WebSocketGeneratorInput = {
    llmProvider: 'anthropic',
    systemPrompt: 'You are a helpful assistant.',
    tools: [],
    maxTurns: 50,
    contextManagement: 'sliding-window',
  };

  describe('generateWebSocketServer', () => {
    it('should return an array of GeneratedFile objects', () => {
      const result = generateWebSocketServer(defaultInput);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      result.forEach((file) => {
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('content');
        expect(file).toHaveProperty('type');
      });
    });

    it('should generate a WebSocket server file', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server).toBeDefined();
      expect(server?.path).toMatch(/server\.(ts|js)$/);
    });

    it('should include WebSocket connection handling', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('WebSocket');
      expect(server?.content).toMatch(/on\s*\(\s*['"]connection['"]/);
    });

    it('should include message type handling for setup', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('setup');
      expect(server?.content).toContain('callSid');
    });

    it('should include message type handling for prompt', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('prompt');
      expect(server?.content).toContain('voicePrompt');
      expect(server?.content).toContain('.last');
    });

    it('should include message type handling for dtmf', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('dtmf');
      expect(server?.content).toContain('digit');
    });

    it('should include message type handling for interrupt', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('interrupt');
    });

    it('should include text response sending', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toMatch(/type.*text/);
      expect(server?.content).toContain('token');
    });

    it('should include end message sending', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toMatch(/type.*end/);
    });

    it('should include the system prompt', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('You are a helpful assistant.');
    });

    it('should include max turns configuration', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('50');
    });

    it('should include ABOUTME comments', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('// ABOUTME:');
    });
  });

  describe('LLM provider variations', () => {
    it('should generate Anthropic SDK import for anthropic provider', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        llmProvider: 'anthropic',
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('@anthropic-ai/sdk');
      expect(server?.content).toContain('Anthropic');
    });

    it('should generate OpenAI SDK import for openai provider', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        llmProvider: 'openai',
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('openai');
      expect(server?.content).toContain('OpenAI');
    });

    it('should generate placeholder for custom provider', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        llmProvider: 'custom',
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('TODO');
      expect(server?.content).toContain('custom');
    });
  });

  describe('tools configuration', () => {
    it('should include tool definitions when provided', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        tools: [
          {
            name: 'lookup_account',
            description: 'Look up customer account',
            inputSchema: { type: 'object', properties: { accountId: { type: 'string' } } },
          },
        ],
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('lookup_account');
      expect(server?.content).toContain('Look up customer account');
    });

    it('should include multiple tools', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        tools: [
          { name: 'tool_one', description: 'First tool', inputSchema: {} },
          { name: 'tool_two', description: 'Second tool', inputSchema: {} },
        ],
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('tool_one');
      expect(server?.content).toContain('tool_two');
    });

    it('should handle empty tools array', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        tools: [],
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server).toBeDefined();
      // Should still generate valid code
      expect(server?.content).toContain('WebSocket');
    });
  });

  describe('context management', () => {
    it('should include sliding-window context management', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        contextManagement: 'sliding-window',
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toMatch(/sliding|window|slice/i);
    });

    it('should include summary context management', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        contextManagement: 'summary',
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toMatch(/summary|summarize/i);
    });

    it('should include full context management', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        contextManagement: 'full',
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      // Full context means no truncation
      expect(server).toBeDefined();
    });
  });

  describe('optional configuration', () => {
    it('should include custom port when specified', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        port: 9000,
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('9000');
    });

    it('should use default port when not specified', () => {
      const result = generateWebSocketServer(defaultInput);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toMatch(/8080|PORT/);
    });

    it('should include debug logging when enabled', () => {
      const input: WebSocketGeneratorInput = {
        ...defaultInput,
        debug: true,
      };
      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toMatch(/debug|console\.log/i);
    });
  });
});
