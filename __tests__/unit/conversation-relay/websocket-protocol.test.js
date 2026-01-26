// ABOUTME: Tests for ConversationRelay WebSocket message protocol schemas.
// ABOUTME: Validates message types and structures for Twilio's ConversationRelay.

/**
 * ConversationRelay WebSocket Protocol
 *
 * This test file validates the WebSocket message protocol used by Twilio's ConversationRelay.
 * The protocol defines bidirectional communication between Twilio and your WebSocket server.
 *
 * Message Types:
 * - Incoming (from Twilio): setup, prompt, dtmf, interrupt
 * - Outgoing (to Twilio): text, end
 *
 * These tests validate message schemas without requiring a running WebSocket server.
 * For actual E2E tests with real calls, see the integration tests.
 */

describe('ConversationRelay WebSocket Protocol', () => {
  // Schema definitions for ConversationRelay messages
  const schemas = {
    // Incoming messages (from Twilio to WebSocket server)
    incoming: {
      setup: {
        type: 'object',
        required: ['type', 'callSid', 'streamSid'],
        properties: {
          type: { const: 'setup' },
          callSid: { type: 'string', pattern: '^CA' },
          streamSid: { type: 'string', pattern: '^MZ' },
          from: { type: 'string' },
          to: { type: 'string' }
        }
      },
      prompt: {
        type: 'object',
        required: ['type', 'voicePrompt'],
        properties: {
          type: { const: 'prompt' },
          voicePrompt: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          isFinal: { type: 'boolean' }
        }
      },
      dtmf: {
        type: 'object',
        required: ['type', 'digit'],
        properties: {
          type: { const: 'dtmf' },
          digit: { type: 'string', pattern: '^[0-9*#]$' }
        }
      },
      interrupt: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { const: 'interrupt' }
        }
      }
    },
    // Outgoing messages (from WebSocket server to Twilio)
    outgoing: {
      text: {
        type: 'object',
        required: ['type', 'token'],
        properties: {
          type: { const: 'text' },
          token: { type: 'string' }
        }
      },
      end: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { const: 'end' }
        }
      }
    }
  };

  // Simple schema validator (no external dependencies)
  function validateMessage(message, schema) {
    const errors = [];

    // Check type
    if (schema.type === 'object' && typeof message !== 'object') {
      errors.push('Message must be an object');
      return { valid: false, errors };
    }

    // Check required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in message)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Check properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in message) {
          const value = message[key];

          // Check const
          if (propSchema.const !== undefined && value !== propSchema.const) {
            errors.push(`Field ${key} must be "${propSchema.const}", got "${value}"`);
          }

          // Check type
          if (propSchema.type === 'string' && typeof value !== 'string') {
            errors.push(`Field ${key} must be a string`);
          }
          if (propSchema.type === 'number' && typeof value !== 'number') {
            errors.push(`Field ${key} must be a number`);
          }
          if (propSchema.type === 'boolean' && typeof value !== 'boolean') {
            errors.push(`Field ${key} must be a boolean`);
          }

          // Check pattern
          if (propSchema.pattern && typeof value === 'string') {
            const regex = new RegExp(propSchema.pattern);
            if (!regex.test(value)) {
              errors.push(`Field ${key} does not match pattern ${propSchema.pattern}`);
            }
          }

          // Check minimum/maximum
          if (propSchema.minimum !== undefined && value < propSchema.minimum) {
            errors.push(`Field ${key} must be >= ${propSchema.minimum}`);
          }
          if (propSchema.maximum !== undefined && value > propSchema.maximum) {
            errors.push(`Field ${key} must be <= ${propSchema.maximum}`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  describe('Incoming Messages (Twilio → WebSocket)', () => {
    describe('setup message', () => {
      it('should validate valid setup message', () => {
        const message = {
          type: 'setup',
          callSid: 'CA1234567890abcdef1234567890abcdef',
          streamSid: 'MZ1234567890abcdef1234567890abcdef',
          from: '+15551234567',
          to: '+15559876543'
        };

        const result = validateMessage(message, schemas.incoming.setup);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should require type field', () => {
        const message = {
          callSid: 'CA1234567890abcdef',
          streamSid: 'MZ1234567890abcdef'
        };

        const result = validateMessage(message, schemas.incoming.setup);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: type');
      });

      it('should require callSid field', () => {
        const message = {
          type: 'setup',
          streamSid: 'MZ1234567890abcdef'
        };

        const result = validateMessage(message, schemas.incoming.setup);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: callSid');
      });

      it('should validate callSid starts with CA', () => {
        const message = {
          type: 'setup',
          callSid: 'XX1234567890abcdef',
          streamSid: 'MZ1234567890abcdef'
        };

        const result = validateMessage(message, schemas.incoming.setup);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('pattern'))).toBe(true);
      });

      it('should validate streamSid starts with MZ', () => {
        const message = {
          type: 'setup',
          callSid: 'CA1234567890abcdef',
          streamSid: 'XX1234567890abcdef'
        };

        const result = validateMessage(message, schemas.incoming.setup);
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('pattern'))).toBe(true);
      });
    });

    describe('prompt message', () => {
      it('should validate valid prompt message', () => {
        const message = {
          type: 'prompt',
          voicePrompt: 'Hello, I need help with my account',
          confidence: 0.95,
          isFinal: true
        };

        const result = validateMessage(message, schemas.incoming.prompt);
        expect(result.valid).toBe(true);
      });

      it('should require voicePrompt field', () => {
        const message = {
          type: 'prompt'
        };

        const result = validateMessage(message, schemas.incoming.prompt);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: voicePrompt');
      });

      it('should validate confidence is between 0 and 1', () => {
        // Test value over maximum
        const overMaxMessage = {
          type: 'prompt',
          voicePrompt: 'test',
          confidence: 1.5 // Invalid - over 1
        };

        const overMaxResult = validateMessage(overMaxMessage, schemas.incoming.prompt);
        expect(overMaxResult.valid).toBe(false);
        expect(overMaxResult.errors.length).toBeGreaterThan(0);
        expect(overMaxResult.errors.some(e => e.includes('confidence'))).toBe(true);

        // Test value under minimum
        const underMinMessage = {
          type: 'prompt',
          voicePrompt: 'test',
          confidence: -0.1 // Invalid - under 0
        };

        const underMinResult = validateMessage(underMinMessage, schemas.incoming.prompt);
        expect(underMinResult.valid).toBe(false);
        expect(underMinResult.errors.some(e => e.includes('confidence'))).toBe(true);

        // Test valid values at boundaries
        const validMinMessage = {
          type: 'prompt',
          voicePrompt: 'test',
          confidence: 0
        };
        expect(validateMessage(validMinMessage, schemas.incoming.prompt).valid).toBe(true);

        const validMaxMessage = {
          type: 'prompt',
          voicePrompt: 'test',
          confidence: 1
        };
        expect(validateMessage(validMaxMessage, schemas.incoming.prompt).valid).toBe(true);
      });

      it('should allow partial transcripts', () => {
        const message = {
          type: 'prompt',
          voicePrompt: 'Hello, I need',
          confidence: 0.8,
          isFinal: false
        };

        const result = validateMessage(message, schemas.incoming.prompt);
        expect(result.valid).toBe(true);
      });
    });

    describe('dtmf message', () => {
      it('should validate valid DTMF digit', () => {
        const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'];

        for (const digit of digits) {
          const message = { type: 'dtmf', digit };
          const result = validateMessage(message, schemas.incoming.dtmf);
          expect(result.valid).toBe(true);
        }
      });

      it('should reject invalid DTMF characters', () => {
        const invalidDigits = ['A', 'B', 'C', 'D', '10', ''];

        for (const digit of invalidDigits) {
          const message = { type: 'dtmf', digit };
          const result = validateMessage(message, schemas.incoming.dtmf);
          expect(result.valid).toBe(false);
        }
      });
    });

    describe('interrupt message', () => {
      it('should validate valid interrupt message', () => {
        const message = { type: 'interrupt' };
        const result = validateMessage(message, schemas.incoming.interrupt);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Outgoing Messages (WebSocket → Twilio)', () => {
    describe('text message', () => {
      it('should validate valid text message', () => {
        const message = {
          type: 'text',
          token: 'Hello! I\'d be happy to help you with your account.'
        };

        const result = validateMessage(message, schemas.outgoing.text);
        expect(result.valid).toBe(true);
      });

      it('should require token field', () => {
        const message = { type: 'text' };
        const result = validateMessage(message, schemas.outgoing.text);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Missing required field: token');
      });

      it('should allow streaming tokens (partial words)', () => {
        // ConversationRelay supports streaming - send tokens word by word
        const tokens = ['Hello', '!', ' I\'d', ' be', ' happy', ' to', ' help'];

        for (const token of tokens) {
          const message = { type: 'text', token };
          const result = validateMessage(message, schemas.outgoing.text);
          expect(result.valid).toBe(true);
        }
      });
    });

    describe('end message', () => {
      it('should validate valid end message', () => {
        const message = { type: 'end' };
        const result = validateMessage(message, schemas.outgoing.end);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('Message Flow Patterns', () => {
    it('should validate typical conversation flow', () => {
      // Simulated message sequence in a typical conversation
      const messageFlow = [
        // 1. Setup message when call connects
        {
          direction: 'incoming',
          message: {
            type: 'setup',
            callSid: 'CA1234567890abcdef1234567890abcdef',
            streamSid: 'MZ1234567890abcdef1234567890abcdef',
            from: '+15551234567',
            to: '+15559876543'
          }
        },
        // 2. User speaks (transcription)
        {
          direction: 'incoming',
          message: {
            type: 'prompt',
            voicePrompt: 'Hello, I need help with my account',
            confidence: 0.95,
            isFinal: true
          }
        },
        // 3. AI responds
        {
          direction: 'outgoing',
          message: {
            type: 'text',
            token: 'Hello! I\'d be happy to help you with your account. What seems to be the issue?'
          }
        },
        // 4. User speaks again
        {
          direction: 'incoming',
          message: {
            type: 'prompt',
            voicePrompt: 'I want to cancel my subscription',
            confidence: 0.92,
            isFinal: true
          }
        },
        // 5. User presses DTMF to confirm
        {
          direction: 'incoming',
          message: {
            type: 'dtmf',
            digit: '1'
          }
        },
        // 6. AI confirms and ends
        {
          direction: 'outgoing',
          message: {
            type: 'text',
            token: 'I\'ve processed your cancellation. Goodbye!'
          }
        },
        {
          direction: 'outgoing',
          message: { type: 'end' }
        }
      ];

      // Validate each message in the flow
      for (const step of messageFlow) {
        const schemaGroup = step.direction === 'incoming' ? schemas.incoming : schemas.outgoing;
        const schema = schemaGroup[step.message.type];
        const result = validateMessage(step.message, schema);

        expect(result.valid).toBe(true);
        if (!result.valid) {
          console.error(`Validation failed for ${step.direction} ${step.message.type}:`, result.errors);
        }
      }
    });

    it('should validate interruption flow', () => {
      // When user interrupts the AI's response
      const interruptionFlow = [
        // AI is speaking...
        {
          direction: 'outgoing',
          message: {
            type: 'text',
            token: 'Let me explain the features of our premium plan. First, you get...'
          }
        },
        // User interrupts
        {
          direction: 'incoming',
          message: { type: 'interrupt' }
        },
        // User's new input
        {
          direction: 'incoming',
          message: {
            type: 'prompt',
            voicePrompt: 'Actually, I just want to cancel',
            confidence: 0.88,
            isFinal: true
          }
        }
      ];

      for (const step of interruptionFlow) {
        const schemaGroup = step.direction === 'incoming' ? schemas.incoming : schemas.outgoing;
        const schema = schemaGroup[step.message.type];
        const result = validateMessage(step.message, schema);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('WebSocket Handler Patterns', () => {
    it('should demonstrate message type routing', () => {
      // Example of how a WebSocket handler would route messages
      function handleMessage(message) {
        switch (message.type) {
          case 'setup':
            return {
              action: 'initialize',
              callSid: message.callSid,
              from: message.from,
              to: message.to
            };

          case 'prompt':
            if (message.isFinal) {
              return {
                action: 'processWithLLM',
                text: message.voicePrompt
              };
            }
            return { action: 'partialTranscript' };

          case 'dtmf':
            return {
              action: 'handleKeypress',
              digit: message.digit
            };

          case 'interrupt':
            return { action: 'stopCurrentResponse' };

          default:
            return { action: 'unknown', type: message.type };
        }
      }

      // Test each message type routes correctly
      const setupResult = handleMessage({
        type: 'setup',
        callSid: 'CA123',
        streamSid: 'MZ123',
        from: '+1555',
        to: '+1999'
      });
      expect(setupResult.action).toBe('initialize');

      const promptResult = handleMessage({
        type: 'prompt',
        voicePrompt: 'test',
        isFinal: true
      });
      expect(promptResult.action).toBe('processWithLLM');

      const dtmfResult = handleMessage({ type: 'dtmf', digit: '1' });
      expect(dtmfResult.action).toBe('handleKeypress');

      const interruptResult = handleMessage({ type: 'interrupt' });
      expect(interruptResult.action).toBe('stopCurrentResponse');
    });

    it('should demonstrate response formatting', () => {
      // Example of formatting responses for ConversationRelay
      function formatTextResponse(text) {
        return JSON.stringify({ type: 'text', token: text });
      }

      function formatEndSession() {
        return JSON.stringify({ type: 'end' });
      }

      // Verify JSON serialization is valid
      const textResponse = formatTextResponse('Hello, how can I help?');
      const parsed = JSON.parse(textResponse);
      expect(parsed.type).toBe('text');
      expect(parsed.token).toBe('Hello, how can I help?');

      const endResponse = formatEndSession();
      const endParsed = JSON.parse(endResponse);
      expect(endParsed.type).toBe('end');
    });
  });
});
