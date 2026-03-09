// ABOUTME: Unit tests for QA agent Zod schemas.
// ABOUTME: Tests 4 variants: new-feature, bug-fix, refactor-baseline, refactor-final.

import { describe, it, expect, jest } from '@jest/globals';

// Mock the schema registry to break the circular dependency between
// index.ts and qa.ts during module initialization.
jest.unstable_mockModule('../../src/schemas/index.js', () => ({
  registerPhaseSchema: jest.fn(),
}));

const {
  qaNewFeatureSchema,
  qaBugFixSchema,
  qaRefactorBaselineSchema,
  qaRefactorFinalSchema,
} = await import('../../src/schemas/qa.js');

// ============================================================================
// qaNewFeatureSchema
// ============================================================================

describe('qaNewFeatureSchema', () => {
  it('should pass with valid output including verdict=PASSED', () => {
    const result = qaNewFeatureSchema.safeParse({
      verdict: 'PASSED',
      summary: 'All tests pass, coverage at 85%',
      testsRun: 10,
      testsPassed: 10,
      testsFailed: 0,
      coveragePercent: 85,
      coverageMeetsThreshold: true,
    });
    expect(result.success).toBe(true);
  });

  it('should pass with verdict=NEEDS_ATTENTION', () => {
    const result = qaNewFeatureSchema.safeParse({
      verdict: 'NEEDS_ATTENTION',
    });
    expect(result.success).toBe(true);
  });

  it('should pass with verdict=FAILED', () => {
    const result = qaNewFeatureSchema.safeParse({
      verdict: 'FAILED',
    });
    expect(result.success).toBe(true);
  });

  it('should fail with invalid verdict', () => {
    const result = qaNewFeatureSchema.safeParse({
      verdict: 'APPROVED',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should fail when verdict is missing', () => {
    const result = qaNewFeatureSchema.safeParse({
      summary: 'Missing verdict',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should accept optional arrays', () => {
    const result = qaNewFeatureSchema.safeParse({
      verdict: 'PASSED',
      coverageGaps: [{ file: 'src/utils.ts', coverage: 60 }],
      securityIssues: [{ severity: 'low', description: 'Minor issue' }],
      recommendations: ['Add edge case tests'],
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const result = qaNewFeatureSchema.safeParse({
      verdict: 'PASSED',
      customMetric: 42,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('customMetric', 42);
    }
  });
});

// ============================================================================
// qaBugFixSchema
// ============================================================================

describe('qaBugFixSchema', () => {
  it('should pass with valid output including verdict and noRegressions', () => {
    const result = qaBugFixSchema.safeParse({
      verdict: 'PASSED',
      noRegressions: true,
      summary: 'Fix verified, no regressions',
    });
    expect(result.success).toBe(true);
  });

  it('should fail when noRegressions is missing', () => {
    const result = qaBugFixSchema.safeParse({
      verdict: 'PASSED',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('noRegressions');
    }
  });

  it('should fail when verdict is missing', () => {
    const result = qaBugFixSchema.safeParse({
      noRegressions: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should fail with invalid verdict value', () => {
    const result = qaBugFixSchema.safeParse({
      verdict: 'REJECTED',
      noRegressions: true,
    });
    expect(result.success).toBe(false);
  });

  it('should pass with only required fields', () => {
    const result = qaBugFixSchema.safeParse({
      verdict: 'FAILED',
      noRegressions: false,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// qaRefactorBaselineSchema
// ============================================================================

describe('qaRefactorBaselineSchema', () => {
  it('should pass with valid output including verdict', () => {
    const result = qaRefactorBaselineSchema.safeParse({
      verdict: 'PASSED',
      testsRun: 20,
      testsPassed: 20,
      testsFailed: 0,
      coveragePercent: 90,
    });
    expect(result.success).toBe(true);
  });

  it('should pass with only verdict', () => {
    const result = qaRefactorBaselineSchema.safeParse({
      verdict: 'NEEDS_ATTENTION',
    });
    expect(result.success).toBe(true);
  });

  it('should fail when verdict is missing', () => {
    const result = qaRefactorBaselineSchema.safeParse({
      testsRun: 15,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should not require noRegressions (baseline has no prior state)', () => {
    const result = qaRefactorBaselineSchema.safeParse({
      verdict: 'PASSED',
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const result = qaRefactorBaselineSchema.safeParse({
      verdict: 'PASSED',
      baselineSnapshot: 'captured',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('baselineSnapshot', 'captured');
    }
  });
});

// ============================================================================
// qaRefactorFinalSchema
// ============================================================================

describe('qaRefactorFinalSchema', () => {
  it('should pass with valid output including verdict and noRegressions', () => {
    const result = qaRefactorFinalSchema.safeParse({
      verdict: 'PASSED',
      noRegressions: true,
      testsRun: 20,
      testsPassed: 20,
      testsFailed: 0,
      coveragePercent: 92,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when noRegressions is missing', () => {
    const result = qaRefactorFinalSchema.safeParse({
      verdict: 'PASSED',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('noRegressions');
    }
  });

  it('should fail when verdict is missing', () => {
    const result = qaRefactorFinalSchema.safeParse({
      noRegressions: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('verdict');
    }
  });

  it('should fail with invalid verdict', () => {
    const result = qaRefactorFinalSchema.safeParse({
      verdict: 'INVALID',
      noRegressions: true,
    });
    expect(result.success).toBe(false);
  });

  it('should allow extra keys via passthrough', () => {
    const result = qaRefactorFinalSchema.safeParse({
      verdict: 'PASSED',
      noRegressions: true,
      comparedToBaseline: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('comparedToBaseline', true);
    }
  });
});
