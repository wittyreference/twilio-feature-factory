// ABOUTME: Unit tests for ComprehensiveValidator orchestration.
// ABOUTME: Tests that validators are run based on products used and results feed to self-healing loop.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ComprehensiveValidator,
  createComprehensiveValidator,
} from '../src/validation/comprehensive-validator';

// Mock Twilio client for testing
const createMockTwilioClient = () => {
  return {
    calls: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue({
        sid: 'CA_test_call',
        status: 'completed',
        duration: 60,
      }),
    }),
    messages: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue({
        sid: 'SM_test_message',
        status: 'delivered',
      }),
    }),
    recordings: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue({
        sid: 'RE_test_recording',
        status: 'completed',
        duration: '30',
        channels: 2,
        source: 'DialVerb',
        uri: '/2010-04-01/Accounts/AC123/Recordings/RE123.json',
      }),
    }),
    monitor: {
      v1: {
        alerts: {
          list: jest.fn().mockResolvedValue([]),
        },
      },
    },
    insights: {
      v1: {
        calls: jest.fn().mockReturnValue({
          summary: jest.fn().mockReturnValue({
            fetch: jest.fn().mockResolvedValue({
              callSid: 'CA_test_call',
              processingState: 'complete',
              duration: 60,
            }),
          }),
          events: {
            list: jest.fn().mockResolvedValue([]),
          },
        }),
      },
    },
    intelligence: {
      v2: {
        transcripts: Object.assign(
          jest.fn().mockReturnValue({
            fetch: jest.fn().mockResolvedValue({
              sid: 'GT_test_transcript',
              serviceSid: 'GA_test_service',
              status: 'completed',
            }),
            sentences: {
              list: jest.fn().mockResolvedValue([
                { transcript: 'Hello, how can I help?', mediaChannel: 1 },
                { transcript: 'I need assistance.', mediaChannel: 2 },
                { transcript: 'Sure, let me help you.', mediaChannel: 1 },
                { transcript: 'Thank you very much.', mediaChannel: 2 },
              ]),
            },
          }),
          {
            list: jest.fn().mockResolvedValue([
              {
                sid: 'GT_test_transcript',
                serviceSid: 'GA_test_service',
                status: 'completed',
              },
            ]),
          }
        ),
      },
    },
    verify: {
      v2: {
        services: jest.fn().mockReturnValue({
          verifications: jest.fn().mockReturnValue({
            fetch: jest.fn().mockResolvedValue({
              sid: 'VE_test_verification',
              status: 'approved',
              channel: 'sms',
            }),
          }),
        }),
      },
    },
    taskrouter: {
      v1: {
        workspaces: jest.fn().mockReturnValue({
          tasks: jest.fn().mockReturnValue({
            fetch: jest.fn().mockResolvedValue({
              sid: 'WT_test_task',
              assignmentStatus: 'completed',
              age: 100,
              priority: 1,
            }),
          }),
        }),
      },
    },
    serverless: {
      v1: {
        services: jest.fn().mockReturnValue({
          environments: jest.fn().mockReturnValue({
            logs: {
              list: jest.fn().mockResolvedValue([]),
            },
          }),
        }),
      },
    },
    sync: {
      v1: {
        services: jest.fn().mockReturnValue({
          documents: jest.fn().mockReturnValue({
            fetch: jest.fn().mockRejectedValue({ code: 20404 }),
          }),
        }),
      },
    },
  } as unknown as import('twilio').Twilio;
};

describe('ComprehensiveValidator', () => {
  let tempDir: string;
  let mockClient: ReturnType<typeof createMockTwilioClient>;
  let validator: ComprehensiveValidator;

  beforeEach(() => {
    // Create temp directory for learnings and patterns
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comprehensive-validator-test-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });

    mockClient = createMockTwilioClient();
    validator = new ComprehensiveValidator(mockClient, {
      projectRoot: tempDir,
      sessionId: 'test-session-123',
      captureLearnings: true,
      trackPatterns: true,
    });
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create with default configuration', () => {
      expect(validator).toBeInstanceOf(ComprehensiveValidator);
      expect(validator.getDeepValidator()).toBeDefined();
      expect(validator.getDiagnosticBridge()).toBeDefined();
      expect(validator.getLearningCapture()).toBeDefined();
      expect(validator.getPatternTracker()).toBeDefined();
    });
  });

  describe('createComprehensiveValidator()', () => {
    it('should create a ComprehensiveValidator instance', () => {
      const instance = createComprehensiveValidator(mockClient, {
        projectRoot: tempDir,
      });

      expect(instance).toBeInstanceOf(ComprehensiveValidator);
    });
  });

  describe('validateVoiceAIFlow', () => {
    it('should run relevant validators for Voice AI flow', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
      });

      expect(result).toBeDefined();
      expect(result.results).toBeInstanceOf(Map);
      expect(result.summary).toBeDefined();
      expect(result.summary.totalValidators).toBeGreaterThan(0);
    });

    it('should include call validator in results', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
      });

      expect(result.results.has('call')).toBe(true);
      expect(result.results.has('debugger')).toBe(true);
    });

    it('should include recording validator when recordingSid provided', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
        recordingSid: 'RE_test_recording',
      });

      expect(result.results.has('recording')).toBe(true);
    });

    it('should include transcript validator when transcriptSid provided', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
        transcriptSid: 'GT_test_transcript',
      });

      expect(result.results.has('transcript')).toBe(true);
    });

    it('should return summary with pass/fail counts', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
      });

      expect(result.summary.passed).toBeDefined();
      expect(result.summary.failed).toBeDefined();
      expect(result.summary.passed + result.summary.failed).toBe(result.summary.totalValidators);
    });
  });

  describe('validateVerifyFlow', () => {
    it('should run verification and debugger validators', async () => {
      const result = await validator.validateVerifyFlow(
        'VA_test_service',
        'VE_test_verification'
      );

      expect(result.results.has('verification')).toBe(true);
      expect(result.results.has('debugger')).toBe(true);
    });
  });

  describe('validateTaskRouterFlow', () => {
    it('should run task and debugger validators', async () => {
      const result = await validator.validateTaskRouterFlow(
        'WS_test_workspace',
        'WT_test_task'
      );

      expect(result.results.has('task')).toBe(true);
      expect(result.results.has('debugger')).toBe(true);
    });
  });

  describe('validateMessagingFlow', () => {
    it('should run message and debugger validators', async () => {
      const result = await validator.validateMessagingFlow('SM_test_message');

      expect(result.results.has('message')).toBe(true);
      expect(result.results.has('debugger')).toBe(true);
    });
  });

  describe('self-healing loop integration', () => {
    it('should capture learnings on validation failure', async () => {
      // Create a mock client that returns a failed call
      const failingClient = {
        ...mockClient,
        calls: jest.fn().mockReturnValue({
          fetch: jest.fn().mockResolvedValue({
            sid: 'CA_failed_call',
            status: 'failed',
          }),
        }),
        insights: {
          v1: {
            calls: jest.fn().mockReturnValue({
              events: {
                list: jest.fn().mockResolvedValue([]),
              },
            }),
          },
        },
      } as unknown as import('twilio').Twilio;

      const failingValidator = new ComprehensiveValidator(failingClient, {
        projectRoot: tempDir,
        sessionId: 'test-session-failure',
        captureLearnings: true,
        trackPatterns: true,
      });

      const result = await failingValidator.validateVoiceAIFlow({
        callSid: 'CA_failed_call',
      });

      expect(result.allPassed).toBe(false);
      // Learnings should be captured for failures
      if (result.diagnoses.length > 0) {
        expect(result.learnings.length).toBeGreaterThan(0);
        expect(result.patterns.length).toBeGreaterThan(0);
      }
    });

    it('should not capture learnings when disabled', async () => {
      const noLearningsValidator = new ComprehensiveValidator(mockClient, {
        projectRoot: tempDir,
        sessionId: 'test-session-no-learnings',
        captureLearnings: false,
        trackPatterns: false,
      });

      const result = await noLearningsValidator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
      });

      // Even if there are failures, learnings should not be captured
      expect(result.learnings).toHaveLength(0);
      expect(result.patterns).toHaveLength(0);
    });
  });

  describe('result structure', () => {
    it('should return all diagnoses for failures', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
      });

      expect(Array.isArray(result.diagnoses)).toBe(true);
    });

    it('should return all learnings captured', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
      });

      expect(Array.isArray(result.learnings)).toBe(true);
    });

    it('should return all patterns recorded', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
      });

      expect(Array.isArray(result.patterns)).toBe(true);
    });

    it('should include duration in summary', async () => {
      const result = await validator.validateVoiceAIFlow({
        callSid: 'CA_test_call',
      });

      expect(result.summary.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('processFailure logging', () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should use console.log for operational failure logging, not console.error', async () => {
      // Create a failing client that triggers processFailure via validateVoiceAIFlow
      const failingClient = {
        ...mockClient,
        calls: jest.fn().mockReturnValue({
          fetch: jest.fn().mockResolvedValue({
            sid: 'CA_log_test_call',
            status: 'failed',
          }),
        }),
        insights: {
          v1: {
            calls: jest.fn().mockReturnValue({
              events: {
                list: jest.fn().mockResolvedValue([]),
              },
            }),
          },
        },
      } as unknown as import('twilio').Twilio;

      const loggingValidator = new ComprehensiveValidator(failingClient, {
        projectRoot: tempDir,
        sessionId: 'test-logging-session',
        captureLearnings: true,
        trackPatterns: true,
      });

      await loggingValidator.validateVoiceAIFlow({
        callSid: 'CA_log_test_call',
      });

      // Check that console.log was called with [ComprehensiveValidator] messages
      const logCalls = logSpy.mock.calls
        .map((args: unknown[]) => args.join(' '))
        .filter((msg: string) => msg.includes('[ComprehensiveValidator]'));

      // Check that console.error was NOT called with [ComprehensiveValidator] messages
      const errorCalls = errorSpy.mock.calls
        .map((args: unknown[]) => args.join(' '))
        .filter((msg: string) => msg.includes('[ComprehensiveValidator]'));

      // Operational logging should use console.log
      expect(logCalls.length).toBeGreaterThan(0);
      expect(logCalls.some((msg: string) => msg.includes('FAILED'))).toBe(true);

      // console.error should NOT have any [ComprehensiveValidator] messages
      // (it's only used in catch blocks for actual errors, not operational logging)
      expect(errorCalls.length).toBe(0);
    });
  });
});
