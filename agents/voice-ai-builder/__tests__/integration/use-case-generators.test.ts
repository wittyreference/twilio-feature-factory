// ABOUTME: Integration tests for use case configs with generators.
// ABOUTME: Tests that generators produce valid output when using use case configs.

import { generateTwimlHandler } from '../../src/generators/twiml-handler.js';
import { generateWebSocketServer } from '../../src/generators/websocket-server.js';
import { generateLLMIntegration } from '../../src/generators/llm-integration.js';
import {
  getUseCaseConfig,
  customerServiceConfig,
  appointmentBookingConfig,
  basicAssistantConfig,
} from '../../src/use-cases/index.js';
import type {
  TwimlGeneratorInput,
  WebSocketGeneratorInput,
  LLMIntegrationInput,
} from '../../src/types.js';

describe('Use Case Integration: customer-service', () => {
  const config = customerServiceConfig;

  describe('TwiML Handler Generation', () => {
    it('should generate valid TwiML handler from config', () => {
      const input: TwimlGeneratorInput = {
        useCaseType: 'customer-service',
        relayUrl: 'wss://example.com/relay',
        voiceOptions: {
          voice: config.defaultVoice,
          language: config.defaultLanguage,
        },
        dtmfEnabled: true,
        interruptible: true,
      };

      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler).toBeDefined();
      expect(handler?.content).toContain(config.defaultVoice);
      expect(handler?.content).toContain(config.defaultLanguage);
    });
  });

  describe('WebSocket Server Generation', () => {
    it('should generate valid WebSocket server from config', () => {
      const input: WebSocketGeneratorInput = {
        llmProvider: 'anthropic',
        systemPrompt: config.systemPrompt,
        tools: config.defaultTools,
        maxTurns: config.conversationConfig?.maxTurns || 30,
        contextManagement: 'sliding-window',
      };

      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server).toBeDefined();
      expect(server?.content).toContain('setup');
      expect(server?.content).toContain('prompt');
      // Should include tool names
      for (const tool of config.defaultTools) {
        expect(server?.content).toContain(tool.name);
      }
    });

    it('should include escalation handling when tools include transfer', () => {
      const input: WebSocketGeneratorInput = {
        llmProvider: 'anthropic',
        systemPrompt: config.systemPrompt,
        tools: config.defaultTools,
        maxTurns: 30,
        contextManagement: 'sliding-window',
      };

      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('transfer_to_agent');
    });
  });

  describe('LLM Integration Generation', () => {
    it('should generate LLM integration with tool calling for customer-service', () => {
      const input: LLMIntegrationInput = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        streamingEnabled: true,
        toolCalling: true,
        tools: config.defaultTools,
      };

      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration).toBeDefined();
      expect(integration?.content).toContain('tools');
      expect(integration?.content).toContain('lookup_account');
      expect(integration?.content).toContain('check_order_status');
      expect(integration?.content).toContain('transfer_to_agent');
    });
  });
});

describe('Use Case Integration: appointment-booking', () => {
  const config = appointmentBookingConfig;

  describe('TwiML Handler Generation', () => {
    it('should use Google Neural voice for appointment booking', () => {
      const input: TwimlGeneratorInput = {
        useCaseType: 'appointment-booking',
        relayUrl: 'wss://example.com/relay',
        voiceOptions: {
          voice: config.defaultVoice,
          language: config.defaultLanguage,
        },
        dtmfEnabled: true,
        interruptible: true,
      };

      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('Google.en-US-Neural2-F');
    });
  });

  describe('WebSocket Server Generation', () => {
    it('should include all appointment tools', () => {
      const input: WebSocketGeneratorInput = {
        llmProvider: 'anthropic',
        systemPrompt: config.systemPrompt,
        tools: config.defaultTools,
        maxTurns: config.conversationConfig?.maxTurns || 25,
        contextManagement: 'sliding-window',
      };

      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server?.content).toContain('check_availability');
      expect(server?.content).toContain('book_appointment');
      expect(server?.content).toContain('cancel_appointment');
      expect(server?.content).toContain('reschedule_appointment');
      expect(server?.content).toContain('get_appointment_details');
    });
  });

  describe('LLM Integration Generation', () => {
    it('should generate LLM integration with 5 tools', () => {
      const input: LLMIntegrationInput = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        streamingEnabled: true,
        toolCalling: true,
        tools: config.defaultTools,
      };

      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      // Count tool occurrences (each tool should appear once in definition)
      const toolNames = config.defaultTools.map((t) => t.name);
      for (const name of toolNames) {
        expect(integration?.content).toContain(name);
      }
    });
  });
});

describe('Use Case Integration: basic-assistant', () => {
  const config = basicAssistantConfig;

  describe('WebSocket Server Generation', () => {
    it('should work without tools', () => {
      const input: WebSocketGeneratorInput = {
        llmProvider: 'anthropic',
        systemPrompt: config.systemPrompt,
        tools: config.defaultTools, // Empty array
        maxTurns: config.conversationConfig?.maxTurns || 20,
        contextManagement: 'sliding-window',
      };

      const result = generateWebSocketServer(input);
      const server = result.find((f) => f.type === 'websocket-server');

      expect(server).toBeDefined();
      // Should not have tools section
      expect(server?.content).not.toMatch(/tools\s*:\s*\[/);
    });
  });

  describe('LLM Integration Generation', () => {
    it('should generate LLM integration without tool calling', () => {
      const input: LLMIntegrationInput = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        streamingEnabled: true,
        toolCalling: false,
        tools: [],
      };

      const result = generateLLMIntegration(input);
      const integration = result.find((f) => f.type === 'llm-integration');

      expect(integration).toBeDefined();
      // Should not have tools definition
      expect(integration?.content).not.toMatch(/const tools = \[/);
    });
  });
});

describe('getUseCaseConfig integration', () => {
  it('should retrieve customer-service config correctly', () => {
    const config = getUseCaseConfig('customer-service');
    expect(config).toBe(customerServiceConfig);
  });

  it('should retrieve appointment-booking config correctly', () => {
    const config = getUseCaseConfig('appointment-booking');
    expect(config).toBe(appointmentBookingConfig);
  });

  it('should retrieve basic-assistant config correctly', () => {
    const config = getUseCaseConfig('basic-assistant');
    expect(config).toBe(basicAssistantConfig);
  });
});

describe('Full Pipeline Simulation: customer-service', () => {
  it('should generate all three components for customer-service use case', () => {
    const config = getUseCaseConfig('customer-service');

    // Generate TwiML handler
    const twimlInput: TwimlGeneratorInput = {
      useCaseType: 'customer-service',
      relayUrl: 'wss://voice-ai.example.com/relay',
      voiceOptions: {
        voice: config.defaultVoice,
        language: config.defaultLanguage,
        transcriptionProvider: 'google',
        speechModel: 'telephony',
      },
      dtmfEnabled: true,
      interruptible: config.conversationConfig?.interruptible ?? true,
    };
    const twimlResult = generateTwimlHandler(twimlInput);

    // Generate WebSocket server
    const wsInput: WebSocketGeneratorInput = {
      llmProvider: 'anthropic',
      systemPrompt: config.systemPrompt,
      tools: config.defaultTools,
      maxTurns: config.conversationConfig?.maxTurns || 30,
      contextManagement: 'sliding-window',
    };
    const wsResult = generateWebSocketServer(wsInput);

    // Generate LLM integration
    const llmInput: LLMIntegrationInput = {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      streamingEnabled: true,
      toolCalling: config.defaultTools.length > 0,
      tools: config.defaultTools,
      maxTokens: 1024,
    };
    const llmResult = generateLLMIntegration(llmInput);

    // Verify all components generated
    expect(twimlResult.find((f) => f.type === 'twiml-handler')).toBeDefined();
    expect(wsResult.find((f) => f.type === 'websocket-server')).toBeDefined();
    expect(llmResult.find((f) => f.type === 'llm-integration')).toBeDefined();

    // Verify TwiML references WebSocket URL
    const twimlHandler = twimlResult.find((f) => f.type === 'twiml-handler');
    expect(twimlHandler?.content).toContain('wss://voice-ai.example.com/relay');

    // Verify WebSocket handles ConversationRelay messages
    const wsServer = wsResult.find((f) => f.type === 'websocket-server');
    expect(wsServer?.content).toContain("case 'setup'");
    expect(wsServer?.content).toContain("case 'prompt'");
    expect(wsServer?.content).toContain("case 'dtmf'");
    expect(wsServer?.content).toContain("case 'interrupt'");

    // Verify LLM integration has streaming
    const llmIntegration = llmResult.find((f) => f.type === 'llm-integration');
    expect(llmIntegration?.content).toContain('messages.stream');
  });
});
