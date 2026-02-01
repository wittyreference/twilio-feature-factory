// ABOUTME: Extracts workflow definitions from TypeScript source code.
// ABOUTME: Parses Workflow objects to extract phases, hooks, and descriptions.

import type {
  WorkflowsExtractorResult,
  WorkflowDefinition,
  PhaseDefinition,
  HookDefinition,
} from '../types.js';

/**
 * Parses phase definitions from a phases array string.
 * @param phasesStr - The phases array content as string
 * @returns Array of phase definitions
 */
function parsePhases(phasesStr: string): PhaseDefinition[] {
  const phases: PhaseDefinition[] = [];

  // Match individual phase objects by finding all occurrences of { ... }
  // containing agent, name, and approvalRequired
  // Use a state machine approach to find balanced braces
  let depth = 0;
  let start = -1;
  const phaseBlocks: string[] = [];

  for (let i = 0; i < phasesStr.length; i++) {
    const char = phasesStr[i];
    if (char === '{') {
      if (depth === 0) {
        start = i;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        phaseBlocks.push(phasesStr.substring(start, i + 1));
        start = -1;
      }
    }
  }

  for (const block of phaseBlocks) {
    // Extract agent name
    const agentMatch = block.match(/agent\s*:\s*['"]([^'"]+)['"]/);
    // Extract display name
    const nameMatch = block.match(/name\s*:\s*['"]([^'"]+)['"]/);
    // Extract approvalRequired
    const approvalMatch = block.match(/approvalRequired\s*:\s*(true|false)/);
    // Extract prePhaseHooks
    const hooksMatch = block.match(/prePhaseHooks\s*:\s*\[([^\]]*)\]/);

    if (agentMatch && nameMatch && approvalMatch) {
      const phase: PhaseDefinition = {
        agent: agentMatch[1],
        name: nameMatch[1],
        approvalRequired: approvalMatch[1] === 'true',
      };

      // Parse prePhaseHooks if present
      if (hooksMatch) {
        const hookNames: string[] = [];
        const hookPattern = /['"]([^'"]+)['"]/g;
        let hookMatch;
        while ((hookMatch = hookPattern.exec(hooksMatch[1])) !== null) {
          hookNames.push(hookMatch[1]);
        }
        if (hookNames.length > 0) {
          phase.prePhaseHooks = hookNames;
        }
      }

      phases.push(phase);
    }
  }

  return phases;
}

/**
 * Extracts unique hook names from all phases.
 * @param phases - Array of phase definitions
 * @returns Array of hook definitions
 */
function extractHooksFromPhases(phases: PhaseDefinition[]): HookDefinition[] {
  const hookNames = new Set<string>();

  for (const phase of phases) {
    if (phase.prePhaseHooks) {
      for (const hook of phase.prePhaseHooks) {
        hookNames.add(hook);
      }
    }
  }

  return Array.from(hookNames).map((name) => ({
    name,
    description: getHookDescription(name),
    sourceFile: 'hooks/index.ts',
  }));
}

/**
 * Returns a description for a known hook type.
 */
function getHookDescription(hookName: string): string {
  const descriptions: Record<string, string> = {
    'tdd-enforcement': 'Verifies tests exist and FAIL before dev phase',
    'coverage-threshold': 'Enforces minimum code coverage threshold',
    'credential-safety': 'Validates no hardcoded credentials in code',
    'test-passing-enforcement': 'Verifies all tests PASS for refactor safety',
  };
  return descriptions[hookName] || `Hook: ${hookName}`;
}

/**
 * Extracts the content of a balanced bracket pair starting at startIndex.
 * @param str - The source string
 * @param startIndex - Index of the opening bracket
 * @param openBracket - Opening bracket character
 * @param closeBracket - Closing bracket character
 * @returns Content between brackets (excluding the brackets themselves)
 */
function extractBalancedContent(
  str: string,
  startIndex: number,
  openBracket: string,
  closeBracket: string
): string {
  let depth = 0;
  let start = -1;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];
    if (char === openBracket) {
      if (depth === 0) {
        start = i + 1; // Start after the opening bracket
      }
      depth++;
    } else if (char === closeBracket) {
      depth--;
      if (depth === 0) {
        return str.substring(start, i);
      }
    }
  }

  return '';
}

/**
 * Extracts workflow definitions from TypeScript source code.
 * @param sourceCode - TypeScript source code containing Workflow definitions
 * @param filename - Source filename for reference
 * @returns Extracted workflow definitions with phases and hooks
 */
export function extractWorkflows(
  sourceCode: string,
  filename: string
): WorkflowsExtractorResult {
  const workflows: WorkflowDefinition[] = [];
  const allHooks: HookDefinition[] = [];

  // First find all workflow declarations
  const workflowDeclPattern =
    /(?:export\s+)?const\s+\w+\s*:\s*Workflow\s*=\s*\{\s*name\s*:\s*['"]([^'"]+)['"]\s*,\s*description\s*:\s*['"]([^'"]+)['"]\s*,\s*phases\s*:/g;

  let match;
  while ((match = workflowDeclPattern.exec(sourceCode)) !== null) {
    const [fullMatch, name, description] = match;

    // Find the start of the phases array
    const phasesArrayStart = match.index + fullMatch.length;
    const phasesStr = extractBalancedContent(
      sourceCode,
      phasesArrayStart,
      '[',
      ']'
    );

    const phases = parsePhases(phasesStr);
    const hooks = extractHooksFromPhases(phases);

    // Add unique hooks to allHooks
    for (const hook of hooks) {
      if (!allHooks.some((h) => h.name === hook.name)) {
        allHooks.push(hook);
      }
    }

    workflows.push({
      name,
      description,
      phases,
      sourceFile: filename,
    });
  }

  return {
    workflows,
    hooks: allHooks,
  };
}
