// ABOUTME: Unit tests for docs agent Zod schema.
// ABOUTME: Tests 1 variant: new-feature (Documentation).

import { describe, it, expect, jest } from '@jest/globals';

// Mock the schema registry to break the circular dependency between
// index.ts and docs.ts during module initialization.
jest.unstable_mockModule('../../src/schemas/index.js', () => ({
  registerPhaseSchema: jest.fn(),
}));

const { docsNewFeatureSchema } = await import('../../src/schemas/docs.js');

// ============================================================================
// docsNewFeatureSchema
// ============================================================================

describe('docsNewFeatureSchema', () => {
  it('should pass with valid output including aboutMeVerified=true', () => {
    const result = docsNewFeatureSchema.safeParse({
      aboutMeVerified: true,
      filesUpdated: ['functions/voice/CLAUDE.md'],
      readmeUpdated: true,
      claudeMdUpdates: ['functions/voice/CLAUDE.md'],
      examplesAdded: ['examples/voice-call.sh'],
      learningsCaptured: 2,
    });
    expect(result.success).toBe(true);
  });

  it('should pass with minimal required field', () => {
    const result = docsNewFeatureSchema.safeParse({
      aboutMeVerified: true,
    });
    expect(result.success).toBe(true);
  });

  it('should pass with aboutMeVerified=false', () => {
    const result = docsNewFeatureSchema.safeParse({
      aboutMeVerified: false,
    });
    expect(result.success).toBe(true);
  });

  it('should fail when aboutMeVerified is missing', () => {
    const result = docsNewFeatureSchema.safeParse({
      filesUpdated: ['README.md'],
      readmeUpdated: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('aboutMeVerified');
    }
  });

  it('should fail when aboutMeVerified is not a boolean', () => {
    const result = docsNewFeatureSchema.safeParse({
      aboutMeVerified: 'yes',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('aboutMeVerified');
    }
  });

  it('should allow extra keys via passthrough', () => {
    const result = docsNewFeatureSchema.safeParse({
      aboutMeVerified: true,
      spellChecked: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('spellChecked', true);
    }
  });

  it('should accept docProtocol fields', () => {
    const result = docsNewFeatureSchema.safeParse({
      aboutMeVerified: true,
      docsConsulted: ['CLAUDE.md'],
      learningsToCapture: ['ABOUTME is two lines'],
      docsToUpdate: [],
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional arrays as empty', () => {
    const result = docsNewFeatureSchema.safeParse({
      aboutMeVerified: true,
      filesUpdated: [],
      claudeMdUpdates: [],
      examplesAdded: [],
    });
    expect(result.success).toBe(true);
  });

  it('should fail when filesUpdated is not an array', () => {
    const result = docsNewFeatureSchema.safeParse({
      aboutMeVerified: true,
      filesUpdated: 'not-an-array',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('filesUpdated');
    }
  });
});
