// ABOUTME: Type definitions for Doc Generator extractors and generators.
// ABOUTME: Defines interfaces for MCP tools, workflows, agents, and generated documentation.

/**
 * Parameter definition extracted from Zod schema
 */
export interface ParameterDefinition {
  /** Parameter name */
  name: string;
  /** TypeScript/Zod type (string, number, array, etc.) */
  type: string;
  /** Human-readable description */
  description: string;
  /** Whether the parameter is required */
  required: boolean;
  /** Default value if any */
  defaultValue?: unknown;
}

/**
 * MCP tool definition extracted from tool files
 */
export interface ToolDefinition {
  /** Tool name (e.g., 'send_sms') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tool parameters */
  parameters: ParameterDefinition[];
  /** Module/domain the tool belongs to (e.g., 'messaging', 'voice') */
  module: string;
  /** Source file path */
  sourceFile: string;
}

/**
 * Agent configuration extracted from Feature Factory
 */
export interface AgentDefinition {
  /** Agent name/type */
  name: string;
  /** Human-readable description */
  description: string;
  /** System prompt (truncated for docs) */
  systemPromptSummary: string;
  /** Tools available to this agent */
  tools: string[];
  /** Maximum turns allowed */
  maxTurns: number;
  /** Model type (sonnet, opus, haiku) */
  model?: string;
  /** Input schema field descriptions */
  inputSchema: Record<string, string>;
  /** Output schema field descriptions */
  outputSchema: Record<string, string>;
  /** Source file path */
  sourceFile: string;
}

/**
 * Workflow phase definition
 */
export interface PhaseDefinition {
  /** Agent that executes this phase */
  agent: string;
  /** Display name */
  name: string;
  /** Whether human approval is required after this phase */
  approvalRequired: boolean;
  /** Pre-phase hooks to run */
  prePhaseHooks?: string[];
}

/**
 * Workflow definition extracted from Feature Factory
 */
export interface WorkflowDefinition {
  /** Workflow name (e.g., 'new-feature') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Ordered list of phases */
  phases: PhaseDefinition[];
  /** Source file path */
  sourceFile: string;
}

/**
 * Hook definition extracted from Feature Factory
 */
export interface HookDefinition {
  /** Hook name (e.g., 'tdd-enforcement') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Source file path */
  sourceFile: string;
}

/**
 * Mermaid diagram specification
 */
export interface DiagramSpec {
  /** Diagram type */
  type: 'flowchart' | 'graph' | 'sequenceDiagram' | 'stateDiagram';
  /** Diagram title */
  title: string;
  /** Diagram direction (TB, LR, RL, BT) */
  direction?: 'TB' | 'LR' | 'RL' | 'BT';
  /** Mermaid code content */
  content: string;
}

/**
 * Generated documentation file
 */
export interface GeneratedDoc {
  /** Relative path for the output file */
  path: string;
  /** Documentation content (markdown or mermaid) */
  content: string;
  /** Type of generated documentation */
  type: 'api-reference' | 'workflow-diagram' | 'architecture-diagram' | 'agent-composition';
}

/**
 * Module summary for API docs
 */
export interface ModuleSummary {
  /** Module name (e.g., 'messaging') */
  name: string;
  /** Number of tools in this module */
  toolCount: number;
  /** Brief description */
  description?: string;
}

/**
 * API documentation output structure
 */
export interface ApiDocsOutput {
  /** Generated markdown content */
  markdown: string;
  /** Summary of modules covered */
  modules: ModuleSummary[];
  /** Total number of tools documented */
  totalTools: number;
  /** Total number of agents documented */
  totalAgents: number;
  /** Total number of workflows documented */
  totalWorkflows: number;
}

/**
 * Extractor result for MCP tools
 */
export interface McpToolsExtractorResult {
  /** Extracted tool definitions */
  tools: ToolDefinition[];
  /** Module summaries */
  modules: ModuleSummary[];
  /** Total tools extracted */
  totalCount: number;
}

/**
 * Extractor result for workflows
 */
export interface WorkflowsExtractorResult {
  /** Extracted workflow definitions */
  workflows: WorkflowDefinition[];
  /** Extracted hook definitions */
  hooks: HookDefinition[];
}

/**
 * Extractor result for agents
 */
export interface AgentsExtractorResult {
  /** Extracted agent definitions */
  agents: AgentDefinition[];
}

/**
 * Options for API docs generator
 */
export interface ApiDocsOptions {
  /** Include tool parameters in detail */
  includeParameters?: boolean;
  /** Include source file paths */
  includeSourcePaths?: boolean;
  /** Maximum description length before truncation */
  maxDescriptionLength?: number;
}

/**
 * Options for Mermaid generator
 */
export interface MermaidOptions {
  /** Diagram direction */
  direction?: 'TB' | 'LR' | 'RL' | 'BT';
  /** Include subgraphs */
  includeSubgraphs?: boolean;
  /** Theme (default, dark, forest, neutral) */
  theme?: 'default' | 'dark' | 'forest' | 'neutral';
}
