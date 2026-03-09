// ABOUTME: Schema registry storing workflow:agent:phase → Zod schema mappings.
// ABOUTME: Separated from index.ts to avoid circular dependency with agent schema modules.

import type { z } from 'zod';

/**
 * Registry mapping "workflow:agent:phaseName" → Zod schema
 */
const schemaRegistry = new Map<string, z.ZodType>();

/**
 * Build a registry key from workflow, agent, and phase name.
 */
export function buildKey(workflow: string, agent: string, phaseName: string): string {
  return `${workflow}:${agent}:${phaseName}`;
}

/**
 * Register a Zod schema for a specific workflow/agent/phase combination.
 */
export function registerPhaseSchema(
  workflow: string,
  agent: string,
  phaseName: string,
  schema: z.ZodType
): void {
  const key = buildKey(workflow, agent, phaseName);
  schemaRegistry.set(key, schema);
}

/**
 * Retrieve a registered schema by workflow/agent/phase.
 * Returns undefined if no schema is registered.
 */
export function getPhaseSchema(
  workflow: string,
  agent: string,
  phaseName: string
): z.ZodType | undefined {
  const key = buildKey(workflow, agent, phaseName);
  return schemaRegistry.get(key);
}

/**
 * Get all registered schema keys. Useful for testing and introspection.
 */
export function getRegisteredSchemaKeys(): string[] {
  return Array.from(schemaRegistry.keys());
}

/**
 * Clear all registered schemas. Used in testing.
 */
export function clearSchemaRegistry(): void {
  schemaRegistry.clear();
}
