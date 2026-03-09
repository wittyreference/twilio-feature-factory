// ABOUTME: Schema barrel file — re-exports registry, prompt description, and agent schemas.
// ABOUTME: Agent schemas are imported for side effects (registration) at the bottom.

import type { z } from 'zod';

// Re-export registry functions (the Map lives in registry.ts to avoid circular deps)
export {
  registerPhaseSchema,
  getPhaseSchema,
  getRegisteredSchemaKeys,
  clearSchemaRegistry,
} from './registry.js';

/**
 * Convert a Zod object schema to a Record<string, string> for agent prompts.
 * Produces the same format as the legacy AgentConfig.outputSchema —
 * each key maps to a human-readable type + description string.
 *
 * Falls back gracefully: if the schema isn't a ZodObject, returns undefined
 * so callers can fall back to the legacy outputSchema.
 */
export function schemaToPromptDescription(
  schema: z.ZodType
): Record<string, string> | undefined {
  // Access the internal Zod shape — works for ZodObject
  const shape = getZodShape(schema);
  if (!shape) {
    return undefined;
  }

  const result: Record<string, string> = {};

  for (const [key, fieldSchema] of Object.entries(shape)) {
    result[key] = describeZodField(fieldSchema as z.ZodType);
  }

  return result;
}

/**
 * Extract the shape from a Zod schema, unwrapping wrappers like ZodEffects.
 */
function getZodShape(schema: z.ZodType): Record<string, z.ZodType> | undefined {
  // Direct ZodObject
  if ('shape' in schema && typeof schema.shape === 'object') {
    return schema.shape as Record<string, z.ZodType>;
  }

  // ZodEffects wrapping a ZodObject (from .passthrough(), .strict(), etc.)
  if ('_def' in schema) {
    const def = (schema as unknown as { _def: Record<string, unknown> })._def;
    if ('innerType' in def && def.innerType) {
      return getZodShape(def.innerType as z.ZodType);
    }
    if ('schema' in def && def.schema) {
      return getZodShape(def.schema as z.ZodType);
    }
  }

  return undefined;
}

/**
 * Generate a human-readable description for a single Zod field.
 * Format: "type - description" matching the existing outputSchema format.
 */
function describeZodField(schema: z.ZodType): string {
  const description = schema.description || '';
  const typeStr = inferZodTypeName(schema);

  if (description) {
    return `${typeStr} - ${description}`;
  }
  return typeStr;
}

/**
 * Infer a human-readable type name from a Zod schema.
 */
function inferZodTypeName(schema: z.ZodType): string {
  const def = (schema as unknown as { _def: Record<string, unknown> })._def;
  const typeName = def?.typeName as string | undefined;

  switch (typeName) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodArray': {
      const innerType = def?.type as z.ZodType | undefined;
      if (innerType) {
        return `${inferZodTypeName(innerType)}[]`;
      }
      return 'unknown[]';
    }
    case 'ZodObject':
      return 'object';
    case 'ZodEnum': {
      const values = def?.values as string[] | undefined;
      if (values) {
        return values.map(v => `'${v}'`).join(' | ');
      }
      return 'string';
    }
    case 'ZodOptional': {
      const innerType = def?.innerType as z.ZodType | undefined;
      if (innerType) {
        return inferZodTypeName(innerType);
      }
      return 'unknown';
    }
    case 'ZodNullable': {
      const innerType = def?.innerType as z.ZodType | undefined;
      if (innerType) {
        return `${inferZodTypeName(innerType)} | null`;
      }
      return 'unknown | null';
    }
    case 'ZodRecord':
      return 'object';
    case 'ZodUnion':
      return 'string';
    default:
      return 'unknown';
  }
}

// Re-export fragments for convenience
export {
  qaVerdictSchema,
  reviewVerdictSchema,
  testResultFields,
  testFileRefSchema,
  coverageGapSchema,
  securityIssueSchema,
  reviewIssueSchema,
  docProtocolFields,
  fileTrackingFields,
} from './fragments.js';

// Re-export validation
export { validatePhaseOutput } from './validation.js';

// Import and register all agent schemas at module load time
// These are imported for their side effects (registration calls)
import './architect.js';
import './spec.js';
import './test-gen.js';
import './dev.js';
import './qa.js';
import './review.js';
import './docs.js';
