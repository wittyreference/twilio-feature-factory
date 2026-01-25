// ABOUTME: Hook infrastructure for Feature Factory.
// ABOUTME: Provides pre-phase hooks for TDD enforcement, credential safety, etc.

import type { HookConfig, HookType, HookContext, HookResult } from '../types.js';
import { tddEnforcementHook } from './tdd-enforcement.js';

/**
 * Registry of all available hooks
 */
const hookRegistry: Map<HookType, HookConfig> = new Map([
  ['tdd-enforcement', tddEnforcementHook],
]);

/**
 * Get a hook configuration by name
 */
export function getHook(hookType: HookType): HookConfig | undefined {
  return hookRegistry.get(hookType);
}

/**
 * Execute a hook and return the result
 */
export async function executeHook(
  hookType: HookType,
  context: HookContext
): Promise<HookResult> {
  const hook = hookRegistry.get(hookType);

  if (!hook) {
    return {
      passed: false,
      error: `Unknown hook: ${hookType}`,
    };
  }

  try {
    return await hook.execute(context);
  } catch (error) {
    return {
      passed: false,
      error: `Hook ${hookType} threw an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * List all available hooks
 */
export function listHooks(): HookConfig[] {
  return Array.from(hookRegistry.values());
}

/**
 * Check if a hook exists
 */
export function hasHook(hookType: HookType): boolean {
  return hookRegistry.has(hookType);
}

// Re-export the individual hooks for direct use
export { tddEnforcementHook } from './tdd-enforcement.js';

// Re-export credential safety validation (tool-level, not pre-phase)
export {
  validateCredentials,
  shouldSkipValidation,
} from './credential-safety.js';
export type {
  CredentialViolation,
  CredentialValidationResult,
} from './credential-safety.js';

// Export types
export type { HookConfig, HookType, HookContext, HookResult } from '../types.js';
