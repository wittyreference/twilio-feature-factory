<!-- ABOUTME: Auto-generates API documentation and Mermaid diagrams from codebase introspection. -->
<!-- ABOUTME: Covers extractors, generators, key exports, and architecture overview. -->

# Doc Generator

Auto-generates API documentation and Mermaid diagrams for Twilio Agent Factory.

**For complete reference, see [REFERENCE.md](./REFERENCE.md).**

## Purpose

The Doc Generator introspects the codebase and generates:

1. **API Documentation** - Tool definitions, parameters, examples in markdown tables
2. **Mermaid Diagrams** - Workflow pipelines, architecture overviews, agent composition

## Architecture

```
src/
├── index.ts              # Main exports
├── types.ts              # TypeScript interfaces
├── extractors/           # Source code parsing
│   ├── mcp-tools.ts      # Extract MCP tool metadata
│   ├── workflows.ts      # Extract workflow definitions
│   └── agents.ts         # Extract agent configurations
└── generators/           # Documentation generation
    ├── api-docs.ts       # Markdown documentation
    └── mermaid.ts        # Mermaid diagram code
```

## Extractors

| Extractor | Input | Output |
|-----------|-------|--------|
| `mcp-tools.ts` | `createTool()` calls | Tool names, params, modules |
| `workflows.ts` | `Workflow` objects | Phases, hooks, approvals |
| `agents.ts` | `AgentConfig` objects | Agent definitions, schemas |

## Generators

| Generator | Output |
|-----------|--------|
| `api-docs.ts` | Markdown tables (tools, agents, workflows) |
| `mermaid.ts` | Mermaid diagram code (pipeline, architecture, composition) |

## Key Exports

```typescript
// Extractors
extractMcpTools(source, filename)    // → McpToolsExtractorResult
extractWorkflows(source, filename)   // → WorkflowsExtractorResult
extractAgents(source, filename)      // → AgentsExtractorResult

// Generators
generateApiDocs({ tools, agents, workflows, options })
generateMermaidDiagrams({ workflows, agents, options })
```

## Testing

```bash
npm test              # Run unit tests
npm run test:coverage # With coverage report
```

## Related Documentation

- [REFERENCE.md](./REFERENCE.md) - Detailed extractor/generator docs, usage examples, type reference
- [Root CLAUDE.md](/CLAUDE.md) - Project standards
- [Feature Factory](/agents/feature-factory/CLAUDE.md) - Workflow definitions
- [MCP Server](/agents/mcp-servers/twilio/CLAUDE.md) - Tool implementations
