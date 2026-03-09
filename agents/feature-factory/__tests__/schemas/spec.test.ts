// ABOUTME: Unit tests for spec agent Zod schema.
// ABOUTME: Tests 1 variant: new-feature (Specification).

import { describe, it, expect, jest } from '@jest/globals';

// Mock the schema registry to break the circular dependency between
// index.ts and spec.ts during module initialization.
jest.unstable_mockModule('../../src/schemas/index.js', () => ({
  registerPhaseSchema: jest.fn(),
}));

const { specNewFeatureSchema } = await import('../../src/schemas/spec.js');

// ============================================================================
// specNewFeatureSchema
// ============================================================================

describe('specNewFeatureSchema', () => {
  it('should pass with valid output containing functionSpecs and testScenarios', () => {
    const result = specNewFeatureSchema.safeParse({
      overview: 'SMS verification feature',
      functionSpecs: [
        { name: 'send-verification', path: 'functions/verify/send.js' },
      ],
      testScenarios: {
        unit: ['Test verification code generation'],
        integration: ['Test full flow'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should fail when functionSpecs is missing', () => {
    const result = specNewFeatureSchema.safeParse({
      testScenarios: { unit: [] },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('functionSpecs');
    }
  });

  it('should fail when testScenarios is missing', () => {
    const result = specNewFeatureSchema.safeParse({
      functionSpecs: [{ name: 'handler' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('testScenarios');
    }
  });

  it('should pass with only required fields', () => {
    const result = specNewFeatureSchema.safeParse({
      functionSpecs: [{}],
      testScenarios: {},
    });
    expect(result.success).toBe(true);
  });

  it('should allow extra keys via passthrough', () => {
    const input = {
      functionSpecs: [{ name: 'test' }],
      testScenarios: { smoke: ['basic test'] },
      estimatedComplexity: 'medium',
    };
    const result = specNewFeatureSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('estimatedComplexity', 'medium');
    }
  });

  it('should accept optional fields', () => {
    const result = specNewFeatureSchema.safeParse({
      overview: 'Feature overview',
      userStories: [{ as: 'user', iWant: 'verification' }],
      functionSpecs: [{ name: 'handler' }],
      testScenarios: { unit: [] },
      dependencies: ['twilio'],
      assumptions: ['User has phone'],
      docsConsulted: ['CLAUDE.md'],
    });
    expect(result.success).toBe(true);
  });

  it('should fail when functionSpecs is not an array', () => {
    const result = specNewFeatureSchema.safeParse({
      functionSpecs: 'not an array',
      testScenarios: {},
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('functionSpecs');
    }
  });
});
