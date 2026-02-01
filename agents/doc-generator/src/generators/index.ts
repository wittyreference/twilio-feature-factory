// ABOUTME: Re-exports all generator functions.
// ABOUTME: Provides unified access to API docs and Mermaid generators.

export { generateApiDocs } from './api-docs.js';
export type { ApiDocsInput } from './api-docs.js';

export { generateMermaidDiagrams } from './mermaid.js';
export type { MermaidInput } from './mermaid.js';
