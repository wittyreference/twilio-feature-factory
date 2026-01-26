// ABOUTME: Unit tests for TwiML handler generator.
// ABOUTME: Tests template generation, variable substitution, and output validation.

import { generateTwimlHandler } from '../../src/generators/twiml-handler.js';
import type { TwimlGeneratorInput, GeneratedFile } from '../../src/types.js';

describe('TwiML Handler Generator', () => {
  const defaultInput: TwimlGeneratorInput = {
    useCaseType: 'basic-assistant',
    relayUrl: 'wss://example.com/relay',
    voiceOptions: {
      voice: 'Polly.Matthew',
      language: 'en-US',
    },
    dtmfEnabled: true,
    interruptible: true,
  };

  describe('generateTwimlHandler', () => {
    it('should return an array of GeneratedFile objects', () => {
      const result = generateTwimlHandler(defaultInput);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      result.forEach((file) => {
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('content');
        expect(file).toHaveProperty('type');
      });
    });

    it('should generate a TwiML handler file with correct path', () => {
      const result = generateTwimlHandler(defaultInput);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler).toBeDefined();
      expect(handler?.path).toMatch(/\.protected\.js$/);
      expect(handler?.path).toContain('functions/');
    });

    it('should include ConversationRelay configuration in output', () => {
      const result = generateTwimlHandler(defaultInput);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('conversationRelay');
      expect(handler?.content).toContain(defaultInput.relayUrl);
    });

    it('should include voice configuration', () => {
      const result = generateTwimlHandler(defaultInput);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain(defaultInput.voiceOptions.voice);
      expect(handler?.content).toContain(defaultInput.voiceOptions.language);
    });

    it('should include DTMF detection when enabled', () => {
      const result = generateTwimlHandler({ ...defaultInput, dtmfEnabled: true });
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('dtmfDetection');
      expect(handler?.content).toMatch(/dtmfDetection.*true/i);
    });

    it('should disable DTMF detection when disabled', () => {
      const result = generateTwimlHandler({ ...defaultInput, dtmfEnabled: false });
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toMatch(/dtmfDetection.*false/i);
    });

    it('should include interruptible setting', () => {
      const result = generateTwimlHandler({ ...defaultInput, interruptible: true });
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('interruptible');
      expect(handler?.content).toMatch(/interruptible.*true/i);
    });

    it('should include welcome greeting when provided', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        welcomeGreeting: 'Welcome to our service!',
      };
      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('Welcome to our service!');
      expect(handler?.content).toContain('say');
    });

    it('should not include welcome greeting when not provided', () => {
      const result = generateTwimlHandler(defaultInput);
      const handler = result.find((f) => f.type === 'twiml-handler');

      // Should not have a standalone say before connect
      expect(handler?.content).not.toMatch(/\.say\([^)]+\);\s*const connect/);
    });

    it('should include profanity filter when enabled', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        profanityFilter: true,
      };
      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('profanityFilter');
    });

    it('should include ABOUTME comments', () => {
      const result = generateTwimlHandler(defaultInput);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('// ABOUTME:');
    });

    it('should include proper exports.handler signature', () => {
      const result = generateTwimlHandler(defaultInput);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('exports.handler');
      expect(handler?.content).toContain('context');
      expect(handler?.content).toContain('event');
      expect(handler?.content).toContain('callback');
    });

    it('should include status callback when provided', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        statusCallback: 'https://example.com/status',
      };
      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('statusCallback');
      expect(handler?.content).toContain('https://example.com/status');
    });
  });

  describe('use case variations', () => {
    it('should handle basic-assistant use case', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        useCaseType: 'basic-assistant',
      };
      const result = generateTwimlHandler(input);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle customer-service use case', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        useCaseType: 'customer-service',
      };
      const result = generateTwimlHandler(input);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle appointment-booking use case', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        useCaseType: 'appointment-booking',
      };
      const result = generateTwimlHandler(input);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle custom use case', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        useCaseType: 'custom',
      };
      const result = generateTwimlHandler(input);

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('voice options variations', () => {
    it('should support Google voices', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        voiceOptions: {
          voice: 'Google.en-US-Neural2-D',
          language: 'en-US',
        },
      };
      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('Google.en-US-Neural2-D');
    });

    it('should support Spanish language', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        voiceOptions: {
          voice: 'Polly.Miguel',
          language: 'es-ES',
        },
      };
      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('es-ES');
    });

    it('should include transcription provider when specified', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        voiceOptions: {
          ...defaultInput.voiceOptions,
          transcriptionProvider: 'deepgram',
        },
      };
      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('deepgram');
    });

    it('should include speech model when specified', () => {
      const input: TwimlGeneratorInput = {
        ...defaultInput,
        voiceOptions: {
          ...defaultInput.voiceOptions,
          speechModel: 'telephony',
        },
      };
      const result = generateTwimlHandler(input);
      const handler = result.find((f) => f.type === 'twiml-handler');

      expect(handler?.content).toContain('telephony');
    });
  });
});
