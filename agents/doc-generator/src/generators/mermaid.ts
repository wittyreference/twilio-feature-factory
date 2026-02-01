// ABOUTME: Generates Mermaid diagrams from extracted metadata.
// ABOUTME: Produces workflow pipelines, architecture overviews, and agent compositions.

import type {
  WorkflowDefinition,
  AgentDefinition,
  DiagramSpec,
  MermaidOptions,
} from '../types.js';

/**
 * Input for Mermaid diagram generation
 */
export interface MermaidInput {
  /** Extracted workflow definitions */
  workflows: WorkflowDefinition[];
  /** Extracted agent definitions */
  agents: AgentDefinition[];
  /** Include architecture overview diagram */
  includeArchitecture?: boolean;
  /** Include agent composition diagram */
  includeAgentComposition?: boolean;
  /** Generation options */
  options?: MermaidOptions;
}

/**
 * Generates a workflow pipeline diagram.
 */
function generateWorkflowDiagram(
  workflow: WorkflowDefinition,
  direction: string
): DiagramSpec {
  const lines: string[] = [`flowchart ${direction}`];

  // Generate nodes for each phase
  for (let i = 0; i < workflow.phases.length; i++) {
    const phase = workflow.phases[i];
    const nodeId = phase.agent.replace(/-/g, '_');

    // Use different shapes for approval vs non-approval phases
    if (phase.approvalRequired) {
      // Hexagon shape for approval gates
      lines.push(`    ${nodeId}{{${phase.name} ✓}}`);
    } else {
      // Rectangle for regular phases
      lines.push(`    ${nodeId}[${phase.name}]`);
    }

    // Connect to next phase
    if (i < workflow.phases.length - 1) {
      const nextPhase = workflow.phases[i + 1];
      const nextNodeId = nextPhase.agent.replace(/-/g, '_');
      lines.push(`    ${nodeId} --> ${nextNodeId}`);
    }
  }

  return {
    type: 'flowchart',
    title: `Workflow: ${workflow.name}`,
    direction: direction as 'TB' | 'LR' | 'RL' | 'BT',
    content: lines.join('\n'),
  };
}

/**
 * Generates an architecture overview diagram.
 */
function generateArchitectureDiagram(
  workflows: WorkflowDefinition[],
  agents: AgentDefinition[],
  direction: string
): DiagramSpec {
  const lines: string[] = [`graph ${direction}`];

  // Main orchestrator
  lines.push('    subgraph Orchestration');
  lines.push('        CC[Claude Code]');
  lines.push('    end');

  // Agent subgraph
  if (agents.length > 0) {
    lines.push('    subgraph Agents');
    for (const agent of agents) {
      const nodeId = agent.name.replace(/-/g, '_');
      lines.push(`        ${nodeId}[${agent.name}]`);
    }
    lines.push('    end');

    // Connect orchestrator to agents
    lines.push('    CC --> Agents');
  }

  // Workflow subgraph
  if (workflows.length > 0) {
    lines.push('    subgraph Workflows');
    for (const workflow of workflows) {
      const nodeId = workflow.name.replace(/-/g, '_');
      lines.push(`        ${nodeId}[${workflow.name}]`);
    }
    lines.push('    end');
  }

  return {
    type: 'graph',
    title: 'Architecture Overview',
    direction: direction as 'TB' | 'LR' | 'RL' | 'BT',
    content: lines.join('\n'),
  };
}

/**
 * Generates an agent composition diagram.
 */
function generateAgentCompositionDiagram(
  agents: AgentDefinition[],
  direction: string
): DiagramSpec {
  const lines: string[] = [`graph ${direction}`];

  lines.push('    FF[Feature Factory]');

  for (const agent of agents) {
    const nodeId = agent.name.replace(/-/g, '_');
    lines.push(`    ${nodeId}[${agent.name}]`);
    lines.push(`    FF --> ${nodeId}`);

    // Add tool subgraph for each agent if they have tools
    if (agent.tools.length > 0) {
      const toolsPreview = agent.tools.slice(0, 3).join(', ');
      lines.push(`    ${nodeId} -.- tools_${nodeId}((${toolsPreview}))`);
    }
  }

  return {
    type: 'graph',
    title: 'Agent Composition',
    direction: direction as 'TB' | 'LR' | 'RL' | 'BT',
    content: lines.join('\n'),
  };
}

/**
 * Generates Mermaid diagrams from extracted metadata.
 * @param input - Workflows and agents to visualize
 * @returns Array of diagram specifications
 */
export function generateMermaidDiagrams(input: MermaidInput): DiagramSpec[] {
  const {
    workflows,
    agents,
    includeArchitecture = false,
    includeAgentComposition = false,
    options = {},
  } = input;

  const direction = options.direction || 'TB';
  const diagrams: DiagramSpec[] = [];

  // Generate workflow pipeline diagrams
  for (const workflow of workflows) {
    diagrams.push(generateWorkflowDiagram(workflow, direction));
  }

  // Generate architecture overview if requested
  if (includeArchitecture && (workflows.length > 0 || agents.length > 0)) {
    diagrams.push(generateArchitectureDiagram(workflows, agents, direction));
  }

  // Generate agent composition if requested
  if (includeAgentComposition && agents.length > 0) {
    diagrams.push(generateAgentCompositionDiagram(agents, direction));
  }

  return diagrams;
}
