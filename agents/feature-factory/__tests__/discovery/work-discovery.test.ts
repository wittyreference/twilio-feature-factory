// ABOUTME: Tests for work discovery interface and helper functions.
// ABOUTME: Verifies priority, tier, and workflow determination from diagnoses.

import {
  determinePriority,
  determineAutomationTier,
  suggestWorkflow,
  createWorkFromValidation,
  type Diagnosis,
} from '../../src/discovery/work-discovery';

describe('Work Discovery', () => {
  const createMockDiagnosis = (overrides: Partial<Diagnosis> = {}): Diagnosis => ({
    patternId: 'PAT-test-001',
    summary: 'Test failure',
    rootCause: {
      category: 'code',
      description: 'Test error',
      confidence: 0.8,
    },
    evidence: [
      { source: 'test', data: {}, relevance: 'primary' },
    ],
    suggestedFixes: [
      { description: 'Fix the code', actionType: 'code', confidence: 0.8, automated: true },
    ],
    isKnownPattern: false,
    previousOccurrences: 0,
    validationResult: {
      success: false,
      resourceSid: 'SM123',
      resourceType: 'message',
      primaryStatus: 'failed',
      checks: {},
      errors: ['Test error'],
      warnings: [],
      duration: 100,
    },
    timestamp: new Date(),
    ...overrides,
  });

  describe('determinePriority', () => {
    it('returns critical for high-confidence configuration errors', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'configuration', description: 'Missing env var', confidence: 0.9 },
      });
      expect(determinePriority(diagnosis)).toBe('critical');
    });

    it('returns high for code errors', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'code', description: 'TwiML error', confidence: 0.8 },
      });
      expect(determinePriority(diagnosis)).toBe('high');
    });

    it('returns medium for external errors', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'external', description: 'Carrier rejection', confidence: 0.7 },
      });
      expect(determinePriority(diagnosis)).toBe('medium');
    });

    it('returns medium for timing errors', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'timing', description: 'Not ready yet', confidence: 0.7 },
      });
      expect(determinePriority(diagnosis)).toBe('medium');
    });

    it('returns low for unknown errors', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'unknown', description: 'Unknown error', confidence: 0.3 },
      });
      expect(determinePriority(diagnosis)).toBe('low');
    });
  });

  describe('determineAutomationTier', () => {
    it('returns tier 1 for simple config fix with high confidence automated fix', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'configuration', description: 'Missing env var', confidence: 0.9 },
        suggestedFixes: [{ description: 'Add env var', actionType: 'config', confidence: 0.9, automated: true }],
      });
      expect(determineAutomationTier(diagnosis)).toBe(1);
    });

    it('returns tier 2 for code fix with medium-high confidence', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'code', description: 'TwiML error', confidence: 0.7 },
        suggestedFixes: [{ description: 'Fix TwiML', actionType: 'code', confidence: 0.8, automated: true }],
      });
      expect(determineAutomationTier(diagnosis)).toBe(2);
    });

    it('returns tier 3 for issues with fix suggestions but lower confidence', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'code', description: 'Complex error', confidence: 0.6 },
        suggestedFixes: [{ description: 'Try this', actionType: 'code', confidence: 0.5, automated: false }],
      });
      expect(determineAutomationTier(diagnosis)).toBe(3);
    });

    it('returns tier 4 for external issues', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'external', description: 'Carrier issue', confidence: 0.3 },
        suggestedFixes: [],
      });
      expect(determineAutomationTier(diagnosis)).toBe(4);
    });
  });

  describe('suggestWorkflow', () => {
    it('suggests bug-fix for configuration issues', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'configuration', description: 'Missing env var', confidence: 0.9 },
      });
      expect(suggestWorkflow(diagnosis)).toBe('bug-fix');
    });

    it('suggests bug-fix for code issues by default', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'code', description: 'Error in handler', confidence: 0.8 },
      });
      expect(suggestWorkflow(diagnosis)).toBe('bug-fix');
    });

    it('suggests refactor when fix mentions refactor', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'code', description: 'Code structure issue', confidence: 0.8 },
        suggestedFixes: [{ description: 'Refactor the module', actionType: 'code', confidence: 0.7, automated: false }],
      });
      expect(suggestWorkflow(diagnosis)).toBe('refactor');
    });

    it('suggests investigation for timing issues', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'timing', description: 'Data not ready', confidence: 0.7 },
      });
      expect(suggestWorkflow(diagnosis)).toBe('investigation');
    });

    it('suggests manual-review for external issues', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'external', description: 'Carrier blocked', confidence: 0.8 },
      });
      expect(suggestWorkflow(diagnosis)).toBe('manual-review');
    });

    it('suggests investigation for unknown issues', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'unknown', description: 'Unknown error', confidence: 0.3 },
      });
      expect(suggestWorkflow(diagnosis)).toBe('investigation');
    });
  });

  describe('createWorkFromValidation', () => {
    it('creates a work item with all required fields', () => {
      const diagnosis = createMockDiagnosis();
      const work = createWorkFromValidation(diagnosis);

      expect(work.id).toMatch(/^work-PAT-test-001-\d+$/);
      expect(work.discoveredAt).toBeInstanceOf(Date);
      expect(work.source).toBe('validation-failure');
      expect(work.priority).toBe('high'); // code errors are high priority
      expect(work.tier).toBe(2); // code with automated fix
      expect(work.suggestedWorkflow).toBe('bug-fix');
      expect(work.summary).toBe('Test failure');
      expect(work.diagnosis).toBe(diagnosis);
      expect(work.resourceSids).toContain('SM123');
      expect(work.status).toBe('pending');
    });

    it('uses custom source when provided', () => {
      const diagnosis = createMockDiagnosis();
      const work = createWorkFromValidation(diagnosis, 'debugger-alert');

      expect(work.source).toBe('debugger-alert');
    });

    it('includes tags based on category and workflow', () => {
      const diagnosis = createMockDiagnosis({
        rootCause: { category: 'external', description: 'Carrier issue', confidence: 0.7 },
      });
      const work = createWorkFromValidation(diagnosis);

      expect(work.tags).toContain('external');
      expect(work.tags).toContain('manual-review');
    });
  });
});
