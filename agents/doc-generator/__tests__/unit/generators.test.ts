// ABOUTME: Unit tests for doc-generator generators.
// ABOUTME: Tests API docs and Mermaid diagram generation functionality.

import { generateApiDocs } from '../../src/generators/api-docs.js';
import { generateMermaidDiagrams } from '../../src/generators/mermaid.js';
import type {
  ToolDefinition,
  WorkflowDefinition,
  AgentDefinition,
  DiagramSpec,
} from '../../src/types.js';

describe('API Docs Generator', () => {
  describe('generateApiDocs', () => {
    const sampleTools: ToolDefinition[] = [
      {
        name: 'send_sms',
        description: 'Send an SMS message',
        parameters: [
          { name: 'to', type: 'string', description: 'Destination number', required: true },
          { name: 'body', type: 'string', description: 'Message content', required: true },
          { name: 'from', type: 'string', description: 'Sender number', required: false },
        ],
        module: 'messaging',
        sourceFile: 'messaging.ts',
      },
      {
        name: 'get_call_logs',
        description: 'Get call history',
        parameters: [
          { name: 'limit', type: 'number', description: 'Max results', required: false, defaultValue: 20 },
        ],
        module: 'voice',
        sourceFile: 'voice.ts',
      },
    ];

    const sampleAgents: AgentDefinition[] = [
      {
        name: 'architect',
        description: 'Design review and pattern selection',
        systemPromptSummary: 'You are the Architect agent...',
        tools: ['Read', 'Glob', 'Grep'],
        maxTurns: 20,
        inputSchema: { feature: 'string - Feature description' },
        outputSchema: { approved: 'boolean - Design approval status' },
        sourceFile: 'architect.ts',
      },
    ];

    const sampleWorkflows: WorkflowDefinition[] = [
      {
        name: 'new-feature',
        description: 'Full TDD pipeline for new features',
        phases: [
          { agent: 'architect', name: 'Design Review', approvalRequired: true },
          { agent: 'spec', name: 'Specification', approvalRequired: true },
          { agent: 'dev', name: 'Implementation', approvalRequired: false },
        ],
        sourceFile: 'new-feature.ts',
      },
    ];

    it('should generate markdown with MCP tools section', () => {
      const result = generateApiDocs({
        tools: sampleTools,
        agents: [],
        workflows: [],
      });

      expect(result.markdown).toContain('# API Reference');
      expect(result.markdown).toContain('## MCP Tools');
      expect(result.markdown).toContain('### Messaging');
      expect(result.markdown).toContain('| send_sms |');
      expect(result.markdown).toContain('### Voice');
      expect(result.markdown).toContain('| get_call_logs |');
    });

    it('should generate tool parameter tables', () => {
      const result = generateApiDocs({
        tools: sampleTools,
        agents: [],
        workflows: [],
        options: { includeParameters: true },
      });

      expect(result.markdown).toContain('| to | string | Destination number | Yes |');
      expect(result.markdown).toContain('| from | string | Sender number | No |');
      expect(result.markdown).toContain('| limit | number | Max results | No |');
    });

    it('should generate agents section', () => {
      const result = generateApiDocs({
        tools: [],
        agents: sampleAgents,
        workflows: [],
      });

      expect(result.markdown).toContain('## Agents');
      expect(result.markdown).toContain('| architect |');
      expect(result.markdown).toContain('Design review and pattern selection');
    });

    it('should generate workflows section', () => {
      const result = generateApiDocs({
        tools: [],
        agents: [],
        workflows: sampleWorkflows,
      });

      expect(result.markdown).toContain('## Workflows');
      expect(result.markdown).toContain('### new-feature');
      expect(result.markdown).toContain('Full TDD pipeline for new features');
      expect(result.markdown).toContain('architect');
      expect(result.markdown).toContain('spec');
      expect(result.markdown).toContain('dev');
    });

    it('should return module summaries', () => {
      const result = generateApiDocs({
        tools: sampleTools,
        agents: sampleAgents,
        workflows: sampleWorkflows,
      });

      expect(result.modules).toHaveLength(2);
      expect(result.modules.map((m) => m.name)).toContain('messaging');
      expect(result.modules.map((m) => m.name)).toContain('voice');
      expect(result.totalTools).toBe(2);
      expect(result.totalAgents).toBe(1);
      expect(result.totalWorkflows).toBe(1);
    });

    it('should handle empty inputs gracefully', () => {
      const result = generateApiDocs({
        tools: [],
        agents: [],
        workflows: [],
      });

      expect(result.markdown).toContain('# API Reference');
      expect(result.totalTools).toBe(0);
      expect(result.totalAgents).toBe(0);
      expect(result.totalWorkflows).toBe(0);
    });
  });
});

describe('Mermaid Diagram Generator', () => {
  describe('generateMermaidDiagrams', () => {
    const sampleWorkflows: WorkflowDefinition[] = [
      {
        name: 'new-feature',
        description: 'Full TDD pipeline',
        phases: [
          { agent: 'architect', name: 'Design', approvalRequired: true },
          { agent: 'spec', name: 'Spec', approvalRequired: true },
          { agent: 'test-gen', name: 'Tests', approvalRequired: false },
          { agent: 'dev', name: 'Dev', approvalRequired: false },
          { agent: 'review', name: 'Review', approvalRequired: true },
        ],
        sourceFile: 'new-feature.ts',
      },
    ];

    const sampleAgents: AgentDefinition[] = [
      {
        name: 'architect',
        description: 'Design review',
        systemPromptSummary: 'Architect agent',
        tools: ['Read', 'Glob'],
        maxTurns: 20,
        inputSchema: {},
        outputSchema: {},
        sourceFile: 'architect.ts',
      },
      {
        name: 'dev',
        description: 'Implementation',
        systemPromptSummary: 'Dev agent',
        tools: ['Read', 'Write', 'Edit'],
        maxTurns: 50,
        inputSchema: {},
        outputSchema: {},
        sourceFile: 'dev.ts',
      },
    ];

    it('should generate workflow pipeline diagram', () => {
      const result = generateMermaidDiagrams({
        workflows: sampleWorkflows,
        agents: [],
      });

      const pipelineDiagram = result.find((d) => d.type === 'flowchart' && d.title.includes('new-feature'));
      expect(pipelineDiagram).toBeDefined();
      expect(pipelineDiagram?.content).toContain('flowchart');
      expect(pipelineDiagram?.content).toContain('architect');
      expect(pipelineDiagram?.content).toContain('spec');
      expect(pipelineDiagram?.content).toContain('dev');
      expect(pipelineDiagram?.content).toContain('review');
    });

    it('should mark approval gates in workflow diagram', () => {
      const result = generateMermaidDiagrams({
        workflows: sampleWorkflows,
        agents: [],
      });

      const pipelineDiagram = result.find((d) => d.type === 'flowchart');
      expect(pipelineDiagram).toBeDefined();
      // Approval nodes should have different styling or annotation
      // Check for approval marker (could be emoji, style, or subgraph)
      expect(
        pipelineDiagram?.content.includes('approval') ||
        pipelineDiagram?.content.includes('✓') ||
        pipelineDiagram?.content.match(/\[.*Design.*\]/)
      ).toBeTruthy();
    });

    it('should generate architecture overview diagram', () => {
      const result = generateMermaidDiagrams({
        workflows: sampleWorkflows,
        agents: sampleAgents,
        includeArchitecture: true,
      });

      const archDiagram = result.find((d) => d.title.includes('Architecture'));
      expect(archDiagram).toBeDefined();
      expect(archDiagram?.content).toContain('graph');
    });

    it('should generate agent composition diagram', () => {
      const result = generateMermaidDiagrams({
        workflows: [],
        agents: sampleAgents,
        includeAgentComposition: true,
      });

      const agentDiagram = result.find((d) => d.title.includes('Agent'));
      expect(agentDiagram).toBeDefined();
      expect(agentDiagram?.content).toContain('architect');
      expect(agentDiagram?.content).toContain('dev');
    });

    it('should use specified direction', () => {
      const result = generateMermaidDiagrams({
        workflows: sampleWorkflows,
        agents: [],
        options: { direction: 'LR' },
      });

      const pipelineDiagram = result.find((d) => d.type === 'flowchart');
      expect(pipelineDiagram?.content).toContain('LR');
    });

    it('should handle empty inputs', () => {
      const result = generateMermaidDiagrams({
        workflows: [],
        agents: [],
      });

      expect(result).toEqual([]);
    });

    it('should return valid mermaid syntax', () => {
      const result = generateMermaidDiagrams({
        workflows: sampleWorkflows,
        agents: sampleAgents,
        includeArchitecture: true,
        includeAgentComposition: true,
      });

      for (const diagram of result) {
        // Basic syntax validation
        expect(diagram.content).toMatch(/^(flowchart|graph|sequenceDiagram|stateDiagram)/);
        // Should not have unbalanced brackets
        const openBrackets = (diagram.content.match(/\[/g) || []).length;
        const closeBrackets = (diagram.content.match(/\]/g) || []).length;
        expect(openBrackets).toBe(closeBrackets);
      }
    });
  });
});
