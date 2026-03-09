// ABOUTME: Unit tests for review agent Zod schemas.
// ABOUTME: Tests 3 variants: new-feature (Code Review), bug-fix (Fix Review), refactor (Code Quality Review).

import { describe, it, expect, jest } from '@jest/globals';

// Mock the schema registry to break the circular dependency between
// index.ts and review.ts during module initialization.
jest.unstable_mockModule('../../src/schemas/index.js', () => ({
  registerPhaseSchema: jest.fn(),
}));

const {
  reviewNewFeatureSchema,
  reviewBugFixSchema,
  reviewRefactorSchema,
} = await import('../../src/schemas/review.js');

// ============================================================================
// reviewNewFeatureSchema
// ============================================================================

describe('reviewNewFeatureSchema', () => {
  it('should pass with valid output including verdict=APPROVED', () => {
    const result = reviewNewFeatureSchema.safeParse({
      verdict: 'APPROVED',
      summary: 'Code quality is good',
      issues: [],
      approvedToMerge: true,
    });
    expect(result.success).toBe(true);
  });

  it('should pass with verdict=NEEDS_CHANGES', () => {
    const result = reviewNewFeatureSchema.safeParse({
      verdict: 'NEEDS_CHANGES',
      issues: [
        { severity: 'major', description: 'Missing error handling', file: 'handler.js' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should pass with verdict=REJECTED', () => {
    const result = reviewNewFeatureSchema.safeParse({
      verdict: 'REJECTED',
      summary: 'Fundamental design issues',
    });
    expect(result.success).toBe(true);
  });

  it('should fail with invalid verdict value', () => {
    const result = reviewNewFeatureSchema.safeParse({
      verdict: 'PASSED',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should fail when verdict is missing', () => {
    const result = reviewNewFeatureSchema.safeParse({
      summary: 'No verdict provided',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should pass with only verdict (other fields optional)', () => {
    const result = reviewNewFeatureSchema.safeParse({
      verdict: 'APPROVED',
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const result = reviewNewFeatureSchema.safeParse({
      verdict: 'APPROVED',
      reviewerNotes: 'Clean implementation',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('reviewerNotes', 'Clean implementation');
    }
  });

  it('should accept docProtocol fields', () => {
    const result = reviewNewFeatureSchema.safeParse({
      verdict: 'APPROVED',
      docsConsulted: ['CLAUDE.md'],
      learningsToCapture: [],
      docsToUpdate: ['functions/voice/CLAUDE.md'],
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// reviewBugFixSchema
// ============================================================================

describe('reviewBugFixSchema', () => {
  it('should pass with valid output including verdict and isMinimalFix', () => {
    const result = reviewBugFixSchema.safeParse({
      verdict: 'APPROVED',
      isMinimalFix: true,
      summary: 'Fix is targeted and minimal',
    });
    expect(result.success).toBe(true);
  });

  it('should fail when isMinimalFix is missing', () => {
    const result = reviewBugFixSchema.safeParse({
      verdict: 'APPROVED',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('isMinimalFix');
    }
  });

  it('should fail when verdict is missing', () => {
    const result = reviewBugFixSchema.safeParse({
      isMinimalFix: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should fail with QA verdict values', () => {
    const result = reviewBugFixSchema.safeParse({
      verdict: 'FAILED',
      isMinimalFix: true,
    });
    expect(result.success).toBe(false);
  });

  it('should pass with only required fields', () => {
    const result = reviewBugFixSchema.safeParse({
      verdict: 'NEEDS_CHANGES',
      isMinimalFix: false,
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const result = reviewBugFixSchema.safeParse({
      verdict: 'APPROVED',
      isMinimalFix: true,
      scopeCreep: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('scopeCreep', false);
    }
  });
});

// ============================================================================
// reviewRefactorSchema
// ============================================================================

describe('reviewRefactorSchema', () => {
  it('should pass with valid output including verdict and improvementsValidated', () => {
    const result = reviewRefactorSchema.safeParse({
      verdict: 'APPROVED',
      improvementsValidated: true,
      summary: 'Refactoring improves code quality',
    });
    expect(result.success).toBe(true);
  });

  it('should fail when improvementsValidated is missing', () => {
    const result = reviewRefactorSchema.safeParse({
      verdict: 'APPROVED',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('improvementsValidated');
    }
  });

  it('should fail when verdict is missing', () => {
    const result = reviewRefactorSchema.safeParse({
      improvementsValidated: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should fail with invalid verdict values', () => {
    const result = reviewRefactorSchema.safeParse({
      verdict: 'NEEDS_ATTENTION',
      improvementsValidated: true,
    });
    expect(result.success).toBe(false);
  });

  it('should pass with only required fields', () => {
    const result = reviewRefactorSchema.safeParse({
      verdict: 'REJECTED',
      improvementsValidated: false,
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const result = reviewRefactorSchema.safeParse({
      verdict: 'APPROVED',
      improvementsValidated: true,
      complexityReduction: '30%',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('complexityReduction', '30%');
    }
  });
});
