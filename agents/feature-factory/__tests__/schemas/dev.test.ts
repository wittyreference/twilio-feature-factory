// ABOUTME: Unit tests for dev agent Zod schemas.
// ABOUTME: Tests 3 variants: new-feature (TDD Green), bug-fix, refactor.

import { describe, it, expect, jest } from '@jest/globals';

// Mock the schema registry to break the circular dependency between
// index.ts and dev.ts during module initialization.
jest.unstable_mockModule('../../src/schemas/index.js', () => ({
  registerPhaseSchema: jest.fn(),
}));

const {
  devNewFeatureSchema,
  devBugFixSchema,
  devRefactorSchema,
} = await import('../../src/schemas/dev.js');

// ============================================================================
// devNewFeatureSchema
// ============================================================================

describe('devNewFeatureSchema', () => {
  it('should pass with valid output including allTestsPassing=true', () => {
    const result = devNewFeatureSchema.safeParse({
      allTestsPassing: true,
      testsPassedBefore: 0,
      testsPassedAfter: 5,
      testRunOutput: 'All 5 tests passed',
      filesCreated: ['functions/verify/send.js'],
      filesModified: [],
      commits: ['abc1234'],
    });
    expect(result.success).toBe(true);
  });

  it('should pass with minimal required fields', () => {
    const result = devNewFeatureSchema.safeParse({
      allTestsPassing: true,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when allTestsPassing is missing', () => {
    const result = devNewFeatureSchema.safeParse({
      testsPassedAfter: 5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('allTestsPassing');
    }
  });

  it('should fail when allTestsPassing is not a boolean', () => {
    const result = devNewFeatureSchema.safeParse({
      allTestsPassing: 'yes',
    });
    expect(result.success).toBe(false);
  });

  it('should allow extra keys via passthrough', () => {
    const result = devNewFeatureSchema.safeParse({
      allTestsPassing: true,
      implementationNotes: 'Used TwiML',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('implementationNotes', 'Used TwiML');
    }
  });
});

// ============================================================================
// devBugFixSchema
// ============================================================================

describe('devBugFixSchema', () => {
  it('should pass with valid output including allTestsPassing and fixDescription', () => {
    const result = devBugFixSchema.safeParse({
      allTestsPassing: true,
      fixDescription: 'Added null check before accessing property',
      testsPassedBefore: 3,
      testsPassedAfter: 5,
      filesModified: ['functions/callbacks/handler.js'],
      commits: ['def5678'],
    });
    expect(result.success).toBe(true);
  });

  it('should pass without fixDescription (optional)', () => {
    const result = devBugFixSchema.safeParse({
      allTestsPassing: true,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when allTestsPassing is missing', () => {
    const result = devBugFixSchema.safeParse({
      fixDescription: 'Fixed the bug',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('allTestsPassing');
    }
  });

  it('should accept docProtocol and fileTracking fields', () => {
    const result = devBugFixSchema.safeParse({
      allTestsPassing: true,
      fixDescription: 'Added retry logic',
      filesCreated: [],
      filesModified: ['src/handler.ts'],
      commits: ['aaa1111'],
      docsConsulted: ['CLAUDE.md'],
      learningsToCapture: ['Retry needs backoff'],
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// devRefactorSchema
// ============================================================================

describe('devRefactorSchema', () => {
  it('should pass with valid output including allTestsPassing and changesDescription', () => {
    const result = devRefactorSchema.safeParse({
      allTestsPassing: true,
      changesDescription: 'Extracted shared voice utilities',
      filesModified: ['functions/voice/inbound.js'],
      filesCreated: ['functions/helpers/voice-utils.private.js'],
      commits: ['ghi9012'],
    });
    expect(result.success).toBe(true);
  });

  it('should pass without changesDescription (optional)', () => {
    const result = devRefactorSchema.safeParse({
      allTestsPassing: true,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when allTestsPassing is missing', () => {
    const result = devRefactorSchema.safeParse({
      changesDescription: 'Modularized code',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('allTestsPassing');
    }
  });

  it('should allow extra keys via passthrough', () => {
    const result = devRefactorSchema.safeParse({
      allTestsPassing: true,
      linesReduced: 150,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('linesReduced', 150);
    }
  });
});
