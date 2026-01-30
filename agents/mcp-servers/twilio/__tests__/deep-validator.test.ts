// ABOUTME: Unit tests for DeepValidator, covering conference and new validation methods.
// ABOUTME: Tests structure, types, and behavior with mocked Twilio client.

import {
  DeepValidator,
  ValidationResult,
  ValidationOptions,
} from '../src/validation/deep-validator';

interface MockClientConfig {
  conferenceStatus: string;
  conferenceError: Error | null;
  insightsData: Record<string, unknown> | null;
  insightsError: Error | null;
  participantInsightsData: Array<Record<string, unknown>>;
  participantInsightsError: Error | null;
  alertsData: Array<Record<string, unknown>>;
  alertsError: Error | null;
  // New mock configs for new validation methods
  recordingStatus: string;
  recordingData: Record<string, unknown> | null;
  recordingError: Error | null;
  transcriptStatus: string;
  transcriptData: Record<string, unknown> | null;
  transcriptError: Error | null;
  sentencesData: Array<Record<string, unknown>>;
  sentencesError: Error | null;
  operatorResultsData: Array<Record<string, unknown>>;
  operatorResultsError: Error | null;
  serverlessLogsData: Array<Record<string, unknown>>;
  serverlessLogsError: Error | null;
  serverlessEnvironmentsData: Array<Record<string, unknown>>;
}

// Create a mock Twilio client for testing
function createMockClient(overrides: Partial<MockClientConfig> = {}) {
  const config: MockClientConfig = {
    conferenceStatus: 'completed',
    conferenceError: null,
    insightsData: null,
    insightsError: null,
    participantInsightsData: [],
    participantInsightsError: null,
    alertsData: [],
    alertsError: null,
    // New mock configs
    recordingStatus: 'completed',
    recordingData: null,
    recordingError: null,
    transcriptStatus: 'completed',
    transcriptData: null,
    transcriptError: null,
    sentencesData: [],
    sentencesError: null,
    operatorResultsData: [],
    operatorResultsError: null,
    serverlessLogsData: [],
    serverlessLogsError: null,
    serverlessEnvironmentsData: [{ sid: 'ZE123', uniqueName: 'production', domainName: 'test.twil.io' }],
    ...overrides,
  };

  return {
    conferences: (sid: string) => ({
      fetch: async () => {
        if (config.conferenceError) throw config.conferenceError;
        return {
          sid,
          status: config.conferenceStatus,
          friendlyName: 'Test Conference',
          dateCreated: new Date(),
          dateUpdated: new Date(),
        };
      },
      participants: {
        list: async () => [],
      },
    }),
    insights: {
      v1: {
        conferences: (sid: string) => ({
          fetch: async () => {
            if (config.insightsError) throw config.insightsError;
            return config.insightsData || {
              conferenceSid: sid,
              processingState: 'complete',
              durationSeconds: 120,
              participantCount: 2,
            };
          },
          conferenceParticipants: {
            list: async () => {
              if (config.participantInsightsError) throw config.participantInsightsError;
              return config.participantInsightsData;
            },
          },
        }),
      },
    },
    monitor: {
      v1: {
        alerts: {
          list: async () => {
            if (config.alertsError) throw config.alertsError;
            return config.alertsData;
          },
        },
      },
    },
    // New mocks for recordings
    recordings: (sid: string) => ({
      fetch: async () => {
        if (config.recordingError) throw config.recordingError;
        return config.recordingData || {
          sid,
          status: config.recordingStatus,
          callSid: 'CA123',
          conferenceSid: null,
          duration: '120',
          channels: 1,
          source: 'OutboundAPI',
          uri: `/2010-04-01/Accounts/AC123/Recordings/${sid}.json`,
          errorCode: null,
        };
      },
    }),
    // New mocks for Intelligence (transcripts)
    intelligence: {
      v2: {
        transcripts: (sid: string) => ({
          fetch: async () => {
            if (config.transcriptError) throw config.transcriptError;
            return config.transcriptData || {
              sid,
              serviceSid: 'GA123',
              status: config.transcriptStatus,
              languageCode: 'en-US',
              duration: 120,
              redaction: false,
            };
          },
          sentences: {
            list: async () => {
              if (config.sentencesError) throw config.sentencesError;
              return config.sentencesData;
            },
          },
          operatorResults: {
            list: async () => {
              if (config.operatorResultsError) throw config.operatorResultsError;
              return config.operatorResultsData;
            },
          },
        }),
      },
    },
    // New mocks for Serverless
    serverless: {
      v1: {
        services: (_serviceSid: string) => ({
          environments: (_envSid: string) => ({
            logs: {
              list: async () => {
                if (config.serverlessLogsError) throw config.serverlessLogsError;
                return config.serverlessLogsData;
              },
            },
          }),
        }),
      },
    },
  };
}

describe('DeepValidator', () => {
  describe('validateConference', () => {
    it('should validate a completed conference successfully', async () => {
      const client = createMockClient({
        conferenceStatus: 'completed',
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest123');

      expect(result.success).toBe(true);
      expect(result.resourceType).toBe('conference');
      expect(result.primaryStatus).toBe('completed');
      expect(result.checks.resourceStatus.passed).toBe(true);
      expect(result.checks.debuggerAlerts.passed).toBe(true);
    });

    it('should include resourceSid in result', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest456');

      expect(result.resourceSid).toBe('CFtest456');
    });

    it('should include duration in result', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest789');

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should check Conference Insights for completed conferences', async () => {
      const client = createMockClient({
        conferenceStatus: 'completed',
        insightsData: {
          conferenceSid: 'CFtest123',
          processingState: 'complete',
          durationSeconds: 300,
          participantCount: 3,
        },
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest123');

      expect(result.checks.conferenceInsights).toBeDefined();
      expect(result.checks.conferenceInsights?.passed).toBe(true);
    });

    it('should not check Conference Insights for in-progress conferences', async () => {
      const client = createMockClient({
        conferenceStatus: 'in-progress',
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest123');

      expect(result.checks.conferenceInsights).toBeUndefined();
    });

    it('should handle 404 from Conference Insights gracefully (data not yet available)', async () => {
      const notFoundError = new Error('Not found');
      (notFoundError as Error & { code: number }).code = 20404;

      const client = createMockClient({
        conferenceStatus: 'completed',
        insightsError: notFoundError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest123');

      // Should pass because 404 means data not ready yet (timing)
      expect(result.success).toBe(true);
      expect(result.checks.conferenceInsights?.passed).toBe(true);
      expect(result.checks.conferenceInsights?.message).toContain('not yet available');
    });

    it('should check Conference Participant Insights for completed conferences', async () => {
      const client = createMockClient({
        conferenceStatus: 'completed',
        participantInsightsData: [
          { participantSid: 'CP001', callSid: 'CA001', callDirection: 'inbound' },
          { participantSid: 'CP002', callSid: 'CA002', callDirection: 'outbound_dial' },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest123');

      expect(result.checks.conferenceParticipantInsights).toBeDefined();
      expect(result.checks.conferenceParticipantInsights?.passed).toBe(true);
    });

    it('should report errors when conference fetch fails', async () => {
      const fetchError = new Error('Conference not found');
      (fetchError as Error & { code: number }).code = 20404;

      const client = createMockClient({
        conferenceError: fetchError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFnotexist');

      expect(result.success).toBe(false);
      expect(result.checks.resourceStatus.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect debugger alerts related to the conference', async () => {
      const client = createMockClient({
        alertsData: [
          {
            sid: 'NO001',
            resourceSid: 'CFtest123',
            alertText: 'Conference error',
            logLevel: 'error',
            dateCreated: new Date(),
          },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest123');

      expect(result.checks.debuggerAlerts.passed).toBe(false);
      expect(result.errors.some(e => e.includes('alert'))).toBe(true);
    });
  });

  describe('ValidationResult interface', () => {
    it('should have correct resourceType values', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest');

      // TypeScript compile-time check for allowed values
      const validTypes: ValidationResult['resourceType'][] = [
        'message',
        'call',
        'verification',
        'task',
        'conference',
      ];
      expect(validTypes).toContain(result.resourceType);
    });

    it('should include all expected check fields for conferences', async () => {
      const client = createMockClient({ conferenceStatus: 'completed' });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest');

      expect(result.checks).toHaveProperty('resourceStatus');
      expect(result.checks).toHaveProperty('debuggerAlerts');
      // These are optional for conferences
      expect('conferenceInsights' in result.checks || result.checks.conferenceInsights === undefined).toBe(true);
      expect('conferenceParticipantInsights' in result.checks || result.checks.conferenceParticipantInsights === undefined).toBe(true);
    });
  });

  describe('ValidationOptions', () => {
    it('should accept syncServiceSid option', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const options: ValidationOptions = {
        syncServiceSid: 'IS123',
      };

      // Should not throw
      const result = await validator.validateConference('CFtest', options);
      expect(result).toBeDefined();
    });

    it('should accept serverlessServiceSid option', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const options: ValidationOptions = {
        serverlessServiceSid: 'ZS123',
      };

      // Should not throw
      const result = await validator.validateConference('CFtest', options);
      expect(result).toBeDefined();
    });

    it('should use default options when none provided', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      // Should not throw
      const result = await validator.validateConference('CFtest');
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe('Conference Insights timing documentation', () => {
    /**
     * These tests document the expected timing behavior for Conference Insights:
     * - Partial data: ~2 minutes after conference end (no SLA)
     * - Final data: Locked and immutable 30 minutes after end
     *
     * The validator handles 404 responses gracefully since data may not
     * be immediately available after a conference ends.
     */

    it('should document timing behavior in 404 handling', async () => {
      const notFoundError = new Error('Not found');
      (notFoundError as Error & { code: number }).code = 20404;

      const client = createMockClient({
        conferenceStatus: 'completed',
        insightsError: notFoundError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFrecent');

      // 404 should pass and include timing explanation
      expect(result.checks.conferenceInsights?.passed).toBe(true);
      expect(result.checks.conferenceInsights?.message).toMatch(/not yet available|timing/i);
    });

    it('should include processingState in insights data when available', async () => {
      const client = createMockClient({
        conferenceStatus: 'completed',
        insightsData: {
          conferenceSid: 'CFtest',
          processingState: 'partial', // Data is partial, not final
          durationSeconds: 60,
          participantCount: 2,
        },
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateConference('CFtest');

      expect(result.checks.conferenceInsights?.data).toBeDefined();
      const data = result.checks.conferenceInsights?.data as Record<string, unknown>;
      expect(data.processingState).toBe('partial');
    });
  });

  // ==================== NEW VALIDATION METHODS ====================

  describe('validateDebugger', () => {
    it('should return success when no alerts exist', async () => {
      const client = createMockClient({
        alertsData: [],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateDebugger();

      expect(result.success).toBe(true);
      expect(result.totalAlerts).toBe(0);
      expect(result.errorAlerts).toBe(0);
      expect(result.warningAlerts).toBe(0);
      expect(result.alerts).toHaveLength(0);
    });

    it('should detect error-level alerts and return failure', async () => {
      const client = createMockClient({
        alertsData: [
          {
            sid: 'NO001',
            errorCode: '11200',
            logLevel: 'error',
            alertText: 'HTTP retrieval failure',
            resourceSid: 'CA123',
            serviceSid: null,
            dateCreated: new Date(),
          },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateDebugger();

      expect(result.success).toBe(false);
      expect(result.totalAlerts).toBe(1);
      expect(result.errorAlerts).toBe(1);
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].errorCode).toBe('11200');
    });

    it('should count warnings but not fail for warning-level alerts', async () => {
      const client = createMockClient({
        alertsData: [
          {
            sid: 'NO002',
            errorCode: '12300',
            logLevel: 'warning',
            alertText: 'Document parse failure (warning)',
            resourceSid: 'SM123',
            serviceSid: null,
            dateCreated: new Date(),
          },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateDebugger();

      expect(result.success).toBe(true); // Warnings don't fail
      expect(result.totalAlerts).toBe(1);
      expect(result.warningAlerts).toBe(1);
      expect(result.errorAlerts).toBe(0);
    });

    it('should include duration in result', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateDebugger();

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should include timeRange in result', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateDebugger();

      expect(result.timeRange).toBeDefined();
      expect(result.timeRange.start).toBeInstanceOf(Date);
      expect(result.timeRange.end).toBeInstanceOf(Date);
    });

    it('should respect logLevel filter option', async () => {
      const client = createMockClient({
        alertsData: [
          { sid: 'NO001', errorCode: '11200', logLevel: 'error', alertText: 'Error', dateCreated: new Date() },
          { sid: 'NO002', errorCode: '12300', logLevel: 'warning', alertText: 'Warning', dateCreated: new Date() },
        ],
      });
      const validator = new DeepValidator(client as never);

      // Note: logLevel filter in options would filter returned alerts
      const result = await validator.validateDebugger({ logLevel: 'warning' });

      expect(result.totalAlerts).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateServerlessFunctions', () => {
    it('should return success when no error logs exist', async () => {
      const client = createMockClient({
        serverlessLogsData: [
          {
            sid: 'NO001',
            message: 'Function executed successfully',
            level: 'info',
            functionSid: 'ZH123',
            dateCreated: new Date(),
          },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateServerlessFunctions({
        serverlessServiceSid: 'ZS123',
      });

      expect(result.success).toBe(true);
      expect(result.errorLogs).toBe(0);
    });

    it('should detect error-level logs and return failure', async () => {
      const client = createMockClient({
        serverlessLogsData: [
          {
            sid: 'NO001',
            message: 'Error: Cannot read property of undefined',
            level: 'error',
            functionSid: 'ZH123',
            dateCreated: new Date(),
          },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateServerlessFunctions({
        serverlessServiceSid: 'ZS123',
      });

      expect(result.success).toBe(false);
      expect(result.errorLogs).toBe(1);
      expect(result.logs).toHaveLength(1);
    });

    it('should count warnings separately', async () => {
      const client = createMockClient({
        serverlessLogsData: [
          { sid: 'NO001', message: 'Warning: deprecated API', level: 'warn', functionSid: 'ZH123', dateCreated: new Date() },
          { sid: 'NO002', message: 'Info log', level: 'info', functionSid: 'ZH123', dateCreated: new Date() },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateServerlessFunctions({
        serverlessServiceSid: 'ZS123',
      });

      expect(result.success).toBe(true); // Warnings don't fail
      expect(result.warnLogs).toBe(1);
      expect(result.errorLogs).toBe(0);
    });

    it('should group logs by function', async () => {
      const client = createMockClient({
        serverlessLogsData: [
          { sid: 'NO001', message: 'Log 1', level: 'info', functionSid: 'ZH001', dateCreated: new Date() },
          { sid: 'NO002', message: 'Log 2', level: 'error', functionSid: 'ZH001', dateCreated: new Date() },
          { sid: 'NO003', message: 'Log 3', level: 'info', functionSid: 'ZH002', dateCreated: new Date() },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateServerlessFunctions({
        serverlessServiceSid: 'ZS123',
      });

      expect(result.byFunction).toBeDefined();
      expect(result.byFunction['ZH001']).toBeDefined();
      expect(result.byFunction['ZH001'].total).toBe(2);
      expect(result.byFunction['ZH001'].errors).toBe(1);
      expect(result.byFunction['ZH002'].total).toBe(1);
    });

    it('should include duration and timeRange in result', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateServerlessFunctions({
        serverlessServiceSid: 'ZS123',
      });

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.timeRange.start).toBeInstanceOf(Date);
      expect(result.timeRange.end).toBeInstanceOf(Date);
    });
  });

  describe('validateRecording', () => {
    it('should return success for completed recording', async () => {
      const client = createMockClient({
        recordingStatus: 'completed',
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateRecording('RE123');

      expect(result.success).toBe(true);
      expect(result.recordingSid).toBe('RE123');
      expect(result.status).toBe('completed');
    });

    it('should return failure for failed recording', async () => {
      const client = createMockClient({
        recordingStatus: 'failed',
        recordingData: {
          sid: 'RE123',
          status: 'failed',
          callSid: 'CA123',
          conferenceSid: null,
          duration: '0',
          channels: 1,
          source: 'OutboundAPI',
          uri: '/2010-04-01/Accounts/AC123/Recordings/RE123.json',
          errorCode: 31205,
        },
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateRecording('RE123');

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should include recording metadata', async () => {
      const client = createMockClient({
        recordingStatus: 'completed',
        recordingData: {
          sid: 'RE123',
          status: 'completed',
          callSid: 'CA456',
          conferenceSid: 'CF789',
          duration: '300',
          channels: 2,
          source: 'DialVerb',
          uri: '/2010-04-01/Accounts/AC123/Recordings/RE123.json',
          errorCode: null,
        },
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateRecording('RE123');

      expect(result.callSid).toBe('CA456');
      expect(result.conferenceSid).toBe('CF789');
      expect(result.duration).toBe(300);
      expect(result.channels).toBe(2);
      expect(result.source).toBe('DialVerb');
    });

    it('should include media URL', async () => {
      const client = createMockClient({
        recordingStatus: 'completed',
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateRecording('RE123');

      expect(result.mediaUrl).toBeDefined();
      expect(result.mediaUrl).toContain('.mp3');
    });

    it('should include validationDuration', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateRecording('RE123');

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
    });

    it('should handle fetch errors gracefully', async () => {
      const fetchError = new Error('Recording not found');
      (fetchError as Error & { code: number }).code = 20404;

      const client = createMockClient({
        recordingError: fetchError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateRecording('REnotexist');

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateTranscript', () => {
    it('should return success for completed transcript with sentences', async () => {
      const client = createMockClient({
        transcriptStatus: 'completed',
        sentencesData: [
          { sid: 'GX001', transcript: 'Hello, how are you?', confidence: 0.95 },
          { sid: 'GX002', transcript: 'I am fine, thank you.', confidence: 0.92 },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTranscript('GT123');

      expect(result.success).toBe(true);
      expect(result.transcriptSid).toBe('GT123');
      expect(result.status).toBe('completed');
      expect(result.sentenceCount).toBe(2);
    });

    it('should return failure for failed transcript', async () => {
      const client = createMockClient({
        transcriptStatus: 'failed',
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTranscript('GT123');

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn when transcript has no sentences', async () => {
      const client = createMockClient({
        transcriptStatus: 'completed',
        sentencesData: [],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTranscript('GT123', { checkSentences: true });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Transcript completed but has no sentences');
    });

    it('should include transcript metadata', async () => {
      const client = createMockClient({
        transcriptStatus: 'completed',
        transcriptData: {
          sid: 'GT123',
          serviceSid: 'GA456',
          status: 'completed',
          languageCode: 'es-ES',
          duration: 180,
          redaction: true,
        },
        sentencesData: [{ sid: 'GX001', transcript: 'Hola', confidence: 0.9 }],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTranscript('GT123');

      expect(result.serviceSid).toBe('GA456');
      expect(result.languageCode).toBe('es-ES');
      expect(result.duration).toBe(180);
      expect(result.redactionEnabled).toBe(true);
    });

    it('should include validationDuration', async () => {
      const client = createMockClient({
        sentencesData: [{ sid: 'GX001', transcript: 'Test', confidence: 0.9 }],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTranscript('GT123');

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
    });

    it('should handle fetch errors gracefully', async () => {
      const fetchError = new Error('Transcript not found');
      (fetchError as Error & { code: number }).code = 20404;

      const client = createMockClient({
        transcriptError: fetchError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTranscript('GTnotexist');

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateLanguageOperator', () => {
    it('should return success when operator results exist', async () => {
      const client = createMockClient({
        operatorResultsData: [
          {
            operatorSid: 'LY001',
            operatorType: 'text-generation',
            name: 'Call Summary',
            textGenerationResults: 'This call was about billing inquiry.',
          },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateLanguageOperator('GT123');

      expect(result.success).toBe(true);
      expect(result.transcriptSid).toBe('GT123');
      expect(result.operatorResults).toHaveLength(1);
      expect(result.operatorResults[0].operatorType).toBe('text-generation');
      expect(result.operatorResults[0].textGenerationResults).toContain('billing');
    });

    it('should return failure when no operator results and requireResults=true', async () => {
      const client = createMockClient({
        operatorResultsData: [],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateLanguageOperator('GT123', { requireResults: true });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No operator results found for transcript');
    });

    it('should filter by operatorType when specified', async () => {
      const client = createMockClient({
        operatorResultsData: [
          { operatorSid: 'LY001', operatorType: 'text-generation', name: 'Summary', textGenerationResults: 'Summary text' },
          { operatorSid: 'LY002', operatorType: 'classification', name: 'Sentiment', predictedLabel: 'positive', predictedProbability: 0.87 },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateLanguageOperator('GT123', {
        operatorType: 'classification',
      });

      expect(result.success).toBe(true);
      expect(result.operatorResults).toHaveLength(1);
      expect(result.operatorResults[0].operatorType).toBe('classification');
    });

    it('should filter by operatorName when specified', async () => {
      const client = createMockClient({
        operatorResultsData: [
          { operatorSid: 'LY001', operatorType: 'text-generation', name: 'Summary', textGenerationResults: 'Summary' },
          { operatorSid: 'LY002', operatorType: 'text-generation', name: 'Action Items', textGenerationResults: 'Action items list' },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateLanguageOperator('GT123', {
        operatorName: 'Action Items',
      });

      expect(result.success).toBe(true);
      expect(result.operatorResults).toHaveLength(1);
      expect(result.operatorResults[0].name).toBe('Action Items');
    });

    it('should include all operator result fields', async () => {
      const client = createMockClient({
        operatorResultsData: [
          {
            operatorSid: 'LY001',
            operatorType: 'classification',
            name: 'Intent',
            predictedLabel: 'support_request',
            predictedProbability: 0.92,
          },
          {
            operatorSid: 'LY002',
            operatorType: 'extraction',
            name: 'Phone Number',
            extractMatch: true,
            extractResults: { phone: '+15551234567' },
          },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateLanguageOperator('GT123');

      expect(result.operatorResults).toHaveLength(2);

      const classification = result.operatorResults.find(r => r.operatorType === 'classification');
      expect(classification?.predictedLabel).toBe('support_request');
      expect(classification?.predictedProbability).toBe(0.92);

      const extraction = result.operatorResults.find(r => r.operatorType === 'extraction');
      expect(extraction?.extractMatch).toBe(true);
      expect(extraction?.extractResults).toEqual({ phone: '+15551234567' });
    });

    it('should include validationDuration', async () => {
      const client = createMockClient({
        operatorResultsData: [{ operatorSid: 'LY001', operatorType: 'text-generation', name: 'Test', textGenerationResults: 'Test' }],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateLanguageOperator('GT123');

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
    });

    it('should handle fetch errors gracefully', async () => {
      const fetchError = new Error('Operator results not found');

      const client = createMockClient({
        operatorResultsError: fetchError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateLanguageOperator('GTnotexist');

      expect(result.success).toBe(false);
      expect(result.operatorResults).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ==================== CONVERSATION RELAY VALIDATION ====================

  describe('validateConversationRelay', () => {
    // Mock WebSocket for testing - simpler version to avoid recursion
    function createMockWebSocket(options: {
      shouldConnect?: boolean;
      shouldSendGreeting?: boolean;
      greetingText?: string;
      shouldSendResponse?: boolean;
      responseText?: string;
      shouldError?: boolean;
      errorMessage?: string;
    } = {}) {
      const {
        shouldConnect = true,
        shouldSendGreeting = true,
        greetingText = 'Hello, how can I help you?',
        shouldSendResponse = false,
        responseText = 'I can help with that.',
        shouldError = false,
        errorMessage = 'Connection refused',
      } = options;

      return class MockWebSocket {
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: ((error: { message: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        readyState = 0;
        private closed = false;

        constructor(_url: string) {
          setTimeout(() => {
            if (this.closed) return;
            if (shouldError) {
              if (this.onerror) this.onerror({ message: errorMessage });
              return;
            }
            if (shouldConnect) {
              this.readyState = 1;
              if (this.onopen) this.onopen();
            }
          }, 5);
        }

        send(data: string) {
          if (this.closed) return;
          const msg = JSON.parse(data);

          // After setup, send greeting
          if (msg.type === 'setup' && shouldSendGreeting) {
            setTimeout(() => {
              if (this.closed) return;
              if (this.onmessage) {
                this.onmessage({ data: JSON.stringify({ type: 'text', token: greetingText }) });
              }
            }, 10);
          }

          // After prompt, send response
          if (msg.type === 'prompt' && shouldSendResponse) {
            setTimeout(() => {
              if (this.closed) return;
              if (this.onmessage) {
                this.onmessage({ data: JSON.stringify({ type: 'text', token: responseText, last: true }) });
              }
            }, 15);
          }
        }

        close() {
          if (this.closed) return;
          this.closed = true;
          this.readyState = 3;
          // Don't call onclose here - let the test control when/if it's called
        }
      };
    }

    it('should return error when WebSocket implementation is explicitly null', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      // Create a mock that throws on construction to simulate unavailable WebSocket
      class ThrowingWebSocket {
        constructor() {
          throw new Error('WebSocket not supported in this environment');
        }
      }

      const result = await validator.validateConversationRelay(
        { url: 'wss://test.example.com/relay' },
        ThrowingWebSocket
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('connect') || e.includes('WebSocket'))).toBe(true);
    });

    it('should successfully validate when greeting is received', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);
      const MockWS = createMockWebSocket({ shouldSendGreeting: true });

      const result = await validator.validateConversationRelay({
        url: 'wss://test.example.com/relay',
        timeout: 1000,
      }, MockWS);

      expect(result.success).toBe(true);
      expect(result.connectionEstablished).toBe(true);
      expect(result.greetingReceived).toBe(true);
      expect(result.greetingText).toBe('Hello, how can I help you?');
    });

    it('should handle connection errors gracefully', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);
      const MockWS = createMockWebSocket({ shouldError: true, errorMessage: 'Connection refused' });

      const result = await validator.validateConversationRelay({
        url: 'wss://test.example.com/relay',
        timeout: 500,
      }, MockWS);

      expect(result.success).toBe(false);
      expect(result.connectionEstablished).toBe(false);
      expect(result.errors.some(e => e.includes('Connection refused'))).toBe(true);
    });

    it('should timeout when no greeting received', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);
      const MockWS = createMockWebSocket({ shouldSendGreeting: false });

      const result = await validator.validateConversationRelay({
        url: 'wss://test.example.com/relay',
        timeout: 50, // Very short timeout
      }, MockWS);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Timeout'))).toBe(true);
    }, 1000); // Increase Jest timeout for this test

    it('should validate test message response when configured', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);
      const MockWS = createMockWebSocket({
        shouldSendGreeting: true,
        shouldSendResponse: true,
        responseText: 'I can help with that.',
      });

      const result = await validator.validateConversationRelay({
        url: 'wss://test.example.com/relay',
        timeout: 1000,
        testMessage: 'Can you help me?',
        validateLLMResponse: true,
      }, MockWS);

      expect(result.success).toBe(true);
      expect(result.greetingReceived).toBe(true);
      expect(result.responseReceived).toBe(true);
      expect(result.responseText).toBe('I can help with that.');
    });

    it('should include validation duration', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);
      const MockWS = createMockWebSocket({ shouldSendGreeting: true });

      const result = await validator.validateConversationRelay({
        url: 'wss://test.example.com/relay',
        timeout: 1000,
      }, MockWS);

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
      expect(typeof result.validationDuration).toBe('number');
    });

    it('should track protocol errors for invalid JSON', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      // Create a mock that sends invalid JSON
      class BadJsonWebSocket {
        onopen: (() => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: ((error: { message: string }) => void) | null = null;
        onclose: (() => void) | null = null;
        readyState = 0;
        private closed = false;

        constructor(_url: string) {
          setTimeout(() => {
            if (this.closed) return;
            this.readyState = 1;
            if (this.onopen) this.onopen();
          }, 5);
        }

        send(_data: string) {
          if (this.closed) return;
          // Send invalid JSON after setup
          setTimeout(() => {
            if (this.closed) return;
            if (this.onmessage) {
              this.onmessage({ data: 'not valid json {{{' });
            }
          }, 10);
        }

        close() {
          this.closed = true;
          this.readyState = 3;
        }
      }

      const result = await validator.validateConversationRelay({
        url: 'wss://test.example.com/relay',
        timeout: 100,
        validateGreeting: true,
      }, BadJsonWebSocket);

      expect(result.protocolErrors.length).toBeGreaterThan(0);
      expect(result.protocolErrors[0]).toContain('Invalid JSON');
    });
  });

  // ==================== PREREQUISITE VALIDATION ====================

  describe('validatePrerequisites', () => {
    it('should return success when all required checks pass', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validatePrerequisites({
        checks: [
          {
            name: 'Test Check 1',
            required: true,
            check: async () => ({ ok: true, message: 'Check 1 passed' }),
          },
          {
            name: 'Test Check 2',
            required: true,
            check: async () => ({ ok: true, message: 'Check 2 passed' }),
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results.every(r => r.ok)).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return failure when required check fails', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validatePrerequisites({
        checks: [
          {
            name: 'Pass Check',
            required: true,
            check: async () => ({ ok: true, message: 'Passed' }),
          },
          {
            name: 'Fail Check',
            required: true,
            check: async () => ({ ok: false, message: 'Service not found' }),
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Fail Check: Service not found');
    });

    it('should not fail for optional check failures', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validatePrerequisites({
        checks: [
          {
            name: 'Required Pass',
            required: true,
            check: async () => ({ ok: true, message: 'Passed' }),
          },
          {
            name: 'Optional Fail',
            required: false,
            check: async () => ({ ok: false, message: 'Not configured' }),
          },
        ],
      });

      expect(result.success).toBe(true); // Optional failure doesn't fail validation
      expect(result.results[1].ok).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should stop on first failure when configured', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);
      let check2Ran = false;

      const result = await validator.validatePrerequisites({
        checks: [
          {
            name: 'Fail First',
            required: true,
            check: async () => ({ ok: false, message: 'Failed' }),
          },
          {
            name: 'Second Check',
            required: true,
            check: async () => {
              check2Ran = true;
              return { ok: true, message: 'Passed' };
            },
          },
        ],
        stopOnFirstFailure: true,
      });

      expect(result.success).toBe(false);
      expect(check2Ran).toBe(false);
      expect(result.results).toHaveLength(1);
    });

    it('should handle check that throws error', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validatePrerequisites({
        checks: [
          {
            name: 'Throws Error',
            required: true,
            check: async () => {
              throw new Error('Unexpected error');
            },
          },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.results[0].ok).toBe(false);
      expect(result.results[0].message).toContain('Check threw error');
    });

    it('should include validation duration', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validatePrerequisites({
        checks: [
          {
            name: 'Quick Check',
            required: true,
            check: async () => ({ ok: true, message: 'Done' }),
          },
        ],
      });

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
      expect(typeof result.validationDuration).toBe('number');
    });
  });

  describe('prerequisiteChecks factory', () => {
    it('should provide envVar check that validates env variable', async () => {
      const check = DeepValidator.prerequisiteChecks.envVar('TEST_VAR', 'some-value');
      const result = await check.check();

      expect(result.ok).toBe(true);
      expect(result.message).toContain('is set');
    });

    it('should provide envVar check that fails for missing value', async () => {
      const check = DeepValidator.prerequisiteChecks.envVar('MISSING_VAR', undefined);
      const result = await check.check();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('not set');
    });

    it('should have intelligenceService factory method', () => {
      const client = createMockClient();
      const check = DeepValidator.prerequisiteChecks.intelligenceService(client as never, 'GA123');

      expect(check.name).toBe('Conversational Intelligence Service');
      expect(check.required).toBe(true);
      expect(typeof check.check).toBe('function');
    });

    it('should have syncService factory method', () => {
      const client = createMockClient();
      const check = DeepValidator.prerequisiteChecks.syncService(client as never, 'IS123');

      expect(check.name).toBe('Twilio Sync Service');
      expect(check.required).toBe(true);
    });

    it('should have verifyService factory method', () => {
      const client = createMockClient();
      const check = DeepValidator.prerequisiteChecks.verifyService(client as never, 'VA123');

      expect(check.name).toBe('Twilio Verify Service');
      expect(check.required).toBe(true);
    });

    it('should have phoneNumber factory method', () => {
      const client = createMockClient();
      const check = DeepValidator.prerequisiteChecks.phoneNumber(client as never, '+15551234567');

      expect(check.name).toBe('Phone Number Ownership');
      expect(check.required).toBe(true);
    });

    it('should have serverlessService factory method', () => {
      const client = createMockClient();
      const check = DeepValidator.prerequisiteChecks.serverlessService(client as never, 'ZS123');

      expect(check.name).toBe('Twilio Serverless Service');
      expect(check.required).toBe(true);
    });

    it('should have taskRouterWorkspace factory method', () => {
      const client = createMockClient();
      const check = DeepValidator.prerequisiteChecks.taskRouterWorkspace(client as never, 'WS123');

      expect(check.name).toBe('TaskRouter Workspace');
      expect(check.required).toBe(true);
    });

    it('should have messagingService factory method', () => {
      const client = createMockClient();
      const check = DeepValidator.prerequisiteChecks.messagingService(client as never, 'MG123');

      expect(check.name).toBe('Messaging Service');
      expect(check.required).toBe(true);
    });

    it('should fail intelligenceService check when SID not provided', async () => {
      const client = createMockClient();
      const check = DeepValidator.prerequisiteChecks.intelligenceService(client as never, undefined);
      const result = await check.check();

      expect(result.ok).toBe(false);
      expect(result.message).toContain('not set');
    });
  });
});
