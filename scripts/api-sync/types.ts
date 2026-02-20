// ABOUTME: Shared TypeScript interfaces for the API drift detection pipeline.
// ABOUTME: Defines normalized endpoint, tool inventory, mapping, and report structures.

/**
 * A single parameter definition extracted from an OpenAPI spec.
 */
export interface ParamDef {
  name: string;
  in: 'path' | 'query' | 'body';
  required: boolean;
  type: string;
  description: string;
}

/**
 * A normalized endpoint extracted from a Twilio OpenAPI spec file.
 * The composite key is "domain:method:path".
 */
export interface OaiEndpoint {
  domain: string;
  path: string;
  method: string;
  operationId: string;
  summary: string;
  deprecated: boolean;
  parameters: ParamDef[];
  requestBody: ParamDef[];
}

/**
 * A versioned snapshot of the full OAI API surface for tracked domains.
 */
export interface OaiSnapshot {
  version: string;
  fetchedAt: string;
  endpointCount: number;
  domainCounts: Record<string, number>;
  endpoints: Record<string, OaiEndpoint>;
}

/**
 * An MCP tool extracted from the project's tool source files.
 */
export interface ToolInventoryEntry {
  name: string;
  file: string;
  sdkCalls: string[];
  params: string[];
}

/**
 * A mapping from one MCP tool to one or more OAI endpoints.
 */
export interface ToolMapping {
  endpoints: string[];
  sdkPath: string;
}

/**
 * The full tool-endpoint mapping file structure.
 * Keys are MCP tool names, values describe their OAI endpoint mapping.
 */
export type ToolEndpointMap = Record<string, ToolMapping>;

/**
 * A changelog entry extracted from CHANGES.md.
 */
export interface ChangelogEntry {
  version: string;
  date: string;
  domain: string;
  description: string;
  isBreaking: boolean;
}

/**
 * Parameter drift for a specific MCP tool.
 */
export interface ToolParamDrift {
  toolName: string;
  toolFile: string;
  endpoint: string;
  newParams: ParamDef[];
  removedParams: ParamDef[];
  suggestedAction: string;
}

/**
 * A parameter change between two OAI snapshot versions.
 */
export interface ParamChange {
  endpointKey: string;
  domain: string;
  path: string;
  method: string;
  addedParams: ParamDef[];
  removedParams: ParamDef[];
}

/**
 * Version tracking for OAI, CLI, and SDK.
 */
export interface SyncState {
  oai: { version: string; syncedAt: string };
  cli: { version: string; syncedAt: string };
  sdk: { version: string; syncedAt: string };
}

/**
 * Coverage analysis results: how much of the OAI surface our MCP tools cover.
 */
export interface CoverageAnalysis {
  totalOaiEndpoints: number;
  mappedEndpoints: number;
  mappedTools: number;
  unmappedEndpoints: OaiEndpoint[];
  toolsWithParamDrift: ToolParamDrift[];
  coveragePercent: number;
  domainCoverage: Record<string, { total: number; mapped: number; percent: number }>;
}

/**
 * The full drift report combining version diff and coverage analysis.
 */
export interface DriftReport {
  oaiVersion: string;
  previousVersion: string;
  generatedAt: string;
  cliVersion: string;
  sdkVersion: string;
  sdkPinned: string;

  newEndpoints: OaiEndpoint[];
  removedEndpoints: OaiEndpoint[];
  parameterChanges: ParamChange[];
  breakingChanges: ChangelogEntry[];

  coverage: CoverageAnalysis;

  summary: {
    totalEndpoints: number;
    newCount: number;
    removedCount: number;
    paramChangedCount: number;
    breakingCount: number;
    coveragePercent: number;
  };
}
