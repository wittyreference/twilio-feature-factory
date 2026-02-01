// ABOUTME: Generates API documentation markdown from extracted metadata.
// ABOUTME: Produces tables for MCP tools, agents, and workflows.

import type {
  ToolDefinition,
  AgentDefinition,
  WorkflowDefinition,
  ApiDocsOutput,
  ApiDocsOptions,
  ModuleSummary,
} from '../types.js';

/**
 * Input for API documentation generation
 */
export interface ApiDocsInput {
  /** Extracted MCP tool definitions */
  tools: ToolDefinition[];
  /** Extracted agent definitions */
  agents: AgentDefinition[];
  /** Extracted workflow definitions */
  workflows: WorkflowDefinition[];
  /** Generation options */
  options?: ApiDocsOptions;
}

/**
 * Groups tools by module name.
 */
function groupToolsByModule(tools: ToolDefinition[]): Map<string, ToolDefinition[]> {
  const groups = new Map<string, ToolDefinition[]>();
  for (const tool of tools) {
    const existing = groups.get(tool.module) || [];
    existing.push(tool);
    groups.set(tool.module, existing);
  }
  return groups;
}

/**
 * Generates the MCP tools section of the documentation.
 */
function generateToolsSection(
  tools: ToolDefinition[],
  includeParameters: boolean
): string {
  if (tools.length === 0) return '';

  const lines: string[] = ['## MCP Tools', ''];

  const toolsByModule = groupToolsByModule(tools);

  for (const [moduleName, moduleTools] of toolsByModule) {
    // Capitalize module name for heading
    const heading = moduleName.charAt(0).toUpperCase() + moduleName.slice(1);
    lines.push(`### ${heading}`, '');

    // Tool summary table
    lines.push('| Tool | Description |');
    lines.push('|------|-------------|');

    for (const tool of moduleTools) {
      lines.push(`| ${tool.name} | ${tool.description} |`);
    }
    lines.push('');

    // Parameter details if requested
    if (includeParameters) {
      for (const tool of moduleTools) {
        if (tool.parameters.length > 0) {
          lines.push(`#### ${tool.name} Parameters`, '');
          lines.push('| Parameter | Type | Description | Required |');
          lines.push('|-----------|------|-------------|----------|');

          for (const param of tool.parameters) {
            const required = param.required ? 'Yes' : 'No';
            lines.push(`| ${param.name} | ${param.type} | ${param.description} | ${required} |`);
          }
          lines.push('');
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generates the agents section of the documentation.
 */
function generateAgentsSection(agents: AgentDefinition[]): string {
  if (agents.length === 0) return '';

  const lines: string[] = ['## Agents', ''];

  lines.push('| Agent | Description | Tools | Max Turns |');
  lines.push('|-------|-------------|-------|-----------|');

  for (const agent of agents) {
    const toolsList = agent.tools.slice(0, 3).join(', ');
    const toolsDisplay = agent.tools.length > 3 ? `${toolsList}, ...` : toolsList;
    lines.push(`| ${agent.name} | ${agent.description} | ${toolsDisplay} | ${agent.maxTurns} |`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Generates the workflows section of the documentation.
 */
function generateWorkflowsSection(workflows: WorkflowDefinition[]): string {
  if (workflows.length === 0) return '';

  const lines: string[] = ['## Workflows', ''];

  for (const workflow of workflows) {
    lines.push(`### ${workflow.name}`, '');
    lines.push(workflow.description, '');

    lines.push('**Phases:**', '');
    lines.push('| Phase | Agent | Approval Required |');
    lines.push('|-------|-------|-------------------|');

    for (const phase of workflow.phases) {
      const approval = phase.approvalRequired ? 'Yes' : 'No';
      lines.push(`| ${phase.name} | ${phase.agent} | ${approval} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generates API documentation markdown from extracted metadata.
 * @param input - Tools, agents, and workflows to document
 * @returns Generated markdown and metadata
 */
export function generateApiDocs(input: ApiDocsInput): ApiDocsOutput {
  const { tools, agents, workflows, options = {} } = input;
  const { includeParameters = false } = options;

  const sections: string[] = ['# API Reference', ''];

  // Generate each section
  const toolsSection = generateToolsSection(tools, includeParameters);
  if (toolsSection) sections.push(toolsSection);

  const agentsSection = generateAgentsSection(agents);
  if (agentsSection) sections.push(agentsSection);

  const workflowsSection = generateWorkflowsSection(workflows);
  if (workflowsSection) sections.push(workflowsSection);

  const markdown = sections.join('\n');

  // Calculate module summaries
  const toolsByModule = groupToolsByModule(tools);
  const modules: ModuleSummary[] = Array.from(toolsByModule.entries()).map(([name, moduleTools]) => ({
    name,
    toolCount: moduleTools.length,
  }));

  return {
    markdown,
    modules,
    totalTools: tools.length,
    totalAgents: agents.length,
    totalWorkflows: workflows.length,
  };
}
