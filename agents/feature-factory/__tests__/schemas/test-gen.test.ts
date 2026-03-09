// ABOUTME: Unit tests for test-gen agent Zod schemas.
// ABOUTME: Tests 2 variants: new-feature (TDD Red Phase), bug-fix (Regression Tests).

import { describe, it, expect, jest } from '@jest/globals';

// Mock the schema registry to break the circular dependency between
// index.ts and test-gen.ts during module initialization.
jest.unstable_mockModule('../../src/schemas/index.js', () => ({
  registerPhaseSchema: jest.fn(),
}));

const {
  testGenNewFeatureSchema,
  testGenBugFixSchema,
} = await import('../../src/schemas/test-gen.js');

// ============================================================================
// testGenNewFeatureSchema
// ============================================================================

describe('testGenNewFeatureSchema', () => {
  it('should pass with valid output containing testsCreated and allTestsFailing', () => {
    const result = testGenNewFeatureSchema.safeParse({
      testsCreated: 3,
      allTestsFailing: true,
      testFiles: [
        { path: '__tests__/verify.test.ts', description: 'Verify tests' },
      ],
      coverageGoals: ['Verify send', 'Verify check'],
    });
    expect(result.success).toBe(true);
  });

  it('should pass with minimal required fields', () => {
    const result = testGenNewFeatureSchema.safeParse({
      testsCreated: 1,
      allTestsFailing: true,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when testsCreated is missing', () => {
    const result = testGenNewFeatureSchema.safeParse({
      allTestsFailing: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('testsCreated');
    }
  });

  it('should fail when allTestsFailing is missing', () => {
    const result = testGenNewFeatureSchema.safeParse({
      testsCreated: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('allTestsFailing');
    }
  });

  it('should fail when testsCreated is not a number', () => {
    const result = testGenNewFeatureSchema.safeParse({
      testsCreated: 'three',
      allTestsFailing: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('testsCreated');
    }
  });

  it('should allow extra keys via passthrough', () => {
    const result = testGenNewFeatureSchema.safeParse({
      testsCreated: 1,
      allTestsFailing: true,
      framework: 'jest',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('framework', 'jest');
    }
  });
});

// ============================================================================
// testGenBugFixSchema
// ============================================================================

describe('testGenBugFixSchema', () => {
  it('should pass with valid output including reproducedBug', () => {
    const result = testGenBugFixSchema.safeParse({
      testsCreated: 2,
      allTestsFailing: true,
      reproducedBug: true,
      testFiles: [
        { path: '__tests__/regression.test.ts', description: 'Regression test' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should fail when reproducedBug is missing', () => {
    const result = testGenBugFixSchema.safeParse({
      testsCreated: 1,
      allTestsFailing: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('reproducedBug');
    }
  });

  it('should fail when testsCreated is missing', () => {
    const result = testGenBugFixSchema.safeParse({
      allTestsFailing: true,
      reproducedBug: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('testsCreated');
    }
  });

  it('should fail when allTestsFailing is missing', () => {
    const result = testGenBugFixSchema.safeParse({
      testsCreated: 1,
      reproducedBug: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('allTestsFailing');
    }
  });

  it('should pass with only required fields', () => {
    const result = testGenBugFixSchema.safeParse({
      testsCreated: 1,
      allTestsFailing: true,
      reproducedBug: false,
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const result = testGenBugFixSchema.safeParse({
      testsCreated: 1,
      allTestsFailing: true,
      reproducedBug: true,
      bugId: 'ISSUE-123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('bugId', 'ISSUE-123');
    }
  });
});
