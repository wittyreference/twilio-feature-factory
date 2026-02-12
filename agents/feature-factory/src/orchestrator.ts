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
import { getToolSchemas, executeTool, type ToolContext } from './tools.js';
import { initializeMcpTools } from './mcp-tools.js';
import {
  truncateToolOutput,
  shouldCompact,
  compactMessages,
  DEFAULT_CONTEXT_MANAGER_CONFIG,
  type ContextManagerConfig,
} from './context-manager.js';
import {
  createStallTracker,
  hashToolInput,
  buildInterventionMessage,
  DEFAULT_STALL_DETECTION_CONFIG,
} from './stall-detection.js';
import {
  generateSessionId,
  saveSession,
  loadSession,
  listSessions,
  getResumableSession,
  type SessionSummary,
} from './session.js';
import { executeHook } from './hooks/index.js';
import type { PersistedSession, HookContext, PrePhaseHookEvent } from './types.js';

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

    // Initialize MCP tools if enabled
    if (this.config.twilioMcpEnabled) {
      try {
        initializeMcpTools();
        if (this.config.verbose) {
          console.log('  [orchestrator] MCP tools initialized');
        }
      } catch (error) {
        if (this.config.verbose) {
          console.warn(
            `  [orchestrator] MCP tools not available: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
        // Continue without MCP tools - they're optional
      }
    }
  }

  /**
   * Run a workflow and yield events as it progresses
   */
  async *runWorkflow(
    workflowType: WorkflowType,
    description: string,
    options: { sessionId?: string } = {}
  ): AsyncGenerator<WorkflowEvent> {
    const workflow = getWorkflow(workflowType);
    const sessionId = options.sessionId || generateSessionId();

    // Initialize state
    this.state = {
      sessionId,
      workflow: workflowType,
      description,
      currentPhaseIndex: 0,
      status: 'running',
      phaseResults: {},
      totalCostUsd: 0,
      totalTurns: 0,
      startedAt: new Date(),
    };

    // Save initial state
    this.persistState();

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

        // Check workflow time limit
        const workflowElapsed = Date.now() - this.state.startedAt.getTime();
        if (workflowElapsed >= this.config.maxDurationMsPerWorkflow) {
          yield {
            type: 'workflow-error',
            phase: phase.name,
            error: `Workflow time limit exceeded: ${(workflowElapsed / 1000 / 60).toFixed(1)} minutes`,
            recoverable: false,
            timestamp: new Date(),
          };
          this.state.status = 'failed';
          this.state.error = 'Workflow time limit exceeded';
          return;
        }

        // Run pre-phase hooks if defined
        if (phase.prePhaseHooks && phase.prePhaseHooks.length > 0) {
          const hookContext: HookContext = {
            workingDirectory: this.config.workingDirectory,
            previousPhaseResults: this.state.phaseResults,
            workflowState: this.state,
            verbose: this.config.verbose,
          };

          for (const hookType of phase.prePhaseHooks) {
            if (this.config.verbose) {
              console.log(`  [orchestrator] Running pre-phase hook: ${hookType}`);
            }

            const hookResult = await executeHook(hookType, hookContext);

            // Emit hook event
            yield {
              type: 'pre-phase-hook',
              phase: phase.name,
              hook: hookType,
              result: hookResult,
              timestamp: new Date(),
            } as PrePhaseHookEvent;

            if (!hookResult.passed) {
              yield {
                type: 'workflow-error',
                phase: phase.name,
                error: hookResult.error || `Pre-phase hook ${hookType} failed`,
                recoverable: true,
                timestamp: new Date(),
              };
              this.state.status = 'failed';
              this.state.error = hookResult.error;
              this.persistState();
              return;
            }

            // Log warnings if present
            if (hookResult.warnings && this.config.verbose) {
              for (const warning of hookResult.warnings) {
                console.log(`  [${hookType}] Warning: ${warning}`);
              }
            }
          }
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

        // Persist after each phase
        this.persistState();

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
          this.persistState();
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
            this.persistState();
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
          this.persistState();

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
      this.persistState();

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
      this.persistState();

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

      // Check workflow time limit
      const continueElapsed = Date.now() - this.state.startedAt.getTime();
      if (continueElapsed >= this.config.maxDurationMsPerWorkflow) {
        yield {
          type: 'workflow-error',
          phase: phase.name,
          error: `Workflow time limit exceeded: ${(continueElapsed / 1000 / 60).toFixed(1)} minutes`,
          recoverable: false,
          timestamp: new Date(),
        };
        this.state.status = 'failed';
        this.state.error = 'Workflow time limit exceeded';
        return;
      }

      // Run pre-phase hooks if defined
      if (phase.prePhaseHooks && phase.prePhaseHooks.length > 0) {
        const hookContext: HookContext = {
          workingDirectory: this.config.workingDirectory,
          previousPhaseResults: this.state.phaseResults,
          workflowState: this.state,
          verbose: this.config.verbose,
        };

        for (const hookType of phase.prePhaseHooks) {
          if (this.config.verbose) {
            console.log(`  [orchestrator] Running pre-phase hook: ${hookType}`);
          }

          const hookResult = await executeHook(hookType, hookContext);

          yield {
            type: 'pre-phase-hook',
            phase: phase.name,
            hook: hookType,
            result: hookResult,
            timestamp: new Date(),
          } as PrePhaseHookEvent;

          if (!hookResult.passed) {
            yield {
              type: 'workflow-error',
              phase: phase.name,
              error: hookResult.error || `Pre-phase hook ${hookType} failed`,
              recoverable: true,
              timestamp: new Date(),
            };
            this.state.status = 'failed';
            this.state.error = hookResult.error;
            this.persistState();
            return;
          }
        }
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

      // Persist after each phase
      this.persistState();

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
        this.persistState();
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
          this.persistState();
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
        this.persistState();

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
    this.persistState();

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
   * Execute a single agent with agentic tool loop
   */
  private async runAgent(
    agentType: AgentType,
    context: AgentContext
  ): Promise<AgentResult> {
    const agentConfig = getAgentConfig(agentType);
    const tools = getToolSchemas(agentConfig.tools);
    const model = this.getModelId(agentConfig.model || this.config.defaultModel);

    const toolContext: ToolContext = {
      workingDirectory: context.workingDirectory,
      verbose: this.config.verbose,
      sandboxBoundary: this.config.sandbox?.enabled
        ? context.workingDirectory
        : undefined,
    };

    // Build initial prompt
    const initialPrompt = this.buildAgentPrompt(agentConfig, context);

    // Track accumulated results
    const filesCreated: string[] = [];
    const filesModified: string[] = [];
    const commits: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let turnsUsed = 0;
    let finalOutput: Record<string, unknown> = {};
    let contextCompactions = 0;
    let timedOut = false;
    const agentStartTime = Date.now();
    const effectiveMaxTurns = Math.min(agentConfig.maxTurns, this.config.maxTurnsPerAgent);

    // Create stall tracker if enabled
    const stallTracker = this.config.stallDetection?.enabled !== false
      ? createStallTracker({ ...DEFAULT_STALL_DETECTION_CONFIG, ...this.config.stallDetection })
      : null;

    // Resolve context manager config from user config overrides
    const contextManagerConfig: ContextManagerConfig = {
      ...DEFAULT_CONTEXT_MANAGER_CONFIG,
      ...this.config.contextWindow,
    };

    // Build messages for conversation
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: initialPrompt },
    ];

    try {
      // Agentic loop
      while (turnsUsed < effectiveMaxTurns) {
        turnsUsed++;

        // Check per-agent time limit
        const agentElapsed = Date.now() - agentStartTime;
        if (agentElapsed >= this.config.maxDurationMsPerAgent) {
          if (this.config.verbose) {
            console.log(`  [${agentType}] Time limit reached: ${(agentElapsed / 1000).toFixed(0)}s`);
          }
          timedOut = true;
          break;
        }

        if (this.config.verbose) {
          console.log(`  [${agentType}] Turn ${turnsUsed}/${effectiveMaxTurns}`);
        }

        // Make API call
        const response = await this.client.messages.create({
          model,
          max_tokens: 8192,
          system: agentConfig.systemPrompt,
          messages,
          tools: tools.length > 0 ? tools : undefined,
        });

        // Track token usage
        totalInputTokens += response.usage?.input_tokens || 0;
        totalOutputTokens += response.usage?.output_tokens || 0;

        // Layer 2: Check if conversation history needs compaction
        if (shouldCompact(totalInputTokens, contextManagerConfig)) {
          const compaction = compactMessages(messages, contextManagerConfig);
          messages.length = 0;
          messages.push(...compaction.messages);
          contextCompactions++;
          if (this.config.verbose) {
            console.log(
              `  [${agentType}] Compacted: removed ${compaction.turnPairsRemoved} turn-pairs, ${messages.length} messages remaining`
            );
          }
        }

        // Process response content
        const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
        let textOutput = '';

        for (const block of response.content) {
          if (block.type === 'text') {
            textOutput += block.text;
          } else if (block.type === 'tool_use') {
            toolUseBlocks.push(block);
          }
        }

        // If no tool use, we're done
        if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
          // Parse final output
          finalOutput = this.parseAgentOutput(textOutput, agentConfig);
          break;
        }

        // Add assistant message to history
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Execute tools and collect results
        const toolResults: Array<Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam> = [];

        for (const toolUse of toolUseBlocks) {
          if (this.config.verbose) {
            console.log(`  [${agentType}] Calling tool: ${toolUse.name}`);
          }

          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
            toolContext
          );

          // Track file changes
          if (result.filesCreated) {
            filesCreated.push(...result.filesCreated);
          }
          if (result.filesModified) {
            filesModified.push(...result.filesModified);
          }

          // Track commits from bash output
          if (toolUse.name === 'Bash' && result.success) {
            const commitMatch = result.output.match(/\[[\w-]+\s+([a-f0-9]+)\]/);
            if (commitMatch) {
              commits.push(commitMatch[1]);
            }
          }

          // Layer 1: Truncate tool output before it enters message history
          const rawOutput = result.success
            ? result.output
            : `Error: ${result.error || 'Unknown error'}`;
          const truncation = truncateToolOutput(toolUse.name, rawOutput, contextManagerConfig);
          if (truncation.wasTruncated && this.config.verbose) {
            console.log(
              `  [${agentType}] Truncated ${toolUse.name} output: ${truncation.originalLength} → ${truncation.truncatedLength} chars`
            );
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: truncation.output,
            is_error: !result.success,
          });
        }

        // Record turn in stall tracker and check for stalls
        if (stallTracker) {
          const fileChangeTools = new Set(['Write', 'Edit']);
          const turnRecords = toolUseBlocks.map((toolUse, idx) => ({
            toolName: toolUse.name,
            inputHash: hashToolInput(toolUse.input as Record<string, unknown>),
            hadFileActivity: fileChangeTools.has(toolUse.name) &&
              !toolResults[idx]?.hasOwnProperty('is_error'),
          }));
          stallTracker.recordTurn(turnRecords);

          const stall = stallTracker.detectStall();
          if (stall) {
            if (stallTracker.shouldHardStop()) {
              const costUsd = this.calculateCost(
                totalInputTokens,
                totalOutputTokens,
                agentConfig.model || this.config.defaultModel
              );
              return {
                agent: agentType,
                success: false,
                output: finalOutput,
                filesCreated: [...new Set(filesCreated)],
                filesModified: [...new Set(filesModified)],
                commits: [...new Set(commits)],
                costUsd,
                turnsUsed,
                contextCompactions,
                stallDetections: stallTracker.getInterventionCount(),
                error: `STALLED: ${stall.description}`,
              };
            }
            stallTracker.recordIntervention();
            toolResults.push({ type: 'text', text: buildInterventionMessage(stall) });
            if (this.config.verbose) {
              console.log(
                `  [${agentType}] Stall detected (${stall.type}) — intervention ${stallTracker.getInterventionCount()}`
              );
            }
          }
        }

        // Add tool results to messages
        messages.push({
          role: 'user',
          content: toolResults,
        });
      }

      // Calculate cost
      const costUsd = this.calculateCost(
        totalInputTokens,
        totalOutputTokens,
        agentConfig.model || this.config.defaultModel
      );

      // Check for max turns reached
      if (turnsUsed >= effectiveMaxTurns) {
        return {
          agent: agentType,
          success: false,
          output: finalOutput,
          filesCreated: [...new Set(filesCreated)],
          filesModified: [...new Set(filesModified)],
          commits: [...new Set(commits)],
          costUsd,
          turnsUsed,
          contextCompactions,
          stallDetections: stallTracker?.getInterventionCount() ?? 0,
          error: `Max turns (${effectiveMaxTurns}) reached`,
        };
      }

      // Check for agent time limit reached
      if (timedOut) {
        return {
          agent: agentType,
          success: false,
          output: finalOutput,
          filesCreated: [...new Set(filesCreated)],
          filesModified: [...new Set(filesModified)],
          commits: [...new Set(commits)],
          costUsd,
          turnsUsed,
          contextCompactions,
          stallDetections: stallTracker?.getInterventionCount() ?? 0,
          error: `Agent time limit (${(this.config.maxDurationMsPerAgent / 1000 / 60).toFixed(0)}min) reached`,
        };
      }

      return {
        agent: agentType,
        success: true,
        output: finalOutput,
        filesCreated: [...new Set(filesCreated)],
        filesModified: [...new Set(filesModified)],
        commits: [...new Set(commits)],
        costUsd,
        turnsUsed,
        contextCompactions,
        stallDetections: stallTracker?.getInterventionCount() ?? 0,
      };
    } catch (error) {
      // Calculate cost even on error
      const costUsd = this.calculateCost(
        totalInputTokens,
        totalOutputTokens,
        agentConfig.model || this.config.defaultModel
      );

      return {
        agent: agentType,
        success: false,
        output: finalOutput,
        filesCreated: [...new Set(filesCreated)],
        filesModified: [...new Set(filesModified)],
        commits: [...new Set(commits)],
        costUsd,
        turnsUsed,
        contextCompactions,
        stallDetections: stallTracker?.getInterventionCount() ?? 0,
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
      prompt += '# Previous Phase Results\n\n';
      for (const [agent, result] of Object.entries(
        context.previousPhaseResults
      )) {
        prompt += `## ${agent}\n\n`;
        prompt += `\`\`\`json\n${JSON.stringify(result.output, null, 2)}\n\`\`\`\n\n`;
      }
    }

    prompt += '# Expected Output\n\n';
    prompt += 'Please provide your response in the following JSON format:\n\n';
    prompt += '```json\n';
    prompt += JSON.stringify(agentConfig.outputSchema, null, 2);
    prompt += '\n```\n';

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

  /**
   * Persist current state to disk
   */
  private persistState(): void {
    if (this.state) {
      try {
        saveSession(this.state, this.config.workingDirectory);
        if (this.config.verbose) {
          console.log(`  [orchestrator] Session ${this.state.sessionId} saved`);
        }
      } catch (error) {
        if (this.config.verbose) {
          console.warn(
            `  [orchestrator] Failed to save session: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
  }

  /**
   * List all sessions in the working directory
   */
  listSessions(): SessionSummary[] {
    return listSessions(this.config.workingDirectory);
  }

  /**
   * Load a specific session
   */
  loadSession(sessionId: string): PersistedSession | null {
    return loadSession(this.config.workingDirectory, sessionId);
  }

  /**
   * Get the most recent resumable session
   */
  getResumableSession(): PersistedSession | null {
    return getResumableSession(this.config.workingDirectory);
  }

  /**
   * Resume a workflow from persisted state
   */
  async *resumeWorkflow(sessionId: string): AsyncGenerator<WorkflowEvent> {
    const persisted = loadSession(this.config.workingDirectory, sessionId);

    if (!persisted) {
      yield {
        type: 'workflow-error',
        error: `Session ${sessionId} not found`,
        recoverable: false,
        timestamp: new Date(),
      };
      return;
    }

    const { state } = persisted;

    // Check if session can be resumed
    if (state.status !== 'running' && state.status !== 'awaiting-approval') {
      yield {
        type: 'workflow-error',
        error: `Session ${sessionId} cannot be resumed (status: ${state.status})`,
        recoverable: false,
        timestamp: new Date(),
      };
      return;
    }

    // Restore state
    this.state = state;

    if (this.config.verbose) {
      console.log(`  [orchestrator] Resuming session ${sessionId}`);
      console.log(`  [orchestrator] Phase: ${state.currentPhaseIndex}, Status: ${state.status}`);
    }

    // Yield resume event
    yield {
      type: 'workflow-resumed',
      sessionId,
      workflow: state.workflow,
      description: state.description,
      resumedAtPhase: state.currentPhaseIndex,
      previousCostUsd: state.totalCostUsd,
      timestamp: new Date(),
    };

    // If awaiting approval, just return and wait for continueWorkflow
    if (state.status === 'awaiting-approval') {
      const workflow = getWorkflow(state.workflow);
      const currentPhase = workflow.phases[state.currentPhaseIndex];
      const currentResult = state.phaseResults[currentPhase.agent];

      yield {
        type: 'approval-requested',
        phase: currentPhase.name,
        summary: currentResult
          ? this.generatePhaseSummary(currentPhase.agent, currentResult)
          : 'Approval required',
        result: currentResult || {
          agent: currentPhase.agent,
          success: true,
          output: {},
          filesCreated: [],
          filesModified: [],
          commits: [],
          costUsd: 0,
          turnsUsed: 0,
        },
        timestamp: new Date(),
      };
      return;
    }

    // Continue from current phase
    const workflow = getWorkflow(state.workflow);

    for (let i = state.currentPhaseIndex; i < workflow.phases.length; i++) {
      const phase = workflow.phases[i];
      this.state.currentPhaseIndex = i;

      // Skip already completed phases
      if (state.phaseResults[phase.agent]) {
        continue;
      }

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
        this.persistState();
        return;
      }

      // Check workflow time limit
      const resumeElapsed = Date.now() - this.state.startedAt.getTime();
      if (resumeElapsed >= this.config.maxDurationMsPerWorkflow) {
        yield {
          type: 'workflow-error',
          phase: phase.name,
          error: `Workflow time limit exceeded: ${(resumeElapsed / 1000 / 60).toFixed(1)} minutes`,
          recoverable: false,
          timestamp: new Date(),
        };
        this.state.status = 'failed';
        this.state.error = 'Workflow time limit exceeded';
        this.persistState();
        return;
      }

      // Run pre-phase hooks if defined
      if (phase.prePhaseHooks && phase.prePhaseHooks.length > 0) {
        const hookContext: HookContext = {
          workingDirectory: this.config.workingDirectory,
          previousPhaseResults: this.state.phaseResults,
          workflowState: this.state,
          verbose: this.config.verbose,
        };

        for (const hookType of phase.prePhaseHooks) {
          if (this.config.verbose) {
            console.log(`  [orchestrator] Running pre-phase hook: ${hookType}`);
          }

          const hookResult = await executeHook(hookType, hookContext);

          yield {
            type: 'pre-phase-hook',
            phase: phase.name,
            hook: hookType,
            result: hookResult,
            timestamp: new Date(),
          } as PrePhaseHookEvent;

          if (!hookResult.passed) {
            yield {
              type: 'workflow-error',
              phase: phase.name,
              error: hookResult.error || `Pre-phase hook ${hookType} failed`,
              recoverable: true,
              timestamp: new Date(),
            };
            this.state.status = 'failed';
            this.state.error = hookResult.error;
            this.persistState();
            return;
          }
        }
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
        featureDescription: state.description,
        workingDirectory: this.config.workingDirectory,
        previousPhaseResults: this.state.phaseResults,
      };

      // Execute agent
      const result = await this.runAgent(phase.agent, context);

      // Store result
      this.state.phaseResults[phase.agent] = result;
      this.state.totalCostUsd += result.costUsd;
      this.state.totalTurns += result.turnsUsed;

      // Persist after each phase
      this.persistState();

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
        this.persistState();
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
          this.persistState();
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
        this.persistState();

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

    // All phases completed
    this.state.status = 'completed';
    this.state.completedAt = new Date();
    this.persistState();

    yield {
      type: 'workflow-completed',
      workflow: state.workflow,
      success: true,
      totalCostUsd: this.state.totalCostUsd,
      totalTurns: this.state.totalTurns,
      results: this.state.phaseResults,
      timestamp: new Date(),
    };
  }
}
