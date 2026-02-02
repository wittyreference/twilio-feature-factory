// ABOUTME: Unit tests for DiagnosticBridge, LearningCaptureEngine, and PatternTracker.
// ABOUTME: Tests the validation failure analysis, learning capture, and pattern tracking.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import {
  DiagnosticBridge,
  createDiagnosticBridge,
  type Diagnosis,
  type RootCauseCategory,
} from '../src/validation/diagnostic-bridge';
import {
  LearningCaptureEngine,
  createLearningCaptureEngine,
  formatLearningEntry,
  formatLearningMarkdown,
  type LearningEntry,
} from '../src/validation/learning-capture';
import {
  PatternTracker,
  createPatternTracker,
} from '../src/validation/pattern-tracker';
import type { ValidationResult } from '../src/validation/deep-validator';

/**
 * Creates a mock validation result for testing.
 */
function createMockValidationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  const defaultResult: ValidationResult = {
    success: false,
    resourceSid: 'SM1234567890abcdef1234567890abcdef',
    resourceType: 'message',
    primaryStatus: 'failed',
    checks: {
      resourceStatus: { passed: false, message: 'Message failed', data: { status: 'failed', errorCode: 30003 } },
      debuggerAlerts: { passed: true, message: 'No alerts', data: [] },
    },
    errors: ['Message delivery failed'],
    warnings: [],
    duration: 150,
  };

  return { ...defaultResult, ...overrides };
}

describe('DiagnosticBridge', () => {
  let bridge: DiagnosticBridge;

  beforeEach(() => {
    bridge = new DiagnosticBridge();
  });

  describe('constructor and configuration', () => {
    it('should create with default configuration', () => {
      const config = bridge.getConfig();

      expect(config.autoCaptureEnabled).toBe(true);
      expect(config.autoSuggestEnabled).toBe(true);
      expect(config.patternTrackingEnabled).toBe(true);
      expect(config.learningsPath).toBe('.claude/learnings.md');
      expect(config.patternDbPath).toBe('.claude/pattern-db.json');
    });

    it('should accept custom configuration', () => {
      const customBridge = new DiagnosticBridge({
        autoCaptureEnabled: false,
        autoSuggestEnabled: false,
        patternTrackingEnabled: false,
        learningsPath: 'custom/learnings.md',
        patternDbPath: 'custom/patterns.json',
      });

      const config = customBridge.getConfig();
      expect(config.autoCaptureEnabled).toBe(false);
      expect(config.autoSuggestEnabled).toBe(false);
      expect(config.learningsPath).toBe('custom/learnings.md');
    });
  });

  describe('analyze()', () => {
    it('should throw error for successful validations', () => {
      const successResult = createMockValidationResult({ success: true });

      expect(() => bridge.analyze(successResult)).toThrow(
        'DiagnosticBridge.analyze() should only be called for failed validations'
      );
    });

    it('should produce a structured Diagnosis', () => {
      const result = createMockValidationResult();

      const diagnosis = bridge.analyze(result);

      expect(diagnosis.patternId).toMatch(/^PAT-[0-9a-f]{8}$/);
      expect(diagnosis.summary).toContain('Message validation failed');
      expect(diagnosis.rootCause).toBeDefined();
      expect(diagnosis.rootCause.category).toBeDefined();
      expect(diagnosis.rootCause.confidence).toBeGreaterThan(0);
      expect(diagnosis.evidence).toBeInstanceOf(Array);
      expect(diagnosis.suggestedFixes).toBeInstanceOf(Array);
      expect(diagnosis.validationResult).toBe(result);
      expect(diagnosis.timestamp).toBeInstanceOf(Date);
    });

    it('should classify configuration errors correctly', () => {
      const result = createMockValidationResult({
        checks: {
          resourceStatus: { passed: false, message: 'Not found', data: { errorCode: '20404' } },
          debuggerAlerts: { passed: true, message: 'No alerts', data: [{ errorCode: '20404' }] },
        },
      });

      const diagnosis = bridge.analyze(result);

      expect(diagnosis.rootCause.category).toBe('configuration');
      expect(diagnosis.rootCause.description).toContain('20404');
    });

    it('should classify external/carrier errors correctly', () => {
      const result = createMockValidationResult({
        primaryStatus: 'undelivered',
        checks: {
          resourceStatus: { passed: false, message: 'Undelivered', data: { status: 'undelivered', errorCode: 30003 } },
          debuggerAlerts: { passed: true, message: 'No alerts', data: [{ errorCode: '30003' }] },
        },
      });

      const diagnosis = bridge.analyze(result);

      expect(diagnosis.rootCause.category).toBe('external');
    });

    it('should classify code/TwiML errors correctly', () => {
      const result = createMockValidationResult({
        resourceType: 'call',
        checks: {
          resourceStatus: { passed: false, message: 'Failed', data: {} },
          debuggerAlerts: { passed: false, message: 'HTTP error', data: [{ errorCode: '11200' }] },
        },
      });

      const diagnosis = bridge.analyze(result);

      expect(diagnosis.rootCause.category).toBe('code');
      expect(diagnosis.rootCause.description).toContain('11200');
    });

    it('should classify timing issues correctly', () => {
      const result = createMockValidationResult({
        primaryStatus: 'pending', // Use pending status to avoid matching 'failed' -> 'code'
        errors: ['Insights data not yet available'],
        checks: {
          resourceStatus: { passed: true, message: 'OK', data: {} },
          debuggerAlerts: { passed: true, message: 'No alerts', data: [] },
        },
      });

      const diagnosis = bridge.analyze(result);

      expect(diagnosis.rootCause.category).toBe('timing');
    });

    it('should extract evidence from failed checks', () => {
      const result = createMockValidationResult({
        checks: {
          resourceStatus: { passed: false, message: 'Failed', data: { status: 'failed' } },
          debuggerAlerts: { passed: false, message: 'Has alerts', data: [{ sid: 'NO123' }] },
          syncCallbacks: { passed: true, message: 'OK', data: { received: true } },
        },
      });

      const diagnosis = bridge.analyze(result);

      // Failed checks should be primary evidence
      const primaryEvidence = diagnosis.evidence.filter(e => e.relevance === 'primary');
      expect(primaryEvidence.length).toBe(2);

      // Passed checks with data should be supporting evidence
      const supportingEvidence = diagnosis.evidence.filter(e => e.relevance === 'supporting');
      expect(supportingEvidence.length).toBe(1);
    });

    it('should generate fix suggestions when enabled', () => {
      const result = createMockValidationResult({
        checks: {
          resourceStatus: { passed: false, message: 'Failed', data: { errorCode: '21211' } },
          debuggerAlerts: { passed: true, message: 'No alerts', data: [{ errorCode: '21211' }] },
        },
      });

      const diagnosis = bridge.analyze(result);

      expect(diagnosis.suggestedFixes.length).toBeGreaterThan(0);
      // Should include phone number format fix
      expect(diagnosis.suggestedFixes.some(f => f.description.includes('E.164'))).toBe(true);
    });

    it('should not generate fix suggestions when disabled', () => {
      const customBridge = new DiagnosticBridge({ autoSuggestEnabled: false });
      const result = createMockValidationResult();

      const diagnosis = customBridge.analyze(result);

      expect(diagnosis.suggestedFixes).toHaveLength(0);
    });

    it('should track patterns across analyses', () => {
      const result = createMockValidationResult();

      // First analysis
      const diagnosis1 = bridge.analyze(result);
      expect(diagnosis1.isKnownPattern).toBe(false);
      expect(diagnosis1.previousOccurrences).toBe(0);

      // Second analysis with same pattern
      const diagnosis2 = bridge.analyze(result);
      expect(diagnosis2.isKnownPattern).toBe(true);
      expect(diagnosis2.previousOccurrences).toBe(1);

      // Third analysis
      const diagnosis3 = bridge.analyze(result);
      expect(diagnosis3.previousOccurrences).toBe(2);
    });

    it('should not track patterns when disabled', () => {
      const customBridge = new DiagnosticBridge({ patternTrackingEnabled: false });
      const result = createMockValidationResult();

      customBridge.analyze(result);
      const diagnosis2 = customBridge.analyze(result);

      expect(diagnosis2.isKnownPattern).toBe(false);
    });

    it('should generate consistent pattern IDs for same failure type', () => {
      const result1 = createMockValidationResult({ resourceSid: 'SM111' });
      const result2 = createMockValidationResult({ resourceSid: 'SM222' });

      const diagnosis1 = bridge.analyze(result1);
      const diagnosis2 = bridge.analyze(result2);

      // Same failure pattern should produce same pattern ID
      expect(diagnosis1.patternId).toBe(diagnosis2.patternId);
    });

    it('should generate different pattern IDs for different failure types', () => {
      const result1 = createMockValidationResult({ primaryStatus: 'failed' });
      const result2 = createMockValidationResult({ primaryStatus: 'undelivered' });

      const diagnosis1 = bridge.analyze(result1);
      bridge.clearPatternCache(); // Clear cache to avoid pattern tracking interference
      const diagnosis2 = bridge.analyze(result2);

      expect(diagnosis1.patternId).not.toBe(diagnosis2.patternId);
    });
  });

  describe('getPatternStats()', () => {
    it('should return empty stats initially', () => {
      const stats = bridge.getPatternStats();

      expect(stats.totalPatterns).toBe(0);
      expect(stats.frequentPatterns).toHaveLength(0);
    });

    it('should track patterns after analysis', () => {
      const result = createMockValidationResult();
      bridge.analyze(result);
      bridge.analyze(result);
      bridge.analyze(result);

      const stats = bridge.getPatternStats();

      expect(stats.totalPatterns).toBe(1);
      expect(stats.frequentPatterns).toHaveLength(1);
      expect(stats.frequentPatterns[0].count).toBe(3);
    });

    it('should sort patterns by frequency', () => {
      const result1 = createMockValidationResult({ primaryStatus: 'failed' });
      const result2 = createMockValidationResult({ primaryStatus: 'undelivered' });

      // Analyze result2 more times
      bridge.analyze(result1);
      bridge.analyze(result2);
      bridge.analyze(result2);
      bridge.analyze(result2);

      const stats = bridge.getPatternStats();

      expect(stats.totalPatterns).toBe(2);
      expect(stats.frequentPatterns[0].count).toBe(3); // result2 appeared more
    });
  });

  describe('clearPatternCache()', () => {
    it('should clear all tracked patterns', () => {
      const result = createMockValidationResult();
      bridge.analyze(result);

      bridge.clearPatternCache();

      const stats = bridge.getPatternStats();
      expect(stats.totalPatterns).toBe(0);
    });
  });

  describe('createDiagnosticBridge()', () => {
    it('should create a DiagnosticBridge instance', () => {
      const instance = createDiagnosticBridge();

      expect(instance).toBeInstanceOf(DiagnosticBridge);
    });

    it('should accept configuration', () => {
      const instance = createDiagnosticBridge({ autoSuggestEnabled: false });

      expect(instance.getConfig().autoSuggestEnabled).toBe(false);
    });
  });
});

describe('LearningCaptureEngine', () => {
  let tempDir: string;
  let engine: LearningCaptureEngine;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-capture-test-'));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    engine = new LearningCaptureEngine(tempDir, {
      sessionId: 'test-session-123',
      date: new Date('2026-02-01T12:00:00Z'),
    });
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('constructor and configuration', () => {
    it('should use .claude/learnings.md by default', () => {
      expect(engine.getLearningsPath()).toBe(path.join(tempDir, '.claude', 'learnings.md'));
    });

    it('should use .meta/learnings.md when .meta exists', () => {
      const metaDir = path.join(tempDir, '.meta');
      fs.mkdirSync(metaDir, { recursive: true });

      const metaEngine = new LearningCaptureEngine(tempDir);

      expect(metaEngine.getLearningsPath()).toBe(path.join(tempDir, '.meta', 'learnings.md'));
    });

    it('should accept custom learnings path', () => {
      const customEngine = new LearningCaptureEngine(tempDir, {
        learningsPath: path.join(tempDir, 'custom', 'learnings.md'),
      });

      expect(customEngine.getLearningsPath()).toBe(path.join(tempDir, 'custom', 'learnings.md'));
    });

    it('should return session ID', () => {
      expect(engine.getSessionId()).toBe('test-session-123');
    });
  });

  describe('capture()', () => {
    function createMockDiagnosis(): Diagnosis {
      return {
        patternId: 'PAT-abc12345',
        summary: 'Message validation failed. Status: failed. Root cause: carrier issue',
        rootCause: {
          category: 'external',
          description: 'Carrier rejected message',
          confidence: 0.9,
        },
        evidence: [
          { source: 'resourceStatus', data: { status: 'failed' }, relevance: 'primary' },
        ],
        suggestedFixes: [
          {
            description: 'Wait and retry',
            actionType: 'wait',
            confidence: 0.7,
            automated: true,
            steps: ['Wait 30 seconds', 'Retry'],
          },
        ],
        isKnownPattern: false,
        previousOccurrences: 0,
        validationResult: createMockValidationResult(),
        timestamp: new Date('2026-02-01T12:00:00Z'),
      };
    }

    it('should capture learning to file', async () => {
      const diagnosis = createMockDiagnosis();

      await engine.capture(diagnosis);

      const content = engine.readLearnings();
      expect(content).toContain('PAT-abc12345');
      expect(content).toContain('Message validation failed');
    });

    it('should return LearningEntry', async () => {
      const diagnosis = createMockDiagnosis();

      const entry = await engine.capture(diagnosis);

      expect(entry.patternId).toBe('PAT-abc12345');
      expect(entry.sessionId).toBe('test-session-123');
      expect(entry.title).toBe(diagnosis.summary);
      expect(entry.promoted).toBe(false);
    });

    it('should append to existing learnings', async () => {
      const diagnosis1 = createMockDiagnosis();
      const diagnosis2 = { ...createMockDiagnosis(), patternId: 'PAT-def67890' };

      await engine.capture(diagnosis1);
      await engine.capture(diagnosis2);

      const content = engine.readLearnings();
      expect(content).toContain('PAT-abc12345');
      expect(content).toContain('PAT-def67890');
    });

    it('should create session header', async () => {
      const diagnosis = createMockDiagnosis();

      await engine.capture(diagnosis);

      const content = engine.readLearnings();
      expect(content).toContain('[2026-02-01] test-session-123');
      expect(content).toContain('Validation Learnings');
    });

    it('should create directory if it does not exist', async () => {
      const newEngine = new LearningCaptureEngine(tempDir, {
        learningsPath: path.join(tempDir, 'new', 'dir', 'learnings.md'),
      });
      const diagnosis = createMockDiagnosis();

      await newEngine.capture(diagnosis);

      expect(fs.existsSync(path.join(tempDir, 'new', 'dir', 'learnings.md'))).toBe(true);
    });
  });

  describe('captureAll()', () => {
    it('should capture multiple diagnoses', async () => {
      const diagnoses = [
        {
          ...createMockDiagnosis(),
          patternId: 'PAT-111',
        },
        {
          ...createMockDiagnosis(),
          patternId: 'PAT-222',
        },
      ];

      const entries = await engine.captureAll(diagnoses);

      expect(entries).toHaveLength(2);
      expect(entries[0].patternId).toBe('PAT-111');
      expect(entries[1].patternId).toBe('PAT-222');
    });

    function createMockDiagnosis(): Diagnosis {
      return {
        patternId: 'PAT-test',
        summary: 'Test summary',
        rootCause: { category: 'code', description: 'Test error', confidence: 0.8 },
        evidence: [],
        suggestedFixes: [],
        isKnownPattern: false,
        previousOccurrences: 0,
        validationResult: createMockValidationResult(),
        timestamp: new Date(),
      };
    }
  });

  describe('hasPattern()', () => {
    it('should return false when pattern not captured', () => {
      expect(engine.hasPattern('PAT-notexist')).toBe(false);
    });

    it('should return true when pattern was captured', async () => {
      const diagnosis: Diagnosis = {
        patternId: 'PAT-captured',
        summary: 'Test',
        rootCause: { category: 'code', description: 'Test', confidence: 0.8 },
        evidence: [],
        suggestedFixes: [],
        isKnownPattern: false,
        previousOccurrences: 0,
        validationResult: createMockValidationResult(),
        timestamp: new Date(),
      };

      await engine.capture(diagnosis);

      expect(engine.hasPattern('PAT-captured')).toBe(true);
    });
  });

  describe('readLearnings()', () => {
    it('should return empty string when file does not exist', () => {
      expect(engine.readLearnings()).toBe('');
    });
  });

  describe('formatLearningEntry()', () => {
    it('should format Diagnosis into LearningEntry', () => {
      const diagnosis: Diagnosis = {
        patternId: 'PAT-format',
        summary: 'Test summary',
        rootCause: { category: 'configuration', description: 'Missing config', confidence: 0.9 },
        evidence: [{ source: 'test', data: 'data', relevance: 'primary' }],
        suggestedFixes: [{ description: 'Fix it', actionType: 'config', confidence: 0.8, automated: false, steps: ['Step 1'] }],
        isKnownPattern: false,
        previousOccurrences: 0,
        validationResult: createMockValidationResult(),
        timestamp: new Date('2026-02-01T12:00:00Z'),
      };

      const entry = formatLearningEntry(diagnosis, 'session-1');

      expect(entry.patternId).toBe('PAT-format');
      expect(entry.sessionId).toBe('session-1');
      expect(entry.title).toBe('Test summary');
      expect(entry.attemptedAction).toContain('Validate message');
      expect(entry.correctApproach).toContain('Fix it');
      expect(entry.promotionTarget).toContain('CLAUDE.md');
    });
  });

  describe('formatLearningMarkdown()', () => {
    it('should format LearningEntry as markdown', () => {
      const entry: LearningEntry = {
        timestamp: new Date('2026-02-01T12:00:00Z'),
        sessionId: 'session-1',
        patternId: 'PAT-md',
        title: 'Test Learning',
        attemptedAction: 'Tried to do X',
        actualResult: 'Got Y instead',
        correctApproach: 'Should do Z',
        promotionTarget: 'CLAUDE.md',
        promoted: false,
      };

      const md = formatLearningMarkdown(entry);

      expect(md).toContain('### Test Learning');
      expect(md).toContain('**Pattern ID:** `PAT-md`');
      expect(md).toContain('**What was tried:** Tried to do X');
      expect(md).toContain('**What happened:** Got Y instead');
      expect(md).toContain('**Correct approach:** Should do Z');
      expect(md).toContain('**Promote to:** CLAUDE.md');
      expect(md).toContain('2026-02-01');
    });
  });

  describe('createLearningCaptureEngine()', () => {
    it('should create a LearningCaptureEngine instance', () => {
      const instance = createLearningCaptureEngine(tempDir);

      expect(instance).toBeInstanceOf(LearningCaptureEngine);
    });
  });
});

describe('PatternTracker', () => {
  // Each test creates its own temp directory and tracker
  const tempDirs: string[] = [];

  function createTestEnvironment(): { tempDir: string; tracker: PatternTracker; dbPath: string } {
    // Use crypto.randomUUID() for truly unique IDs
    const uniqueId = crypto.randomUUID();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pattern-tracker-test-${uniqueId.slice(0, 8)}-`));
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    const dbPath = path.join(tempDir, `.claude/pattern-db-${uniqueId}.json`);
    // Verify the tracker is using our custom path (validation)
    const tracker = new PatternTracker(tempDir, { databasePath: dbPath });
    // Verify the tracker is using our custom path
    if (tracker.getDatabasePath() !== dbPath) {
      throw new Error(`Tracker using wrong path: expected ${dbPath}, got ${tracker.getDatabasePath()}`);
    }
    tempDirs.push(tempDir);
    return { tempDir, tracker, dbPath };
  }

  afterAll(() => {
    // Clean up all temp directories
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  function createMockDiagnosis(patternId: string = 'PAT-test'): Diagnosis {
    return {
      patternId,
      summary: `Test pattern ${patternId}`,
      rootCause: { category: 'code' as RootCauseCategory, description: 'Test', confidence: 0.8 },
      evidence: [],
      suggestedFixes: [{ description: 'Fix it', actionType: 'code', confidence: 0.7, automated: false }],
      isKnownPattern: false,
      previousOccurrences: 0,
      validationResult: createMockValidationResult(),
      timestamp: new Date(),
    };
  }

  describe('constructor and configuration', () => {
    it('should use .claude/pattern-db.json by default', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pattern-tracker-test-`));
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      tempDirs.push(tempDir);
      const tracker = new PatternTracker(tempDir);

      expect(tracker.getDatabasePath()).toBe(path.join(tempDir, '.claude', 'pattern-db.json'));
    });

    it('should use .meta/pattern-db.json when .meta exists', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pattern-tracker-test-`));
      fs.mkdirSync(path.join(tempDir, '.meta'), { recursive: true });
      tempDirs.push(tempDir);
      const tracker = new PatternTracker(tempDir);

      expect(tracker.getDatabasePath()).toBe(path.join(tempDir, '.meta', 'pattern-db.json'));
    });

    it('should accept custom database path', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pattern-tracker-test-`));
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      tempDirs.push(tempDir);
      const tracker = new PatternTracker(tempDir, {
        databasePath: path.join(tempDir, 'custom', 'patterns.json'),
      });

      expect(tracker.getDatabasePath()).toBe(path.join(tempDir, 'custom', 'patterns.json'));
    });
  });

  describe('record()', () => {
    it('should record a new pattern', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-new');

      const pattern = tracker.record(diagnosis, 'session-1');

      expect(pattern.patternId).toBe('PAT-new');
      expect(pattern.occurrenceCount).toBe(1);
      expect(pattern.resolved).toBe(false);
      expect(pattern.occurrences).toHaveLength(1);
      expect(pattern.occurrences[0].sessionId).toBe('session-1');
    });

    it('should increment count for existing pattern', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-existing');

      tracker.record(diagnosis, 'session-1');
      const pattern = tracker.record(diagnosis, 'session-2');

      expect(pattern.occurrenceCount).toBe(2);
      expect(pattern.occurrences).toHaveLength(2);
    });

    it('should persist pattern to disk', () => {
      const { tempDir, dbPath } = createTestEnvironment();
      const tracker = new PatternTracker(tempDir, { databasePath: dbPath });
      const diagnosis = createMockDiagnosis('PAT-persist');

      tracker.record(diagnosis, 'session-1');

      // Create new tracker to verify persistence - use same dbPath
      const newTracker = new PatternTracker(tempDir, { databasePath: dbPath });
      const pattern = newTracker.lookup('PAT-persist');

      expect(pattern).toBeDefined();
      expect(pattern?.occurrenceCount).toBe(1);
    });

    it('should update lastSeen timestamp', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-time');

      const pattern1 = tracker.record(diagnosis, 'session-1');
      const firstSeen = pattern1.firstSeen;

      // Wait a tiny bit and record again
      const pattern2 = tracker.record(diagnosis, 'session-2');

      expect(pattern2.firstSeen.getTime()).toBe(firstSeen.getTime());
      expect(pattern2.lastSeen.getTime()).toBeGreaterThanOrEqual(pattern1.lastSeen.getTime());
    });
  });

  describe('recordFixAttempt()', () => {
    it('should record a fix attempt', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-fix');
      tracker.record(diagnosis, 'session-1');

      tracker.recordFixAttempt('PAT-fix', 'Added timeout', false);

      const pattern = tracker.lookup('PAT-fix');
      expect(pattern?.fixAttempts).toHaveLength(1);
      expect(pattern?.fixAttempts[0].fixDescription).toBe('Added timeout');
      expect(pattern?.fixAttempts[0].success).toBe(false);
    });

    it('should mark pattern as resolved on successful fix', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-resolved');
      tracker.record(diagnosis, 'session-1');

      tracker.recordFixAttempt('PAT-resolved', 'Fixed config', true);

      const pattern = tracker.lookup('PAT-resolved');
      expect(pattern?.resolved).toBe(true);
      expect(pattern?.successfulFix).toBe('Fixed config');
    });

    it('should ignore non-existent patterns', () => {
      const { tracker } = createTestEnvironment();
      expect(() => {
        tracker.recordFixAttempt('PAT-nonexistent', 'Fix', false);
      }).not.toThrow();
    });
  });

  describe('markResolved()', () => {
    it('should mark pattern as resolved', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-mark');
      tracker.record(diagnosis, 'session-1');

      tracker.markResolved('PAT-mark', 'Manual fix applied');

      const pattern = tracker.lookup('PAT-mark');
      expect(pattern?.resolved).toBe(true);
      expect(pattern?.successfulFix).toBe('Manual fix applied');
    });
  });

  describe('lookup()', () => {
    it('should return pattern by ID', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-lookup');
      tracker.record(diagnosis, 'session-1');

      const pattern = tracker.lookup('PAT-lookup');

      expect(pattern).toBeDefined();
      expect(pattern?.patternId).toBe('PAT-lookup');
    });

    it('should return undefined for unknown pattern', () => {
      const { tracker } = createTestEnvironment();
      const pattern = tracker.lookup('PAT-unknown');

      expect(pattern).toBeUndefined();
    });
  });

  describe('isKnown()', () => {
    it('should return true for known patterns', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-known');
      tracker.record(diagnosis, 'session-1');

      expect(tracker.isKnown('PAT-known')).toBe(true);
    });

    it('should return false for unknown patterns', () => {
      const { tracker } = createTestEnvironment();
      expect(tracker.isKnown('PAT-unknown')).toBe(false);
    });
  });

  describe('getOccurrenceCount()', () => {
    it('should return count for known patterns', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis = createMockDiagnosis('PAT-count');
      tracker.record(diagnosis, 'session-1');
      tracker.record(diagnosis, 'session-2');
      tracker.record(diagnosis, 'session-3');

      expect(tracker.getOccurrenceCount('PAT-count')).toBe(3);
    });

    it('should return 0 for unknown patterns', () => {
      const { tracker } = createTestEnvironment();
      expect(tracker.getOccurrenceCount('PAT-unknown')).toBe(0);
    });
  });

  describe('getAllPatterns()', () => {
    it('should return all patterns sorted by frequency', () => {
      const { tracker } = createTestEnvironment();
      tracker.record(createMockDiagnosis('PAT-a'), 'session-1');
      tracker.record(createMockDiagnosis('PAT-b'), 'session-1');
      tracker.record(createMockDiagnosis('PAT-b'), 'session-2');
      tracker.record(createMockDiagnosis('PAT-c'), 'session-1');
      tracker.record(createMockDiagnosis('PAT-c'), 'session-2');
      tracker.record(createMockDiagnosis('PAT-c'), 'session-3');

      const patterns = tracker.getAllPatterns();

      expect(patterns).toHaveLength(3);
      expect(patterns[0].patternId).toBe('PAT-c'); // 3 occurrences
      expect(patterns[1].patternId).toBe('PAT-b'); // 2 occurrences
      expect(patterns[2].patternId).toBe('PAT-a'); // 1 occurrence
    });
  });

  describe('getFrequentPatterns()', () => {
    it('should return patterns with count >= threshold', () => {
      const { tracker } = createTestEnvironment();
      // Default threshold is 3
      tracker.record(createMockDiagnosis('PAT-infrequent'), 'session-1');
      tracker.record(createMockDiagnosis('PAT-infrequent'), 'session-2');
      tracker.record(createMockDiagnosis('PAT-frequent'), 'session-1');
      tracker.record(createMockDiagnosis('PAT-frequent'), 'session-2');
      tracker.record(createMockDiagnosis('PAT-frequent'), 'session-3');

      const patterns = tracker.getFrequentPatterns();

      expect(patterns).toHaveLength(1);
      expect(patterns[0].patternId).toBe('PAT-frequent');
    });

    it('should respect custom threshold', () => {
      const { tempDir } = createTestEnvironment();
      // Create a completely separate tracker with custom threshold
      const customDbPath = path.join(tempDir, `.claude/custom-pattern-db-${Date.now()}-${Math.random()}.json`);
      const customTracker = new PatternTracker(tempDir, {
        frequentThreshold: 2,
        databasePath: customDbPath,
      });
      customTracker.record(createMockDiagnosis('PAT-two'), 'session-1');
      customTracker.record(createMockDiagnosis('PAT-two'), 'session-2');

      const patterns = customTracker.getFrequentPatterns();

      expect(patterns).toHaveLength(1);
    });
  });

  describe('getUnresolvedPatterns()', () => {
    it('should return only unresolved patterns', () => {
      const { tracker } = createTestEnvironment();
      tracker.record(createMockDiagnosis('PAT-unresolved'), 'session-1');
      tracker.record(createMockDiagnosis('PAT-resolved'), 'session-1');
      tracker.markResolved('PAT-resolved', 'Fixed');

      const patterns = tracker.getUnresolvedPatterns();

      expect(patterns).toHaveLength(1);
      expect(patterns[0].patternId).toBe('PAT-unresolved');
    });
  });

  describe('getPatternsByCategory()', () => {
    it('should return patterns by category', () => {
      const { tracker } = createTestEnvironment();
      const codeDiagnosis = createMockDiagnosis('PAT-code');
      codeDiagnosis.rootCause.category = 'code';
      const configDiagnosis = createMockDiagnosis('PAT-config');
      configDiagnosis.rootCause.category = 'configuration';

      tracker.record(codeDiagnosis, 'session-1');
      tracker.record(configDiagnosis, 'session-1');

      const codePatterns = tracker.getPatternsByCategory('code');
      expect(codePatterns).toHaveLength(1);
      expect(codePatterns[0].patternId).toBe('PAT-code');
    });
  });

  describe('getRecentPatterns()', () => {
    it('should return patterns seen in the last N days', () => {
      const { tracker } = createTestEnvironment();
      tracker.record(createMockDiagnosis('PAT-recent'), 'session-1');

      const patterns = tracker.getRecentPatterns(7);

      expect(patterns).toHaveLength(1);
    });
  });

  describe('getStats()', () => {
    it('should return statistics about tracked patterns', () => {
      const { tracker } = createTestEnvironment();
      const diagnosis1 = createMockDiagnosis('PAT-1');
      diagnosis1.rootCause.category = 'code';
      const diagnosis2 = createMockDiagnosis('PAT-2');
      diagnosis2.rootCause.category = 'configuration';

      tracker.record(diagnosis1, 'session-1');
      tracker.record(diagnosis1, 'session-2');
      tracker.record(diagnosis1, 'session-3');
      tracker.record(diagnosis2, 'session-1');
      tracker.markResolved('PAT-2', 'Fixed');

      const stats = tracker.getStats();

      expect(stats.totalPatterns).toBe(2);
      expect(stats.unresolvedPatterns).toBe(1);
      expect(stats.resolvedPatterns).toBe(1);
      expect(stats.frequentPatterns).toBe(1);
      expect(stats.byCategory.code).toBe(1);
      expect(stats.byCategory.configuration).toBe(1);
    });
  });

  describe('clear()', () => {
    it('should clear all patterns', () => {
      const { tracker } = createTestEnvironment();
      tracker.record(createMockDiagnosis('PAT-clear'), 'session-1');

      tracker.clear();

      expect(tracker.getAllPatterns()).toHaveLength(0);
    });
  });

  describe('deletePattern()', () => {
    it('should delete a specific pattern', () => {
      const { tracker } = createTestEnvironment();
      tracker.record(createMockDiagnosis('PAT-keep'), 'session-1');
      tracker.record(createMockDiagnosis('PAT-delete'), 'session-1');

      const deleted = tracker.deletePattern('PAT-delete');

      expect(deleted).toBe(true);
      expect(tracker.getAllPatterns()).toHaveLength(1);
      expect(tracker.isKnown('PAT-delete')).toBe(false);
    });

    it('should return false for non-existent pattern', () => {
      const { tracker } = createTestEnvironment();
      const deleted = tracker.deletePattern('PAT-nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('createPatternTracker()', () => {
    it('should create a PatternTracker instance', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `pattern-tracker-test-`));
      fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
      tempDirs.push(tempDir);
      const instance = createPatternTracker(tempDir);

      expect(instance).toBeInstanceOf(PatternTracker);
    });
  });
});
