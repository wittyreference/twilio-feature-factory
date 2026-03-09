// ABOUTME: Unit tests for schema registry and validation functions.
// ABOUTME: Tests register/get/clear, schemaToPromptDescription, and validatePhaseOutput.

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';

// Mock the individual schema files that index.ts imports for side-effect
// registration. This breaks the circular dependency without affecting the
// registry functions themselves.
jest.unstable_mockModule('../../src/schemas/architect.js', () => ({}));
jest.unstable_mockModule('../../src/schemas/spec.js', () => ({}));
jest.unstable_mockModule('../../src/schemas/test-gen.js', () => ({}));
jest.unstable_mockModule('../../src/schemas/dev.js', () => ({}));
jest.unstable_mockModule('../../src/schemas/qa.js', () => ({}));
jest.unstable_mockModule('../../src/schemas/review.js', () => ({}));
jest.unstable_mockModule('../../src/schemas/docs.js', () => ({}));

const {
  registerPhaseSchema,
  getPhaseSchema,
  getRegisteredSchemaKeys,
  clearSchemaRegistry,
  schemaToPromptDescription,
} = await import('../../src/schemas/index.js');

const { validatePhaseOutput } = await import('../../src/schemas/validation.js');

beforeEach(() => {
  clearSchemaRegistry();
});

// ============================================================================
// registerPhaseSchema + getPhaseSchema roundtrip
// ============================================================================

describe('registerPhaseSchema + getPhaseSchema', () => {
  it('should roundtrip a registered schema', () => {
    const schema = z.object({ approved: z.boolean() });
    registerPhaseSchema('new-feature', 'architect', 'Design Review', schema);

    const retrieved = getPhaseSchema('new-feature', 'architect', 'Design Review');
    expect(retrieved).toBe(schema);
  });

  it('should return undefined for unregistered keys', () => {
    const result = getPhaseSchema('new-feature', 'architect', 'Nonexistent');
    expect(result).toBeUndefined();
  });

  it('should overwrite previously registered schema for the same key', () => {
    const schema1 = z.object({ a: z.string() });
    const schema2 = z.object({ b: z.number() });

    registerPhaseSchema('bug-fix', 'dev', 'Implementation', schema1);
    registerPhaseSchema('bug-fix', 'dev', 'Implementation', schema2);

    const retrieved = getPhaseSchema('bug-fix', 'dev', 'Implementation');
    expect(retrieved).toBe(schema2);
  });
});

// ============================================================================
// getRegisteredSchemaKeys
// ============================================================================

describe('getRegisteredSchemaKeys', () => {
  it('should return empty array when registry is empty', () => {
    expect(getRegisteredSchemaKeys()).toEqual([]);
  });

  it('should return all registered keys', () => {
    registerPhaseSchema('new-feature', 'architect', 'Design Review', z.object({}));
    registerPhaseSchema('bug-fix', 'dev', 'Implementation', z.object({}));

    const keys = getRegisteredSchemaKeys();
    expect(keys).toHaveLength(2);
    expect(keys).toContain('new-feature:architect:Design Review');
    expect(keys).toContain('bug-fix:dev:Implementation');
  });
});

// ============================================================================
// clearSchemaRegistry
// ============================================================================

describe('clearSchemaRegistry', () => {
  it('should remove all registered schemas', () => {
    registerPhaseSchema('new-feature', 'architect', 'Design Review', z.object({}));
    registerPhaseSchema('bug-fix', 'dev', 'Implementation', z.object({}));

    clearSchemaRegistry();

    expect(getRegisteredSchemaKeys()).toEqual([]);
    expect(getPhaseSchema('new-feature', 'architect', 'Design Review')).toBeUndefined();
  });
});

// ============================================================================
// schemaToPromptDescription
// ============================================================================

describe('schemaToPromptDescription', () => {
  it('should convert ZodObject to Record<string, string> with "type - description" format', () => {
    const schema = z.object({
      approved: z.boolean().describe('Whether design is approved'),
      notes: z.string().describe('Design notes'),
    });

    const result = schemaToPromptDescription(schema);
    expect(result).toBeDefined();
    expect(result!['approved']).toBe('boolean - Whether design is approved');
    expect(result!['notes']).toBe('string - Design notes');
  });

  it('should return undefined for non-ZodObject schemas', () => {
    const schema = z.string();
    const result = schemaToPromptDescription(schema);
    expect(result).toBeUndefined();
  });

  it('should handle arrays correctly', () => {
    const schema = z.object({
      items: z.array(z.string()).describe('List of items'),
    });

    const result = schemaToPromptDescription(schema);
    expect(result).toBeDefined();
    expect(result!['items']).toBe('string[] - List of items');
  });

  it('should handle enums correctly', () => {
    const schema = z.object({
      verdict: z.enum(['PASSED', 'FAILED']).describe('QA verdict'),
    });

    const result = schemaToPromptDescription(schema);
    expect(result).toBeDefined();
    expect(result!['verdict']).toBe("'PASSED' | 'FAILED' - QA verdict");
  });

  it('should handle optional fields correctly', () => {
    const schema = z.object({
      name: z.string().optional().describe('Optional name'),
    });

    const result = schemaToPromptDescription(schema);
    expect(result).toBeDefined();
    expect(result!['name']).toBe('string - Optional name');
  });

  it('should handle fields without descriptions', () => {
    const schema = z.object({
      count: z.number(),
    });

    const result = schemaToPromptDescription(schema);
    expect(result).toBeDefined();
    expect(result!['count']).toBe('number');
  });

  it('should handle passthrough ZodObject schemas', () => {
    const schema = z.object({
      name: z.string().describe('Name'),
    }).passthrough();

    const result = schemaToPromptDescription(schema);
    expect(result).toBeDefined();
    expect(result!['name']).toBe('string - Name');
  });
});

// ============================================================================
// validatePhaseOutput
// ============================================================================

describe('validatePhaseOutput', () => {
  it('should return valid=true for matching output', () => {
    const schema = z.object({
      approved: z.boolean(),
      notes: z.string().optional(),
    }).passthrough();

    registerPhaseSchema('new-feature', 'architect', 'Design Review', schema);

    const result = validatePhaseOutput(
      { approved: true, notes: 'Looks good' },
      'new-feature',
      'architect',
      'Design Review',
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.schemaKey).toBe('new-feature:architect:Design Review');
    expect(result.skipped).toBeUndefined();
  });

  it('should return valid=false with error paths for mismatching output', () => {
    const schema = z.object({
      approved: z.boolean(),
      count: z.number(),
    });

    registerPhaseSchema('new-feature', 'spec', 'Specification', schema);

    const result = validatePhaseOutput(
      { approved: 'not a boolean', count: 'not a number' },
      'new-feature',
      'spec',
      'Specification',
    );

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);

    const errorPaths = result.errors.map((e) => e.path);
    expect(errorPaths).toContain('approved');
    expect(errorPaths).toContain('count');
  });

  it('should return skipped=true when no schema is registered', () => {
    const result = validatePhaseOutput(
      { anything: 'goes' },
      'new-feature',
      'architect',
      'Nonexistent Phase',
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(true);
    expect(result.schemaKey).toBe('new-feature:architect:Nonexistent Phase');
  });

  it('should include error code and message in validation errors', () => {
    const schema = z.object({
      required: z.string(),
    });

    registerPhaseSchema('bug-fix', 'dev', 'Fix', schema);

    const result = validatePhaseOutput(
      {},
      'bug-fix',
      'dev',
      'Fix',
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('required');
    expect(result.errors[0].message).toBeTruthy();
    expect(result.errors[0].code).toBeTruthy();
  });
});
