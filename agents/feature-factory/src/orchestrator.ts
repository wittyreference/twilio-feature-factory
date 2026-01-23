// ABOUTME: Core orchestrator for Feature Factory workflows.
// ABOUTME: Coordinates subagents in TDD-enforced development pipelines.

import Anthropic from '@anthropic-ai/sdk';
import type {
  FeatureFactoryConfig} from './config.js';
import {
  createConfig,
  validateConfig,
  configFromEnv,
} from './config.js';
import type {
  AgentConfig,
  AgentContext,
  AgentResult,
  AgentType,
  WorkflowEvent,
  WorkflowState,
  WorkflowType,
} from './types.js';
import { getWorkflow } from './workflows/index.js';
import { getAgentConfig } from './agents/index.js';

/**
 * Feature Factory Orchestrator
 *
 * Coordinates specialized subagents in TDD-enforced development pipelines.
 * Human approval is requested at configured checkpoints.
 */
export class FeatureFactoryOrchestrator {
  private config: FeatureFactoryConfig;
  private client: Anthropic;
  private state: WorkflowState | null = null;

  constructor(options: Partial<FeatureFactoryConfig> = {}) {
    // Merge environment config with provided options
    const envConfig = configFromEnv();
    this.config = createConfig({ ...envConfig, ...options });
    validateConfig(this.config);

    // Initialize Anthropic client
    this.client = new Anthropic();
  }

  /**
   * Run a workflow and yield events as it progresses
   */
  async *runWorkflow(
    workflowType: WorkflowType,
    description: string
  ): AsyncGenerator<WorkflowEvent> {
    const workflow = getWorkflow(workflowType);

    // Initialize state
    this.state = {
      workflow: workflowType,
      description,
      currentPhaseIndex: 0,
      status: 'running',
      phaseResults: {},
      totalCostUsd: 0,
      totalTurns: 0,
      startedAt: new Date(),
    };

    // Emit workflow started event
    yield {
      type: 'workflow-started',
      workflow: workflowType,
      description,
      totalPhases: workflow.phases.length,
      timestamp: new Date(),
    };

    try {
      // Execute each phase
      for (let i = 0; i < workflow.phases.length; i++) {
        const phase = workflow.phases[i];
        this.state.currentPhaseIndex = i;

        // Check budget
        if (this.state.totalCostUsd >= this.config.maxBudgetUsd) {
          yield {
            type: 'workflow-error',
            phase: phase.name,
            error: `Budget exceeded: $${this.state.totalCostUsd.toFixed(2)} of $${this.config.maxBudgetUsd.toFixed(2)}`,
            recoverable: false,
            timestamp: new Date(),
          };
          this.state.status = 'failed';
          this.state.error = 'Budget exceeded';
          return;
        }

        // Emit phase started
        yield {
          type: 'phase-started',
          phase: phase.name,
          agent: phase.agent,
          phaseIndex: i,
          totalPhases: workflow.phases.length,
          timestamp: new Date(),
        };

        // Build context for agent
        const context: AgentContext = {
          featureDescription: description,
          workingDirectory: this.config.workingDirectory,
          previousPhaseResults: this.state.phaseResults,
          additionalContext: phase.nextPhaseInput
            ? JSON.stringify(
                phase.nextPhaseInput(
                  this.state.phaseResults[workflow.phases[i - 1]?.agent] || {
                    agent: 'architect',
                    success: true,
                    output: {},
                    filesCreated: [],
                    filesModified: [],
                    commits: [],
                    costUsd: 0,
                    turnsUsed: 0,
                  }
                )
              )
            : undefined,
        };

        // Execute agent
        const result = await this.runAgent(phase.agent, context);

        // Store result
        this.state.phaseResults[phase.agent] = result;
        this.state.totalCostUsd += result.costUsd;
        this.state.totalTurns += result.turnsUsed;

        // Emit cost update
        yield {
          type: 'cost-update',
          currentCostUsd: this.state.totalCostUsd,
          budgetRemainingUsd: this.config.maxBudgetUsd - this.state.totalCostUsd,
          timestamp: new Date(),
        };

        // Check if agent succeeded
        if (!result.success) {
          yield {
            type: 'workflow-error',
            phase: phase.name,
            error: result.error || 'Agent failed',
            recoverable: true,
            timestamp: new Date(),
          };
          this.state.status = 'failed';
          this.state.error = result.error;
          return;
        }

        // Run phase validation if present
        if (phase.validation) {
          const validationPassed = await phase.validation(result);
          if (!validationPassed) {
            yield {
              type: 'workflow-error',
              phase: phase.name,
              error: 'Phase validation failed',
              recoverable: true,
              timestamp: new Date(),
            };
            this.state.status = 'failed';
            this.state.error = 'Validation failed';
            return;
          }
        }

        // Emit phase completed
        yield {
          type: 'phase-completed',
          phase: phase.name,
          agent: phase.agent,
          result,
          timestamp: new Date(),
        };

        // Request approval if required
        if (this.shouldRequestApproval(phase.approvalRequired)) {
          this.state.status = 'awaiting-approval';

          const summary = this.generatePhaseSummary(phase.agent, result);

          yield {
            type: 'approval-requested',
            phase: phase.name,
            summary,
            result,
            timestamp: new Date(),
          };

          // Wait for approval (handled externally)
          // The CLI will call continueWorkflow() with approval result
          return;
        }
      }

      // All phases completed
      this.state.status = 'completed';
      this.state.completedAt = new Date();

      yield {
        type: 'workflow-completed',
        workflow: workflowType,
        success: true,
        totalCostUsd: this.state.totalCostUsd,
        totalTurns: this.state.totalTurns,
        results: this.state.phaseResults,
        timestamp: new Date(),
      };
    } catch (error) {
      this.state.status = 'failed';
      this.state.error =
        error instanceof Error ? error.message : 'Unknown error';

      yield {
        type: 'workflow-error',
        error: this.state.error,
        recoverable: false,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Continue workflow after approval
   */
  async *continueWorkflow(
    approved: boolean,
    feedback?: string
  ): AsyncGenerator<WorkflowEvent> {
    if (!this.state) {
      throw new Error('No workflow in progress');
    }

    if (this.state.status !== 'awaiting-approval') {
      throw new Error('Workflow is not awaiting approval');
    }

    const workflow = getWorkflow(this.state.workflow);
    const currentPhase = workflow.phases[this.state.currentPhaseIndex];

    yield {
      type: 'approval-received',
      phase: currentPhase.name,
      approved,
      feedback,
      timestamp: new Date(),
    };

    if (!approved) {
      this.state.status = 'cancelled';
      yield {
        type: 'workflow-error',
        phase: currentPhase.name,
        error: feedback || 'Approval denied',
        recoverable: false,
        timestamp: new Date(),
      };
      return;
    }

    // Continue with remaining phases
    this.state.status = 'running';

    for (
      let i = this.state.currentPhaseIndex + 1;
      i < workflow.phases.length;
      i++
    ) {
      const phase = workflow.phases[i];
      this.state.currentPhaseIndex = i;

      // (Same logic as runWorkflow - extracted for reuse)
      // Check budget
      if (this.state.totalCostUsd >= this.config.maxBudgetUsd) {
        yield {
          type: 'workflow-error',
          phase: phase.name,
          error: `Budget exceeded: $${this.state.totalCostUsd.toFixed(2)}`,
          recoverable: false,
          timestamp: new Date(),
        };
        this.state.status = 'failed';
        return;
      }

      yield {
        type: 'phase-started',
        phase: phase.name,
        agent: phase.agent,
        phaseIndex: i,
        totalPhases: workflow.phases.length,
        timestamp: new Date(),
      };

      const context: AgentContext = {
        featureDescription: this.state.description,
        workingDirectory: this.config.workingDirectory,
        previousPhaseResults: this.state.phaseResults,
        additionalContext: feedback,
      };

      const result = await this.runAgent(phase.agent, context);

      this.state.phaseResults[phase.agent] = result;
      this.state.totalCostUsd += result.costUsd;
      this.state.totalTurns += result.turnsUsed;

      yield {
        type: 'cost-update',
        currentCostUsd: this.state.totalCostUsd,
        budgetRemainingUsd: this.config.maxBudgetUsd - this.state.totalCostUsd,
        timestamp: new Date(),
      };

      if (!result.success) {
        yield {
          type: 'workflow-error',
          phase: phase.name,
          error: result.error || 'Agent failed',
          recoverable: true,
          timestamp: new Date(),
        };
        this.state.status = 'failed';
        return;
      }

      if (phase.validation) {
        const validationPassed = await phase.validation(result);
        if (!validationPassed) {
          yield {
            type: 'workflow-error',
            phase: phase.name,
            error: 'Phase validation failed',
            recoverable: true,
            timestamp: new Date(),
          };
          this.state.status = 'failed';
          return;
        }
      }

      yield {
        type: 'phase-completed',
        phase: phase.name,
        agent: phase.agent,
        result,
        timestamp: new Date(),
      };

      if (this.shouldRequestApproval(phase.approvalRequired)) {
        this.state.status = 'awaiting-approval';

        yield {
          type: 'approval-requested',
          phase: phase.name,
          summary: this.generatePhaseSummary(phase.agent, result),
          result,
          timestamp: new Date(),
        };
        return;
      }
    }

    // Completed
    this.state.status = 'completed';
    this.state.completedAt = new Date();

    yield {
      type: 'workflow-completed',
      workflow: this.state.workflow,
      success: true,
      totalCostUsd: this.state.totalCostUsd,
      totalTurns: this.state.totalTurns,
      results: this.state.phaseResults,
      timestamp: new Date(),
    };
  }

  /**
   * Execute a single agent
   */
  private async runAgent(
    agentType: AgentType,
    context: AgentContext
  ): Promise<AgentResult> {
    const agentConfig = getAgentConfig(agentType);

    const prompt = this.buildAgentPrompt(agentConfig, context);

    try {
      // Use Claude API to run the agent
      const response = await this.client.messages.create({
        model: this.getModelId(agentConfig.model || this.config.defaultModel),
        max_tokens: 8192,
        system: agentConfig.systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract text content from response
      const textContent = response.content.find((c) => c.type === 'text');
      const outputText = textContent?.type === 'text' ? textContent.text : '';

      // Parse agent output
      const output = this.parseAgentOutput(outputText, agentConfig);

      // Calculate cost (approximate)
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const costUsd = this.calculateCost(
        inputTokens,
        outputTokens,
        agentConfig.model || this.config.defaultModel
      );

      return {
        agent: agentType,
        success: true,
        output,
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd,
        turnsUsed: 1,
      };
    } catch (error) {
      return {
        agent: agentType,
        success: false,
        output: {},
        filesCreated: [],
        filesModified: [],
        commits: [],
        costUsd: 0,
        turnsUsed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build prompt for agent
   */
  private buildAgentPrompt(
    agentConfig: AgentConfig,
    context: AgentContext
  ): string {
    let prompt = `# Task\n\n${context.featureDescription}\n\n`;

    if (context.additionalContext) {
      prompt += `# Additional Context\n\n${context.additionalContext}\n\n`;
    }

    if (Object.keys(context.previousPhaseResults).length > 0) {
      prompt += `# Previous Phase Results\n\n`;
      for (const [agent, result] of Object.entries(
        context.previousPhaseResults
      )) {
        prompt += `## ${agent}\n\n`;
        prompt += `\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\`\n\n`;
      }
    }

    prompt += `# Expected Output\n\n`;
    prompt += `Please provide your response in the following JSON format:\n\n`;
    prompt += `\`\`\`json\n`;
    prompt += JSON.stringify(agentConfig.outputSchema, null, 2);
    prompt += `\n\`\`\`\n`;

    return prompt;
  }

  /**
   * Parse agent output from response text
   */
  private parseAgentOutput(
    text: string,
    _agentConfig: AgentConfig
  ): Record<string, unknown> {
    // Try to extract JSON from response
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Fall through to default
      }
    }

    // Try to parse entire response as JSON
    try {
      return JSON.parse(text);
    } catch {
      // Return raw text as output
      return { rawOutput: text };
    }
  }

  /**
   * Get Anthropic model ID from our model type
   */
  private getModelId(model: string): string {
    switch (model) {
      case 'opus':
        return 'claude-opus-4-20250514';
      case 'haiku':
        return 'claude-3-5-haiku-20241022';
      case 'sonnet':
      default:
        return 'claude-sonnet-4-20250514';
    }
  }

  /**
   * Calculate approximate cost for API call
   */
  private calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): number {
    // Approximate costs per 1M tokens (as of 2025)
    const costs: Record<string, { input: number; output: number }> = {
      sonnet: { input: 3.0, output: 15.0 },
      opus: { input: 15.0, output: 75.0 },
      haiku: { input: 0.25, output: 1.25 },
    };

    const modelCosts = costs[model] || costs.sonnet;
    const inputCost = (inputTokens / 1_000_000) * modelCosts.input;
    const outputCost = (outputTokens / 1_000_000) * modelCosts.output;

    return inputCost + outputCost;
  }

  /**
   * Check if approval should be requested based on config
   */
  private shouldRequestApproval(phaseRequiresApproval: boolean): boolean {
    switch (this.config.approvalMode) {
      case 'after-each-phase':
        return phaseRequiresApproval;
      case 'at-end':
        return false; // Only at end
      case 'none':
        return false;
      default:
        return phaseRequiresApproval;
    }
  }

  /**
   * Generate human-readable summary of phase result
   */
  private generatePhaseSummary(
    agent: AgentType,
    result: AgentResult
  ): string {
    const lines: string[] = [];

    lines.push(`Agent: ${agent}`);
    lines.push(`Success: ${result.success}`);
    lines.push(`Cost: $${result.costUsd.toFixed(4)}`);
    lines.push(`Turns: ${result.turnsUsed}`);

    if (result.filesCreated.length > 0) {
      lines.push(`Files created: ${result.filesCreated.join(', ')}`);
    }

    if (result.filesModified.length > 0) {
      lines.push(`Files modified: ${result.filesModified.join(', ')}`);
    }

    if (result.commits.length > 0) {
      lines.push(`Commits: ${result.commits.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Get current workflow state
   */
  getState(): WorkflowState | null {
    return this.state;
  }

  /**
   * Get configuration
   */
  getConfig(): FeatureFactoryConfig {
    return this.config;
  }
}
