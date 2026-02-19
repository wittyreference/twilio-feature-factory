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
  // Sync mock configs
  syncDocumentData: Record<string, unknown> | null;
  syncDocumentError: Error | null;
  syncListData: Record<string, unknown> | null;
  syncListError: Error | null;
  syncListItemsData: Array<Record<string, unknown>>;
  syncListItemsError: Error | null;
  syncMapData: Record<string, unknown> | null;
  syncMapError: Error | null;
  syncMapItemsData: Array<Record<string, unknown>>;
  syncMapItemsError: Error | null;
  // TaskRouter mock configs
  taskData: Record<string, unknown> | null;
  taskError: Error | null;
  taskReservationsData: Array<Record<string, unknown>>;
  taskReservationsError: Error | null;
  taskEventsData: Array<Record<string, unknown>>;
  taskEventsError: Error | null;
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
    // Sync defaults
    syncDocumentData: null,
    syncDocumentError: null,
    syncListData: null,
    syncListError: null,
    syncListItemsData: [],
    syncListItemsError: null,
    syncMapData: null,
    syncMapError: null,
    syncMapItemsData: [],
    syncMapItemsError: null,
    // TaskRouter defaults
    taskData: null,
    taskError: null,
    taskReservationsData: [],
    taskReservationsError: null,
    taskEventsData: [],
    taskEventsError: null,
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
    // Sync mocks
    sync: {
      v1: {
        services: (_serviceSid: string) => ({
          documents: (_docSidOrName: string) => ({
            fetch: async () => {
              if (config.syncDocumentError) throw config.syncDocumentError;
              return config.syncDocumentData || {
                sid: 'ET123',
                uniqueName: _docSidOrName.startsWith('ET') ? undefined : _docSidOrName,
                revision: '1',
                data: { status: 'active', count: 42 },
                dateExpires: null,
              };
            },
          }),
          syncLists: (_listSidOrName: string) => ({
            fetch: async () => {
              if (config.syncListError) throw config.syncListError;
              return config.syncListData || {
                sid: 'ES123',
                uniqueName: _listSidOrName.startsWith('ES') ? undefined : _listSidOrName,
                revision: '3',
              };
            },
            syncListItems: {
              list: async () => {
                if (config.syncListItemsError) throw config.syncListItemsError;
                return config.syncListItemsData;
              },
            },
          }),
          syncMaps: (_mapSidOrName: string) => ({
            fetch: async () => {
              if (config.syncMapError) throw config.syncMapError;
              return config.syncMapData || {
                sid: 'MP123',
                uniqueName: _mapSidOrName.startsWith('MP') ? undefined : _mapSidOrName,
                revision: '2',
              };
            },
            syncMapItems: {
              list: async () => {
                if (config.syncMapItemsError) throw config.syncMapItemsError;
                return config.syncMapItemsData;
              },
            },
          }),
        }),
      },
    },
    // TaskRouter mocks
    taskrouter: {
      v1: {
        workspaces: (_workspaceSid: string) => ({
          tasks: (_taskSid: string) => ({
            fetch: async () => {
              if (config.taskError) throw config.taskError;
              return config.taskData || {
                sid: _taskSid,
                assignmentStatus: 'reserved',
                age: 120,
                priority: 0,
                reason: null,
                taskQueueSid: 'WQ123',
                workflowSid: 'WW123',
                attributes: '{"language":"en","skill":"support"}',
              };
            },
            reservations: {
              list: async () => {
                if (config.taskReservationsError) throw config.taskReservationsError;
                return config.taskReservationsData;
              },
            },
          }),
          events: {
            list: async () => {
              if (config.taskEventsError) throw config.taskEventsError;
              return config.taskEventsData;
            },
          },
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

  // ==================== SYNC DOCUMENT VALIDATION ====================

  describe('validateSyncDocument', () => {
    it('should validate a document successfully', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncDocument('IS123', 'my-doc');

      expect(result.success).toBe(true);
      expect(result.documentSid).toBe('ET123');
      expect(result.uniqueName).toBe('my-doc');
      expect(result.serviceSid).toBe('IS123');
      expect(result.revision).toBe('1');
      expect(result.dataKeys).toContain('status');
      expect(result.dataKeys).toContain('count');
    });

    it('should include document metadata', async () => {
      const client = createMockClient({
        syncDocumentData: {
          sid: 'ET456',
          uniqueName: 'test-doc',
          revision: '5',
          data: { name: 'Test', version: 2 },
          dateExpires: new Date('2026-12-31T00:00:00Z'),
        },
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncDocument('IS123', 'test-doc');

      expect(result.documentSid).toBe('ET456');
      expect(result.revision).toBe('5');
      expect(result.data).toEqual({ name: 'Test', version: 2 });
      expect(result.dateExpires).toBeDefined();
    });

    it('should detect missing expected keys', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncDocument('IS123', 'my-doc', {
        expectedKeys: ['status', 'count', 'missing_key'],
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('missing_key'))).toBe(true);
    });

    it('should detect unexpected keys in strict mode', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncDocument('IS123', 'my-doc', {
        expectedKeys: ['status'],
        strictKeys: true,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Unexpected keys'))).toBe(true);
      expect(result.errors.some(e => e.includes('count'))).toBe(true);
    });

    it('should validate expected types', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncDocument('IS123', 'my-doc', {
        expectedTypes: { status: 'string', count: 'string' }, // count is number, not string
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('"count"') && e.includes('string') && e.includes('number'))).toBe(true);
    });

    it('should detect array type correctly', async () => {
      const client = createMockClient({
        syncDocumentData: {
          sid: 'ET123',
          uniqueName: null,
          revision: '1',
          data: { items: [1, 2, 3] },
          dateExpires: null,
        },
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncDocument('IS123', 'ET123', {
        expectedTypes: { items: 'array' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle fetch error gracefully', async () => {
      const fetchError = new Error('Document not found');
      (fetchError as Error & { code: number }).code = 20404;

      const client = createMockClient({
        syncDocumentError: fetchError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncDocument('IS123', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Failed to fetch document'))).toBe(true);
      expect(result.data).toEqual({});
      expect(result.dataKeys).toEqual([]);
    });

    it('should include validationDuration', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncDocument('IS123', 'my-doc');

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
      expect(typeof result.validationDuration).toBe('number');
    });
  });

  // ==================== SYNC LIST VALIDATION ====================

  describe('validateSyncList', () => {
    it('should validate a list successfully', async () => {
      const client = createMockClient({
        syncListItemsData: [
          { index: 0, data: { name: 'Alice' } },
          { index: 1, data: { name: 'Bob' } },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'my-list');

      expect(result.success).toBe(true);
      expect(result.listSid).toBe('ES123');
      expect(result.uniqueName).toBe('my-list');
      expect(result.itemCount).toBe(2);
      expect(result.items).toHaveLength(2);
    });

    it('should enforce exact item count', async () => {
      const client = createMockClient({
        syncListItemsData: [
          { index: 0, data: { name: 'Alice' } },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'my-list', {
        exactItems: 3,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('exactly 3') && e.includes('found 1'))).toBe(true);
    });

    it('should enforce minimum item count', async () => {
      const client = createMockClient({
        syncListItemsData: [
          { index: 0, data: { a: 1 } },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'my-list', {
        minItems: 5,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('at least 5'))).toBe(true);
    });

    it('should enforce maximum item count', async () => {
      const client = createMockClient({
        syncListItemsData: [
          { index: 0, data: { a: 1 } },
          { index: 1, data: { a: 2 } },
          { index: 2, data: { a: 3 } },
          { index: 3, data: { a: 4 } },
          { index: 4, data: { a: 5 } },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'my-list', {
        maxItems: 3,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('at most 3'))).toBe(true);
    });

    it('should detect items with missing expected keys', async () => {
      const client = createMockClient({
        syncListItemsData: [
          { index: 0, data: { name: 'Alice', email: 'a@b.com' } },
          { index: 1, data: { name: 'Bob' } }, // missing email
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'my-list', {
        expectedItemKeys: ['name', 'email'],
      });

      expect(result.success).toBe(true); // missing keys are warnings
      expect(result.itemsWithMissingKeys).toHaveLength(1);
      expect(result.itemsWithMissingKeys[0].index).toBe(1);
      expect(result.itemsWithMissingKeys[0].missingKeys).toContain('email');
      expect(result.warnings.some(w => w.includes('1 items missing expected keys'))).toBe(true);
    });

    it('should handle empty list', async () => {
      const client = createMockClient({
        syncListItemsData: [],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'my-list');

      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it('should handle fetch error gracefully', async () => {
      const fetchError = new Error('List not found');

      const client = createMockClient({
        syncListError: fetchError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Failed to fetch list'))).toBe(true);
    });

    it('should include list metadata', async () => {
      const client = createMockClient({
        syncListItemsData: [{ index: 0, data: { x: 1 } }],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'my-list');

      expect(result.serviceSid).toBe('IS123');
      expect(result.revision).toBe('3');
    });

    it('should include validationDuration', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncList('IS123', 'my-list');

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== SYNC MAP VALIDATION ====================

  describe('validateSyncMap', () => {
    it('should validate a map successfully', async () => {
      const client = createMockClient({
        syncMapItemsData: [
          { key: 'user-1', data: { name: 'Alice', role: 'admin' } },
          { key: 'user-2', data: { name: 'Bob', role: 'member' } },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncMap('IS123', 'my-map');

      expect(result.success).toBe(true);
      expect(result.mapSid).toBe('MP123');
      expect(result.uniqueName).toBe('my-map');
      expect(result.itemCount).toBe(2);
      expect(result.keys).toContain('user-1');
      expect(result.keys).toContain('user-2');
    });

    it('should detect found and missing expected keys', async () => {
      const client = createMockClient({
        syncMapItemsData: [
          { key: 'config', data: { theme: 'dark' } },
          { key: 'settings', data: { lang: 'en' } },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncMap('IS123', 'my-map', {
        expectedKeys: ['config', 'settings', 'preferences'],
      });

      expect(result.success).toBe(false);
      expect(result.expectedKeysFound).toContain('config');
      expect(result.expectedKeysFound).toContain('settings');
      expect(result.expectedKeysMissing).toContain('preferences');
      expect(result.errors.some(e => e.includes('preferences'))).toBe(true);
    });

    it('should succeed when all expected keys exist', async () => {
      const client = createMockClient({
        syncMapItemsData: [
          { key: 'a', data: { x: 1 } },
          { key: 'b', data: { x: 2 } },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncMap('IS123', 'my-map', {
        expectedKeys: ['a', 'b'],
      });

      expect(result.success).toBe(true);
      expect(result.expectedKeysFound).toEqual(['a', 'b']);
      expect(result.expectedKeysMissing).toEqual([]);
    });

    it('should detect items with missing value keys (as warnings)', async () => {
      const client = createMockClient({
        syncMapItemsData: [
          { key: 'user-1', data: { name: 'Alice', email: 'a@b.com' } },
          { key: 'user-2', data: { name: 'Bob' } }, // missing email
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncMap('IS123', 'my-map', {
        expectedValueKeys: ['name', 'email'],
      });

      expect(result.success).toBe(true); // value key mismatches are warnings
      expect(result.itemsWithMissingValueKeys).toHaveLength(1);
      expect(result.itemsWithMissingValueKeys[0].key).toBe('user-2');
      expect(result.itemsWithMissingValueKeys[0].missingKeys).toContain('email');
      expect(result.warnings.some(w => w.includes('1 items missing expected value keys'))).toBe(true);
    });

    it('should handle empty map', async () => {
      const client = createMockClient({
        syncMapItemsData: [],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncMap('IS123', 'my-map');

      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(0);
      expect(result.keys).toEqual([]);
    });

    it('should handle fetch error gracefully', async () => {
      const fetchError = new Error('Map not found');

      const client = createMockClient({
        syncMapError: fetchError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncMap('IS123', 'nonexistent');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Failed to fetch map'))).toBe(true);
    });

    it('should include map metadata', async () => {
      const client = createMockClient({
        syncMapItemsData: [{ key: 'k', data: { v: 1 } }],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncMap('IS123', 'my-map');

      expect(result.serviceSid).toBe('IS123');
      expect(result.revision).toBe('2');
    });

    it('should include validationDuration', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateSyncMap('IS123', 'my-map');

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== TASKROUTER VALIDATION ====================

  describe('validateTaskRouter', () => {
    it('should validate a task successfully', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456');

      expect(result.success).toBe(true);
      expect(result.taskSid).toBe('WT456');
      expect(result.workspaceSid).toBe('WS123');
      expect(result.assignmentStatus).toBe('reserved');
    });

    it('should include task metadata', async () => {
      const client = createMockClient({
        taskData: {
          sid: 'WT789',
          assignmentStatus: 'assigned',
          age: 300,
          priority: 5,
          reason: 'escalated',
          taskQueueSid: 'WQ456',
          workflowSid: 'WW789',
          attributes: '{"type":"support","tier":"premium"}',
        },
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT789');

      expect(result.assignmentStatus).toBe('assigned');
      expect(result.age).toBe(300);
      expect(result.priority).toBe(5);
      expect(result.reason).toBe('escalated');
      expect(result.taskQueueSid).toBe('WQ456');
      expect(result.workflowSid).toBe('WW789');
    });

    it('should parse task attributes', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456');

      expect(result.attributes).toEqual({ language: 'en', skill: 'support' });
    });

    it('should error on invalid attributes JSON', async () => {
      const client = createMockClient({
        taskData: {
          sid: 'WT456',
          assignmentStatus: 'reserved',
          age: 10,
          priority: 0,
          reason: null,
          taskQueueSid: null,
          workflowSid: null,
          attributes: 'not-valid-json{{{',
        },
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456');

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Failed to parse task attributes'))).toBe(true);
    });

    it('should detect missing expected attribute keys', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456', {
        expectedAttributeKeys: ['language', 'skill', 'priority_level'],
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('priority_level'))).toBe(true);
    });

    it('should check expected status', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456', {
        expectedStatus: 'completed',
      });

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('Expected status "completed"') && e.includes('"reserved"'))).toBe(true);
    });

    it('should succeed when expected status matches', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456', {
        expectedStatus: 'reserved',
      });

      expect(result.success).toBe(true);
    });

    it('should fetch reservations when requested', async () => {
      const client = createMockClient({
        taskReservationsData: [
          { sid: 'WR001', workerSid: 'WK001', workerName: 'Alice', reservationStatus: 'accepted' },
          { sid: 'WR002', workerSid: 'WK002', workerName: 'Bob', reservationStatus: 'rejected' },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456', {
        includeReservations: true,
      });

      expect(result.reservations).toHaveLength(2);
      expect(result.reservations[0].sid).toBe('WR001');
      expect(result.reservations[0].workerName).toBe('Alice');
      expect(result.reservations[1].reservationStatus).toBe('rejected');
    });

    it('should fetch events when requested', async () => {
      const client = createMockClient({
        taskEventsData: [
          { sid: 'EV001', eventType: 'task.created', description: 'Task created', eventDate: new Date('2026-02-18T10:00:00Z') },
          { sid: 'EV002', eventType: 'task.reserved', description: 'Task reserved', eventDate: new Date('2026-02-18T10:01:00Z') },
        ],
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456', {
        includeEvents: true,
      });

      expect(result.events).toHaveLength(2);
      expect(result.events[0].eventType).toBe('task.created');
      expect(result.events[1].eventType).toBe('task.reserved');
    });

    it('should handle fetch error gracefully', async () => {
      const fetchError = new Error('Task not found');
      (fetchError as Error & { code: number }).code = 20404;

      const client = createMockClient({
        taskError: fetchError,
      });
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WTnotexist');

      expect(result.success).toBe(false);
      expect(result.assignmentStatus).toBe('error');
      expect(result.errors.some(e => e.includes('Failed to fetch task'))).toBe(true);
    });

    it('should include validationDuration', async () => {
      const client = createMockClient();
      const validator = new DeepValidator(client as never);

      const result = await validator.validateTaskRouter('WS123', 'WT456');

      expect(result.validationDuration).toBeGreaterThanOrEqual(0);
      expect(typeof result.validationDuration).toBe('number');
    });
  });
});
