// ABOUTME: Unit tests for autonomous mode functionality.
// ABOUTME: Tests warning display, acknowledgment, config handling, and session summary.

import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import {
  displayAutonomousWarning,
  ACKNOWLEDGMENT_PHRASE,
  requireAcknowledgment,
  generateSessionSummary,
  createAuditLogger,
  isAutonomousCICD,
} from '../../src/autonomous.js';
import {
  createConfig,
  validateConfig,
  configFromEnv,
  isAutonomousMode,
} from '../../src/config.js';
import type { WorkflowState, AutonomousModeConfig } from '../../src/types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Autonomous Mode', () => {
  describe('Config', () => {
    it('should default to autonomous mode disabled', () => {
      const config = createConfig();
      expect(config.autonomousMode.enabled).toBe(false);
      expect(config.autonomousMode.acknowledged).toBe(false);
    });

    it('should set elevated-but-finite defaults when autonomous mode is enabled and acknowledged', () => {
      const config = createConfig({
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'interactive',
          acknowledgedAt: new Date(),
        },
      });

      expect(config.approvalMode).toBe('none');
      expect(config.maxBudgetUsd).toBe(50.0);
      expect(config.maxTurnsPerAgent).toBe(200);
      expect(config.maxDurationMsPerAgent).toBe(600000);      // 10 min
      expect(config.maxDurationMsPerWorkflow).toBe(3600000);   // 60 min
    });

    it('should NOT override limits when enabled but not acknowledged', () => {
      const config = createConfig({
        maxBudgetUsd: 5.0,
        maxTurnsPerAgent: 50,
        autonomousMode: {
          enabled: true,
          acknowledged: false,
          acknowledgedVia: null,
          acknowledgedAt: null,
        },
      });

      // Should keep original values since not acknowledged
      expect(config.maxBudgetUsd).toBe(5.0);
      expect(config.maxTurnsPerAgent).toBe(50);
    });

    it('should throw validation error when enabled but not acknowledged', () => {
      const config = createConfig({
        autonomousMode: {
          enabled: true,
          acknowledged: false,
          acknowledgedVia: null,
          acknowledgedAt: null,
        },
      });

      expect(() => validateConfig(config)).toThrow('not acknowledged');
    });

    it('should pass validation when enabled and acknowledged', () => {
      const config = createConfig({
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'interactive',
          acknowledgedAt: new Date(),
        },
      });

      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should pass validation with safety floor defaults', () => {
      const config = createConfig({
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'interactive',
          acknowledgedAt: new Date(),
        },
      });

      expect(config.maxBudgetUsd).toBe(50.0);
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should preserve explicit Infinity budget when user passes it', () => {
      const config = createConfig({
        maxBudgetUsd: Infinity,
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'interactive',
          acknowledgedAt: new Date(),
        },
      });

      expect(config.maxBudgetUsd).toBe(Infinity);
      // Infinity > 0 is true, so validation still passes
      expect(() => validateConfig(config)).not.toThrow();
    });

    it('should preserve user-provided maxBudgetUsd in autonomous mode', () => {
      const config = createConfig({
        maxBudgetUsd: 10.0,
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'interactive',
          acknowledgedAt: new Date(),
        },
      });

      // User explicitly set $10, should NOT be overridden to $50
      expect(config.maxBudgetUsd).toBe(10.0);
    });

    it('should preserve user-provided maxTurnsPerAgent in autonomous mode', () => {
      const config = createConfig({
        maxTurnsPerAgent: 100,
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'interactive',
          acknowledgedAt: new Date(),
        },
      });

      // User explicitly set 100, should NOT be overridden to 200
      expect(config.maxTurnsPerAgent).toBe(100);
    });

    it('should set default time limits in normal mode', () => {
      const config = createConfig();

      expect(config.maxDurationMsPerAgent).toBe(5 * 60 * 1000);    // 5 min
      expect(config.maxDurationMsPerWorkflow).toBe(30 * 60 * 1000); // 30 min
    });

    it('should elevate time limits in autonomous mode', () => {
      const config = createConfig({
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'interactive',
          acknowledgedAt: new Date(),
        },
      });

      expect(config.maxDurationMsPerAgent).toBe(10 * 60 * 1000);   // 10 min
      expect(config.maxDurationMsPerWorkflow).toBe(60 * 60 * 1000); // 60 min
    });

    it('should reject zero or negative time limits', () => {
      expect(() => validateConfig(createConfig({ maxDurationMsPerAgent: 0 }))).toThrow(
        'maxDurationMsPerAgent must be greater than 0'
      );
      expect(() => validateConfig(createConfig({ maxDurationMsPerAgent: -1 }))).toThrow(
        'maxDurationMsPerAgent must be greater than 0'
      );
      expect(() => validateConfig(createConfig({ maxDurationMsPerWorkflow: 0 }))).toThrow(
        'maxDurationMsPerWorkflow must be greater than 0'
      );
    });
  });

  describe('Environment Variables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should detect autonomous mode from environment', () => {
      process.env.FEATURE_FACTORY_AUTONOMOUS = 'true';
      process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED = 'true';

      const config = configFromEnv();
      expect(config.autonomousMode?.enabled).toBe(true);
      expect(config.autonomousMode?.acknowledged).toBe(true);
      expect(config.autonomousMode?.acknowledgedVia).toBe('environment');
    });

    it('should NOT acknowledge when only enabled', () => {
      process.env.FEATURE_FACTORY_AUTONOMOUS = 'true';
      delete process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED;

      const config = configFromEnv();
      expect(config.autonomousMode?.enabled).toBe(true);
      expect(config.autonomousMode?.acknowledged).toBe(false);
    });

    it('should report CI/CD autonomous mode correctly', () => {
      process.env.FEATURE_FACTORY_AUTONOMOUS = 'true';
      process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED = 'true';

      expect(isAutonomousCICD()).toBe(true);
    });

    it('should NOT report CI/CD when not fully set', () => {
      delete process.env.FEATURE_FACTORY_AUTONOMOUS;
      delete process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED;

      expect(isAutonomousCICD()).toBe(false);
    });

    it('should resolve requireAcknowledgment() via env vars without readline', async () => {
      process.env.FEATURE_FACTORY_AUTONOMOUS = 'true';
      process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED = 'true';

      const result = await requireAcknowledgment();

      expect(result.enabled).toBe(true);
      expect(result.acknowledged).toBe(true);
      expect(result.acknowledgedVia).toBe('environment');
      expect(result.acknowledgedAt).toBeInstanceOf(Date);
    });

    it('should read FEATURE_FACTORY_MAX_DURATION_PER_AGENT from environment', () => {
      process.env.FEATURE_FACTORY_MAX_DURATION_PER_AGENT = '600000';

      const config = configFromEnv();
      expect(config.maxDurationMsPerAgent).toBe(600000);
    });

    it('should read FEATURE_FACTORY_MAX_DURATION_PER_WORKFLOW from environment', () => {
      process.env.FEATURE_FACTORY_MAX_DURATION_PER_WORKFLOW = '3600000';

      const config = configFromEnv();
      expect(config.maxDurationMsPerWorkflow).toBe(3600000);
    });
  });

  describe('isAutonomousMode helper', () => {
    it('should return true when enabled and acknowledged', () => {
      const config = createConfig({
        autonomousMode: {
          enabled: true,
          acknowledged: true,
          acknowledgedVia: 'interactive',
          acknowledgedAt: new Date(),
        },
      });

      expect(isAutonomousMode(config)).toBe(true);
    });

    it('should return false when only enabled', () => {
      const config = createConfig({
        autonomousMode: {
          enabled: true,
          acknowledged: false,
          acknowledgedVia: null,
          acknowledgedAt: null,
        },
      });

      expect(isAutonomousMode(config)).toBe(false);
    });

    it('should return false when disabled', () => {
      const config = createConfig();
      expect(isAutonomousMode(config)).toBe(false);
    });
  });

  describe('Warning Display', () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should display warning without crashing', () => {
      expect(() => displayAutonomousWarning()).not.toThrow();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should mention key warnings', () => {
      displayAutonomousWarning();

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('AUTONOMOUS MODE WARNING');
      expect(output).toContain('REAL MONEY');
      expect(output).toContain('REAL HUMANS');
      expect(output).toContain('COMPLIANCE');
    });

    it('should list quality gates still enforced', () => {
      displayAutonomousWarning();

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('TDD');
      expect(output).toContain('Linting');
      expect(output).toContain('Coverage');
      expect(output).toContain('Credential safety');
    });
  });

  describe('Acknowledgment Phrase', () => {
    it('should be a specific phrase', () => {
      expect(ACKNOWLEDGMENT_PHRASE).toBe('I ACKNOWLEDGE THE RISKS');
    });

    it('should be all uppercase', () => {
      expect(ACKNOWLEDGMENT_PHRASE).toBe(ACKNOWLEDGMENT_PHRASE.toUpperCase());
    });
  });

  describe('Session Summary', () => {
    const mockState: WorkflowState = {
      sessionId: 'test-session-123',
      workflow: 'new-feature',
      description: 'Test feature',
      currentPhaseIndex: 6,
      status: 'completed',
      phaseResults: {
        'qa': {
          agent: 'qa',
          success: true,
          output: {
            unitTestsPassed: 25,
            unitTestsTotal: 25,
            integrationTestsPassed: 5,
            integrationTestsTotal: 5,
            coveragePercent: 87,
            lintClean: true,
          },
          filesCreated: ['test.ts'],
          filesModified: [],
          commits: [],
          costUsd: 0.5,
          turnsUsed: 10,
        },
      },
      totalCostUsd: 2.5,
      totalTurns: 50,
      startedAt: new Date(),
    };

    it('should generate summary with correct session ID', () => {
      const summary = generateSessionSummary(
        mockState,
        new Date(Date.now() - 60000), // 1 minute ago
        ['new-file.ts'],
        ['modified-file.ts'],
        '/tmp/audit.log'
      );

      expect(summary.sessionId).toBe('test-session-123');
    });

    it('should calculate duration', () => {
      const startTime = new Date(Date.now() - 120000); // 2 minutes ago
      const summary = generateSessionSummary(
        mockState,
        startTime,
        [],
        [],
        '/tmp/audit.log'
      );

      expect(summary.durationMs).toBeGreaterThanOrEqual(120000);
      expect(summary.durationMs).toBeLessThan(121000);
    });

    it('should extract test results from QA phase', () => {
      const summary = generateSessionSummary(
        mockState,
        new Date(),
        [],
        [],
        '/tmp/audit.log'
      );

      expect(summary.testResults.unitTestsPassed).toBe(25);
      expect(summary.testResults.unitTestsTotal).toBe(25);
      expect(summary.testResults.coveragePercent).toBe(87);
      expect(summary.testResults.lintClean).toBe(true);
    });

    it('should track files created and modified', () => {
      const summary = generateSessionSummary(
        mockState,
        new Date(),
        ['file1.ts', 'file2.ts'],
        ['file3.ts'],
        '/tmp/audit.log'
      );

      expect(summary.filesCreated).toEqual(['file1.ts', 'file2.ts']);
      expect(summary.filesModified).toEqual(['file3.ts']);
    });

    it('should include audit log path', () => {
      const summary = generateSessionSummary(
        mockState,
        new Date(),
        [],
        [],
        '/custom/path/audit.log'
      );

      expect(summary.auditLogPath).toBe('/custom/path/audit.log');
    });
  });

  describe('Audit Logger', () => {
    it('should return a valid path', async () => {
      // Just test that we get a reasonable path structure
      const originalCwd = process.cwd();
      const testDir = '/tmp/feature-factory-audit-test-' + Date.now();
      fs.mkdirSync(testDir, { recursive: true });

      try {
        process.chdir(testDir);
        const logger = createAuditLogger('test-session');
        const logPath = logger.getPath();

        expect(logPath).toContain('.feature-factory');
        expect(logPath).toContain('autonomous-test-session.log');
        logger.close();
        // Wait for stream to fully close
        await new Promise(resolve => setTimeout(resolve, 50));
      } finally {
        process.chdir(originalCwd);
        // Allow more time for cleanup
        await new Promise(resolve => setTimeout(resolve, 50));
        try {
          fs.rmSync(testDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should have log and close methods', async () => {
      const originalCwd = process.cwd();
      const testDir = '/tmp/feature-factory-audit-test-' + Date.now();
      fs.mkdirSync(testDir, { recursive: true });

      try {
        process.chdir(testDir);
        const logger = createAuditLogger('test-session');

        expect(typeof logger.log).toBe('function');
        expect(typeof logger.close).toBe('function');
        expect(typeof logger.getPath).toBe('function');
        logger.close();
        // Wait for stream to fully close
        await new Promise(resolve => setTimeout(resolve, 50));
      } finally {
        process.chdir(originalCwd);
        // Allow more time for cleanup
        await new Promise(resolve => setTimeout(resolve, 50));
        try {
          fs.rmSync(testDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  });
});
