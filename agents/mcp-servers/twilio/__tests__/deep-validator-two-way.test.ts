// ABOUTME: Tests for DeepValidator validateTwoWay() method.
// ABOUTME: Validates two-way conversation validation between call legs.

import { DeepValidator, type TwoWayValidationOptions } from '../src/validation/deep-validator';

// Mock Twilio client
const createMockClient = () => {
  // Use mediaChannel to represent different speakers (1 = agent, 2 = customer)
  // Include 'confirm' and 'confirmed' in the sentences for testing
  const mockSentencesA = [
    { transcript: 'Hello, how can I help you today?', mediaChannel: 1 },
    { transcript: 'I need to schedule an appointment.', mediaChannel: 2 },
    { transcript: 'Sure, let me confirm the available times.', mediaChannel: 1 },
    { transcript: 'Thank you, that would be great. The appointment is confirmed.', mediaChannel: 2 },
  ];

  const mockSentencesB = [
    { transcript: 'Welcome to our service.', mediaChannel: 1 },
    { transcript: 'I want to confirm my booking.', mediaChannel: 2 },
    { transcript: 'Your appointment is confirmed.', mediaChannel: 1 },
  ];

  const mockTranscripts = [
    {
      sid: 'GT_transcript_a',
      serviceSid: 'GA_service_123',
      status: 'completed',
    },
    {
      sid: 'GT_transcript_b',
      serviceSid: 'GA_service_123',
      status: 'completed',
    },
  ];

  // Create a callable function that also has a list method
  const transcriptsAccessor = (sid: string) => ({
    fetch: jest.fn().mockResolvedValue(
      mockTranscripts.find((t) => t.sid === sid) || mockTranscripts[0]
    ),
    sentences: {
      list: jest.fn().mockResolvedValue(
        sid === 'GT_transcript_a' ? mockSentencesA : mockSentencesB
      ),
    },
  });
  transcriptsAccessor.list = jest.fn().mockResolvedValue(mockTranscripts);

  return {
    intelligence: {
      v2: {
        transcripts: transcriptsAccessor,
      },
    },
  } as unknown as import('twilio').Twilio;
};

describe('DeepValidator.validateTwoWay', () => {
  let validator: DeepValidator;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
    validator = new DeepValidator(mockClient);
  });

  describe('successful validation', () => {
    it('should validate a two-way conversation successfully', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
      };

      const result = await validator.validateTwoWay(options);

      expect(result.success).toBe(true);
      expect(result.callA.callSid).toBe('CA_call_a');
      expect(result.callB.callSid).toBe('CA_call_b');
      expect(result.errors).toHaveLength(0);
    });

    it('should detect topic keywords in conversation', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        topicKeywords: ['appointment', 'schedule', 'confirm'],
      };

      const result = await validator.validateTwoWay(options);

      expect(result.success).toBe(true);
      expect(result.conversation.topicKeywordsFound).toContain('appointment');
      expect(result.conversation.topicKeywordsFound).toContain('confirm');
      // 'schedule' appears as 'schedule' in sentences
      expect(result.conversation.topicKeywordsFound).toContain('schedule');
      expect(result.conversation.topicKeywordsMissing).toHaveLength(0);
    });

    it('should detect success phrases in conversation', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        successPhrases: ['thank you', 'confirmed'],
      };

      const result = await validator.validateTwoWay(options);

      expect(result.success).toBe(true);
      expect(result.conversation.successPhrasesFound).toContain('thank you');
      expect(result.conversation.successPhrasesFound).toContain('confirmed');
    });

    it('should count speaker turns correctly', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
      };

      const result = await validator.validateTwoWay(options);

      // Both calls get the first transcript (mockSentencesA) due to simplified matching
      // 4 sentences alternating between channels 1 and 2 = 4 turns each
      expect(result.callA.speakerTurns).toBe(4);
      expect(result.callB.speakerTurns).toBe(4);
      expect(result.conversation.totalTurns).toBe(8);
    });

    it('should track sentence counts', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
      };

      const result = await validator.validateTwoWay(options);

      // Both calls get the first transcript's sentences due to simplified matching
      expect(result.callA.sentenceCount).toBe(4);
      expect(result.callB.sentenceCount).toBe(4);
    });
  });

  describe('validation failures', () => {
    it('should fail when minimum turns not met', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        expectedTurns: 20, // More than we have
      };

      const result = await validator.validateTwoWay(options);

      expect(result.success).toBe(false);
      // Both calls get 4 turns each (from first transcript) = 8 total
      expect(result.errors).toContain('Expected at least 20 turns, got 8');
    });

    it('should fail when success phrases not found', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        successPhrases: ['goodbye forever', 'purchase completed'],
      };

      const result = await validator.validateTwoWay(options);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No success phrases found in conversation');
    });

    it('should warn when topic keywords missing', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        topicKeywords: ['appointment', 'unicorn', 'rainbow'],
      };

      const result = await validator.validateTwoWay(options);

      // Missing keywords should be warnings, not errors
      expect(result.conversation.topicKeywordsMissing).toContain('unicorn');
      expect(result.conversation.topicKeywordsMissing).toContain('rainbow');
      expect(result.warnings.some((w) => w.includes('unicorn'))).toBe(true);
    });
  });

  describe('transcript handling', () => {
    it('should handle missing transcripts', async () => {
      // Mock client that returns no transcripts
      const emptyMockClient = {
        intelligence: {
          v2: {
            transcripts: Object.assign(
              {
                list: jest.fn().mockResolvedValue([]),
              },
              () => ({
                fetch: jest.fn().mockRejectedValue(new Error('Not found')),
                sentences: {
                  list: jest.fn().mockResolvedValue([]),
                },
              })
            ),
          },
        },
      } as unknown as import('twilio').Twilio;

      const emptyValidator = new DeepValidator(emptyMockClient);

      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
      };

      const result = await emptyValidator.validateTwoWay(options);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('No transcript found'))).toBe(true);
    });

    it('should handle incomplete transcripts', async () => {
      // Mock client with pending transcript
      const pendingMockClient = {
        intelligence: {
          v2: {
            transcripts: Object.assign(
              {
                list: jest.fn().mockResolvedValue([
                  { sid: 'GT_pending', serviceSid: 'GA_service_123', status: 'in-progress' },
                ]),
              },
              (_sid: string) => ({
                fetch: jest.fn().mockResolvedValue(
                  { sid: 'GT_pending', serviceSid: 'GA_service_123', status: 'in-progress' }
                ),
                sentences: {
                  list: jest.fn().mockResolvedValue([]),
                },
              })
            ),
          },
        },
      } as unknown as import('twilio').Twilio;

      const pendingValidator = new DeepValidator(pendingMockClient);

      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        waitForTranscripts: false, // Don't wait
      };

      const result = await pendingValidator.validateTwoWay(options);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('not completed'))).toBe(true);
    });
  });

  describe('natural flow detection', () => {
    it('should detect natural conversation flow', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        expectedTurns: 2,
      };

      const result = await validator.validateTwoWay(options);

      expect(result.conversation.hasNaturalFlow).toBe(true);
    });

    it('should detect unnatural flow when one side is silent', async () => {
      // Mock client where call B has no sentences
      const silentMockClient = {
        intelligence: {
          v2: {
            transcripts: Object.assign(
              {
                list: jest.fn().mockResolvedValue([
                  { sid: 'GT_a', serviceSid: 'GA_service_123', status: 'completed' },
                  { sid: 'GT_b', serviceSid: 'GA_service_123', status: 'completed' },
                ]),
              },
              (transcriptSid: string) => ({
                fetch: jest.fn().mockResolvedValue(
                  { sid: transcriptSid, serviceSid: 'GA_service_123', status: 'completed' }
                ),
                sentences: {
                  list: jest.fn().mockResolvedValue(
                    transcriptSid === 'GT_a'
                      ? [{ transcript: 'Hello', mediaChannel: 1 }]
                      : [] // No sentences for call B
                  ),
                },
              })
            ),
          },
        },
      } as unknown as import('twilio').Twilio;

      const silentValidator = new DeepValidator(silentMockClient);

      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
      };

      const result = await silentValidator.validateTwoWay(options);

      expect(result.conversation.hasNaturalFlow).toBe(false);
    });
  });

  describe('result structure', () => {
    it('should include validation duration', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
      };

      const result = await validator.validateTwoWay(options);

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
    });

    it('should include transcript SIDs when available', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
      };

      const result = await validator.validateTwoWay(options);

      expect(result.callA.transcriptSid).toBeDefined();
      expect(result.callB.transcriptSid).toBeDefined();
    });

    it('should include transcript status', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
      };

      const result = await validator.validateTwoWay(options);

      expect(result.callA.transcriptStatus).toBe('completed');
      expect(result.callB.transcriptStatus).toBe('completed');
    });
  });

  describe('keyword matching', () => {
    it('should be case-insensitive for keywords', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        topicKeywords: ['APPOINTMENT', 'SCHEDULE'],
      };

      const result = await validator.validateTwoWay(options);

      expect(result.conversation.topicKeywordsFound).toContain('APPOINTMENT');
      expect(result.conversation.topicKeywordsFound).toContain('SCHEDULE');
    });

    it('should be case-insensitive for success phrases', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        successPhrases: ['THANK YOU', 'CONFIRMED'],
      };

      const result = await validator.validateTwoWay(options);

      expect(result.conversation.successPhrasesFound).toContain('THANK YOU');
      expect(result.conversation.successPhrasesFound).toContain('CONFIRMED');
    });
  });

  describe('forbidden patterns', () => {
    it('should detect forbidden patterns in conversation', async () => {
      // Mock client with error message in transcript
      // Create a callable function that also has a list method
      const errorTranscriptsAccessor = (_sid: string) => ({
        fetch: jest.fn().mockResolvedValue(
          { sid: 'GT_error', serviceSid: 'GA_service_123', status: 'completed' }
        ),
        sentences: {
          list: jest.fn().mockResolvedValue([
            { transcript: "We're sorry, an application error has occurred.", mediaChannel: 1 },
            { transcript: 'Please try again later.', mediaChannel: 1 },
          ]),
        },
      });
      errorTranscriptsAccessor.list = jest.fn().mockResolvedValue([
        { sid: 'GT_error', serviceSid: 'GA_service_123', status: 'completed' },
      ]);

      const errorMockClient = {
        intelligence: {
          v2: {
            transcripts: errorTranscriptsAccessor,
          },
        },
      } as unknown as import('twilio').Twilio;

      const errorValidator = new DeepValidator(errorMockClient);

      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        forbiddenPatterns: ['application error', "we're sorry"],
      };

      const result = await errorValidator.validateTwoWay(options);

      expect(result.success).toBe(false);
      expect(result.conversation.forbiddenPatternsFound).toContain('application error');
      expect(result.conversation.forbiddenPatternsFound).toContain("we're sorry");
      expect(result.errors.some((e) => e.includes('Forbidden patterns found'))).toBe(true);
    });

    it('should pass when no forbidden patterns found', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        forbiddenPatterns: ['application error', "we're sorry"],
      };

      const result = await validator.validateTwoWay(options);

      expect(result.conversation.forbiddenPatternsFound).toHaveLength(0);
    });
  });

  describe('minimum sentences per side', () => {
    it('should fail when sentences per side is below minimum', async () => {
      // Mock client with minimal conversation (only 1 sentence per side)
      // Create a callable function that also has a list method
      const minimalTranscriptsAccessor = (_sid: string) => ({
        fetch: jest.fn().mockResolvedValue(
          { sid: 'GT_minimal', serviceSid: 'GA_service_123', status: 'completed' }
        ),
        sentences: {
          list: jest.fn().mockResolvedValue([
            { transcript: 'Hello', mediaChannel: 1 },
          ]),
        },
      });
      minimalTranscriptsAccessor.list = jest.fn().mockResolvedValue([
        { sid: 'GT_minimal', serviceSid: 'GA_service_123', status: 'completed' },
      ]);

      const minimalMockClient = {
        intelligence: {
          v2: {
            transcripts: minimalTranscriptsAccessor,
          },
        },
      } as unknown as import('twilio').Twilio;

      const minimalValidator = new DeepValidator(minimalMockClient);

      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        minSentencesPerSide: 3,
      };

      const result = await minimalValidator.validateTwoWay(options);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('only 1 sentences'))).toBe(true);
      expect(result.errors.some((e) => e.includes('expected at least 3'))).toBe(true);
    });

    it('should pass when sentences per side meets minimum', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        minSentencesPerSide: 2, // Our mock has 4 sentences per side
      };

      const result = await validator.validateTwoWay(options);

      expect(result.callA.sentenceCount).toBeGreaterThanOrEqual(2);
      expect(result.callB.sentenceCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('minimum duration', () => {
    it('should add warning when minDuration is specified', async () => {
      const options: TwoWayValidationOptions = {
        callSidA: 'CA_call_a',
        callSidB: 'CA_call_b',
        intelligenceServiceSid: 'GA_service_123',
        minDuration: 30,
      };

      const result = await validator.validateTwoWay(options);

      // minDuration check adds a warning since duration isn't available in transcript validation
      expect(result.warnings.some((w) => w.includes('minDuration'))).toBe(true);
    });
  });
});
