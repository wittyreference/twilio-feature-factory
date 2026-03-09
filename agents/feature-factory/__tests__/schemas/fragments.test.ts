// ABOUTME: Unit tests for shared Zod schema fragments.
// ABOUTME: Tests verdict enums, test file refs, coverage gaps, security issues, review issues.

import { describe, it, expect } from '@jest/globals';
import {
  qaVerdictSchema,
  reviewVerdictSchema,
  testFileRefSchema,
  coverageGapSchema,
  securityIssueSchema,
  reviewIssueSchema,
} from '../../src/schemas/fragments.js';

// ============================================================================
// qaVerdictSchema
// ============================================================================

describe('qaVerdictSchema', () => {
  it('should accept PASSED', () => {
    const result = qaVerdictSchema.safeParse('PASSED');
    expect(result.success).toBe(true);
  });

  it('should accept NEEDS_ATTENTION', () => {
    const result = qaVerdictSchema.safeParse('NEEDS_ATTENTION');
    expect(result.success).toBe(true);
  });

  it('should accept FAILED', () => {
    const result = qaVerdictSchema.safeParse('FAILED');
    expect(result.success).toBe(true);
  });

  it('should reject other strings', () => {
    const result = qaVerdictSchema.safeParse('APPROVED');
    expect(result.success).toBe(false);
  });

  it('should reject non-string values', () => {
    const result = qaVerdictSchema.safeParse(42);
    expect(result.success).toBe(false);
  });

  it('should reject empty string', () => {
    const result = qaVerdictSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// reviewVerdictSchema
// ============================================================================

describe('reviewVerdictSchema', () => {
  it('should accept APPROVED', () => {
    const result = reviewVerdictSchema.safeParse('APPROVED');
    expect(result.success).toBe(true);
  });

  it('should accept NEEDS_CHANGES', () => {
    const result = reviewVerdictSchema.safeParse('NEEDS_CHANGES');
    expect(result.success).toBe(true);
  });

  it('should accept REJECTED', () => {
    const result = reviewVerdictSchema.safeParse('REJECTED');
    expect(result.success).toBe(true);
  });

  it('should reject QA verdict values', () => {
    const result = reviewVerdictSchema.safeParse('PASSED');
    expect(result.success).toBe(false);
  });

  it('should reject lowercase variants', () => {
    const result = reviewVerdictSchema.safeParse('approved');
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// testFileRefSchema
// ============================================================================

describe('testFileRefSchema', () => {
  it('should pass with valid object', () => {
    const result = testFileRefSchema.safeParse({
      path: '__tests__/example.test.ts',
      description: 'Tests for example module',
      name: 'example.test.ts',
    });
    expect(result.success).toBe(true);
  });

  it('should pass with empty object (all fields optional)', () => {
    const result = testFileRefSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should pass with partial fields', () => {
    const result = testFileRefSchema.safeParse({ path: 'test.ts' });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const input = {
      path: 'test.ts',
      customField: 'extra data',
      anotherField: 123,
    };
    const result = testFileRefSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('customField', 'extra data');
    }
  });

  it('should reject non-object values', () => {
    const result = testFileRefSchema.safeParse('not an object');
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// coverageGapSchema
// ============================================================================

describe('coverageGapSchema', () => {
  it('should pass with valid object', () => {
    const result = coverageGapSchema.safeParse({
      file: 'src/utils.ts',
      coverage: 45.5,
      recommendation: 'Add tests for edge cases',
    });
    expect(result.success).toBe(true);
  });

  it('should pass with empty object (all fields optional)', () => {
    const result = coverageGapSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const input = { file: 'src/a.ts', extra: true };
    const result = coverageGapSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('extra', true);
    }
  });

  it('should reject non-number coverage', () => {
    const result = coverageGapSchema.safeParse({ coverage: 'high' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['coverage']);
    }
  });
});

// ============================================================================
// securityIssueSchema
// ============================================================================

describe('securityIssueSchema', () => {
  it('should pass with valid object', () => {
    const result = securityIssueSchema.safeParse({
      severity: 'high',
      description: 'SQL injection vulnerability',
      location: 'src/db.ts:42',
      recommendation: 'Use parameterized queries',
    });
    expect(result.success).toBe(true);
  });

  it('should pass with empty object (all fields optional)', () => {
    const result = securityIssueSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const input = { severity: 'critical', cve: 'CVE-2024-1234' };
    const result = securityIssueSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('cve', 'CVE-2024-1234');
    }
  });
});

// ============================================================================
// reviewIssueSchema
// ============================================================================

describe('reviewIssueSchema', () => {
  it('should pass with valid object', () => {
    const result = reviewIssueSchema.safeParse({
      severity: 'major',
      description: 'Missing error handling',
      file: 'src/handler.ts',
      line: 55,
    });
    expect(result.success).toBe(true);
  });

  it('should pass with empty object (all fields optional)', () => {
    const result = reviewIssueSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject non-number line', () => {
    const result = reviewIssueSchema.safeParse({ line: 'fifty-five' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['line']);
    }
  });

  it('should allow extra keys via passthrough', () => {
    const input = { severity: 'minor', fixable: true };
    const result = reviewIssueSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('fixable', true);
    }
  });
});
