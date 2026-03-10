<!-- ABOUTME: Complete reference for Doc Generator extractors, generators, and usage patterns. -->
<!-- ABOUTME: Companion to CLAUDE.md — contains full code examples, type definitions, and diagram samples. -->

# Doc Generator Reference

For architecture overview and quick reference, see [CLAUDE.md](./CLAUDE.md).

## Extractor Details

### mcp-tools.ts

Parses MCP tool files to extract:
- Tool name and description
- Parameter definitions (name, type, required, default)
- Module groupings

**Input:** TypeScript source code with `createTool()` calls
**Output:** `McpToolsExtractorResult` with tools and module summaries

### workflows.ts

Parses Feature Factory workflow files to extract:
- Workflow name and description
- Phase definitions (agent, name, approvalRequired)
- Pre-phase hooks

**Input:** TypeScript source code with `Workflow` objects
**Output:** `WorkflowsExtractorResult` with workflows and hooks

### agents.ts

Parses Feature Factory agent configuration files to extract:
- Agent name and description
- System prompt summary
- Tools, maxTurns, model
- Input/output schemas

**Input:** TypeScript source code with `AgentConfig` objects
**Output:** `AgentsExtractorResult` with agent definitions

## Generator Output Examples

### api-docs.ts

Generates markdown documentation:

```markdown
# API Reference

## MCP Tools

### Messaging
| Tool | Description |
|------|-------------|
| send_sms | Send an SMS message |

#### send_sms Parameters
| Parameter | Type | Description | Required |
|-----------|------|-------------|----------|
| to | string | Destination number | Yes |

## Agents
| Agent | Description | Tools | Max Turns |
|-------|-------------|-------|-----------|
| architect | Design review | Read, Glob, Grep | 20 |

## Workflows
### new-feature
Full TDD pipeline for new features

**Phases:**
| Phase | Agent | Approval Required |
|-------|-------|-------------------|
| Design Review | architect | Yes |
```

### mermaid.ts

Generates Mermaid diagram code:

**Workflow Pipeline:**
```mermaid
flowchart LR
    architect{{Design Review}}
    architect --> spec
    spec{{Specification}}
    spec --> test_gen
    test_gen[Tests]
```

**Architecture Overview:**
```mermaid
graph TB
    subgraph Orchestration
        CC[Claude Code]
    end
    subgraph Agents
        architect[architect]
        dev[dev]
    end
    CC --> Agents
```

**Agent Composition:**
```mermaid
graph TB
    FF[Feature Factory]
    architect[architect]
    FF --> architect
    architect -.- tools_architect((Read, Glob, Grep))
```

## Usage

```typescript
import {
  extractMcpTools,
  extractWorkflows,
  extractAgents,
  generateApiDocs,
  generateMermaidDiagrams,
} from '@twilio-feature-factory/doc-generator';
import { readFileSync } from 'fs';

// Extract from source files
const toolsSource = readFileSync('agents/mcp-servers/twilio/src/tools/messaging.ts', 'utf-8');
const toolsResult = extractMcpTools(toolsSource, 'messaging.ts');

const workflowSource = readFileSync('agents/feature-factory/src/workflows/new-feature.ts', 'utf-8');
const workflowResult = extractWorkflows(workflowSource, 'new-feature.ts');

const agentSource = readFileSync('agents/feature-factory/src/agents/architect.ts', 'utf-8');
const agentResult = extractAgents(agentSource, 'architect.ts');

// Generate documentation
const apiDocs = generateApiDocs({
  tools: toolsResult.tools,
  agents: agentResult.agents,
  workflows: workflowResult.workflows,
  options: { includeParameters: true },
});

console.log(apiDocs.markdown);
console.log(`Total: ${apiDocs.totalTools} tools, ${apiDocs.totalAgents} agents`);

// Generate diagrams
const diagrams = generateMermaidDiagrams({
  workflows: workflowResult.workflows,
  agents: agentResult.agents,
  includeArchitecture: true,
  includeAgentComposition: true,
  options: { direction: 'LR' },
});

for (const diagram of diagrams) {
  console.log(`\n## ${diagram.title}\n`);
  console.log('```mermaid');
  console.log(diagram.content);
  console.log('```');
}
```

## Type Reference

### Core Types

| Type | Purpose |
|------|---------|
| `ToolDefinition` | MCP tool metadata |
| `AgentDefinition` | Agent configuration |
| `WorkflowDefinition` | Workflow with phases |
| `PhaseDefinition` | Workflow phase |
| `DiagramSpec` | Mermaid diagram output |

### Options

| Type | Purpose |
|------|---------|
| `ApiDocsOptions` | Configure API docs generation |
| `MermaidOptions` | Configure diagram generation |
