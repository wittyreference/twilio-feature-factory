// ABOUTME: Unit tests for DeepValidator, focusing on conference validation.
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
});
