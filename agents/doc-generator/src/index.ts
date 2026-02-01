// ABOUTME: Main entry point for Doc Generator agent.
// ABOUTME: Exports extractors, generators, and type definitions.

// Type exports
export type {
  ToolDefinition,
  ParameterDefinition,
  AgentDefinition,
  WorkflowDefinition,
  PhaseDefinition,
  HookDefinition,
  DiagramSpec,
  GeneratedDoc,
  ModuleSummary,
  ApiDocsOutput,
  McpToolsExtractorResult,
  WorkflowsExtractorResult,
  AgentsExtractorResult,
  ApiDocsOptions,
  MermaidOptions,
} from './types.js';

// Extractor exports
export {
  extractMcpTools,
  extractWorkflows,
  extractAgents,
} from './extractors/index.js';

// Generator exports
export {
  generateApiDocs,
  generateMermaidDiagrams,
} from './generators/index.js';

export type { ApiDocsInput } from './generators/api-docs.js';
export type { MermaidInput } from './generators/mermaid.js';
