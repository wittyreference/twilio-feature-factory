// ABOUTME: Unit tests for architect agent Zod schemas.
// ABOUTME: Tests 3 variants: new-feature, bug-fix, refactor.

import { describe, it, expect, jest } from '@jest/globals';

// Mock the schema registry to break the circular dependency between
// index.ts and architect.ts. The schemas themselves are pure Zod objects
// that don't need the registry to function.
jest.unstable_mockModule('../../src/schemas/index.js', () => ({
  registerPhaseSchema: jest.fn(),
}));

const {
  architectNewFeatureSchema,
  architectBugFixSchema,
  architectRefactorSchema,
} = await import('../../src/schemas/architect.js');

// ============================================================================
// architectNewFeatureSchema
// ============================================================================

describe('architectNewFeatureSchema', () => {
  it('should pass with valid output including approved=true', () => {
    const result = architectNewFeatureSchema.safeParse({
      approved: true,
      designNotes: 'Use TwiML for voice handling',
      suggestedPattern: 'webhook-handler',
      twilioServices: ['Voice', 'Sync'],
      filesToCreate: ['functions/voice/handler.js'],
      filesToModify: [],
      risks: [],
    });
    expect(result.success).toBe(true);
  });

  it('should pass with minimal valid output', () => {
    const result = architectNewFeatureSchema.safeParse({
      approved: false,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when approved is missing', () => {
    const result = architectNewFeatureSchema.safeParse({
      designNotes: 'Some notes',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('approved');
    }
  });

  it('should fail when approved is not a boolean', () => {
    const result = architectNewFeatureSchema.safeParse({
      approved: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('should allow extra keys via passthrough', () => {
    const input = {
      approved: true,
      customField: 'extra data',
    };
    const result = architectNewFeatureSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('customField', 'extra data');
    }
  });

  it('should accept docProtocol fields', () => {
    const result = architectNewFeatureSchema.safeParse({
      approved: true,
      docsConsulted: ['functions/voice/CLAUDE.md'],
      learningsToCapture: ['TwiML requires UTF-8'],
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// architectBugFixSchema
// ============================================================================

describe('architectBugFixSchema', () => {
  it('should pass with valid output including rootCause and suggestedFix', () => {
    const result = architectBugFixSchema.safeParse({
      diagnosis: 'Timeout in webhook handler',
      rootCause: 'Missing await on async call',
      affectedFiles: ['functions/callbacks/handler.js'],
      suggestedFix: 'Add await before the Twilio client call',
      riskAssessment: 'Low risk',
      reproductionSteps: ['Call endpoint', 'Wait 30s'],
    });
    expect(result.success).toBe(true);
  });

  it('should fail when rootCause is missing', () => {
    const result = architectBugFixSchema.safeParse({
      suggestedFix: 'Add error handling',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('rootCause');
    }
  });

  it('should fail when suggestedFix is missing', () => {
    const result = architectBugFixSchema.safeParse({
      rootCause: 'Missing null check',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('suggestedFix');
    }
  });

  it('should pass with only required fields', () => {
    const result = architectBugFixSchema.safeParse({
      rootCause: 'Race condition',
      suggestedFix: 'Add mutex',
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const result = architectBugFixSchema.safeParse({
      rootCause: 'Bug',
      suggestedFix: 'Fix',
      severity: 'critical',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('severity', 'critical');
    }
  });
});

// ============================================================================
// architectRefactorSchema
// ============================================================================

describe('architectRefactorSchema', () => {
  it('should pass with valid output including approved and refactoringPlan', () => {
    const result = architectRefactorSchema.safeParse({
      approved: true,
      rationale: 'Reduce duplication',
      scope: 'Voice handlers',
      affectedFiles: ['functions/voice/inbound.js', 'functions/voice/outbound.js'],
      expectedImprovements: ['Less duplication', 'Easier testing'],
      risks: ['May break existing webhooks'],
      refactoringPlan: 'Extract shared logic into helpers/voice-utils.js',
    });
    expect(result.success).toBe(true);
  });

  it('should fail when refactoringPlan is missing', () => {
    const result = architectRefactorSchema.safeParse({
      approved: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('refactoringPlan');
    }
  });

  it('should fail when approved is missing', () => {
    const result = architectRefactorSchema.safeParse({
      refactoringPlan: 'Extract utilities',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('approved');
    }
  });

  it('should pass with only required fields', () => {
    const result = architectRefactorSchema.safeParse({
      approved: false,
      refactoringPlan: 'Split into modules',
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const result = architectRefactorSchema.safeParse({
      approved: true,
      refactoringPlan: 'Modularize',
      estimatedEffort: '2 hours',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('estimatedEffort', '2 hours');
    }
  });
});
