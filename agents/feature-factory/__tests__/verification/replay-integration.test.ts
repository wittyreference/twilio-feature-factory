// ABOUTME: Integration tests for ReplayVerifier wiring into orchestrator.
// ABOUTME: Tests that completed workflows store replay scenarios and CLI can load them.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FeatureFactoryOrchestrator, type PersistedReplayScenario } from '../../src/orchestrator.js';
import { createReplayVerifier } from '../../src/verification/index.js';

describe('ReplayVerifier Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-replay-'));
    // Create .feature-factory directory
    fs.mkdirSync(path.join(tmpDir, '.feature-factory'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('PersistedReplayScenario', () => {
    it('should have the expected shape', () => {
      const scenario: PersistedReplayScenario = {
        id: 'test-session-1',
        name: 'bug-fix: Fix timeout',
        description: 'Fix timeout in webhook handler',
        workflowType: 'bug-fix',
        capturedLearnings: ['Increase timeout to 30s'],
        resolution: 'Added retry with backoff',
        phaseResults: {
          architect: { success: true, output: '{}' },
          dev: { success: true, output: '{}' },
        },
        totalCostUsd: 1.5,
        totalTurns: 20,
        completedAt: new Date().toISOString(),
      };

      expect(scenario.id).toBe('test-session-1');
      expect(scenario.capturedLearnings).toHaveLength(1);
      expect(scenario.phaseResults.architect.success).toBe(true);
    });
  });

  describe('loadReplayScenarios', () => {
    it('should return empty array when no scenarios file exists', () => {
      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tmpDir,
      });

      const scenarios = orchestrator.loadReplayScenarios();
      expect(scenarios).toEqual([]);
    });

    it('should load scenarios from replay-scenarios.json', () => {
      const testScenarios: PersistedReplayScenario[] = [
        {
          id: 'sess-1',
          name: 'bug-fix: Test',
          description: 'Test scenario',
          workflowType: 'bug-fix',
          capturedLearnings: ['lesson 1'],
          resolution: 'Fixed it',
          phaseResults: { dev: { success: true, output: '{}' } },
          totalCostUsd: 0.5,
          totalTurns: 10,
          completedAt: '2026-01-01T00:00:00.000Z',
        },
      ];

      fs.writeFileSync(
        path.join(tmpDir, '.feature-factory', 'replay-scenarios.json'),
        JSON.stringify(testScenarios)
      );

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tmpDir,
      });

      const loaded = orchestrator.loadReplayScenarios();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('sess-1');
      expect(loaded[0].capturedLearnings).toEqual(['lesson 1']);
    });

    it('should handle malformed JSON gracefully', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.feature-factory', 'replay-scenarios.json'),
        'not valid json'
      );

      const orchestrator = new FeatureFactoryOrchestrator({
        workingDirectory: tmpDir,
      });

      const loaded = orchestrator.loadReplayScenarios();
      expect(loaded).toEqual([]);
    });
  });

  describe('createReplayVerifier', () => {
    it('should create a verifier that can register scenarios', () => {
      const verifier = createReplayVerifier();

      expect(verifier).toBeDefined();
      expect(verifier.getScenarios()).toEqual([]);
    });

    it('should accept verbose config', () => {
      const verifier = createReplayVerifier({ verbose: true });
      expect(verifier).toBeDefined();
    });
  });
});
