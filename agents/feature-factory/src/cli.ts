#!/usr/bin/env node
// ABOUTME: CLI interface for Feature Factory.
// ABOUTME: Provides commands to run autonomous Twilio feature development pipelines.

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { FeatureFactoryOrchestrator } from './orchestrator.js';
import {
  displayAutonomousWarning,
  requireAcknowledgment,
  generateSessionSummary,
  displaySessionSummary,
  createAuditLogger,
  isAutonomousCICD,
} from './autonomous.js';
import {
  createSandbox,
  copyResultsBack,
  cleanupSandbox,
  type SandboxInfo,
} from './sandbox.js';
import { rollbackToCheckpoint } from './checkpoints.js';
import { getWorkflow } from './workflows/index.js';
import type { WorkflowEvent, ApprovalMode, AutonomousModeConfig } from './types.js';

const program = new Command();

program
  .name('feature-factory')
  .description('Autonomous Twilio feature development using Claude Agent SDK')
  .version('0.1.0');

/**
 * Format currency for display
 */
function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

/**
 * Handle workflow events and display progress
 */
async function handleWorkflowEvents(
  events: AsyncGenerator<WorkflowEvent>,
  orchestrator: FeatureFactoryOrchestrator,
  auditLogger?: { log: (event: string, data?: Record<string, unknown>) => void } | null,
  eventOptions?: { verbose?: boolean; sandboxEnabled?: boolean }
): Promise<void> {
  let spinner = ora();

  for await (const event of events) {
    // Log to audit trail if enabled
    auditLogger?.log(event.type, event as unknown as Record<string, unknown>);

    switch (event.type) {
      case 'workflow-started': {
        const state = orchestrator.getState();
        console.log(
          chalk.bold.blue(`\n🚀 Starting ${event.workflow} workflow`)
        );
        console.log(chalk.gray(`   Session: ${state?.sessionId || 'unknown'}`));
        console.log(chalk.gray(`   Description: ${event.description}`));
        console.log(chalk.gray(`   Phases: ${event.totalPhases}`));
        console.log();
        break;
      }

      case 'workflow-resumed':
        console.log(
          chalk.bold.blue(`\n🔄 Resuming ${event.workflow} workflow`)
        );
        console.log(chalk.gray(`   Session: ${event.sessionId}`));
        console.log(chalk.gray(`   Description: ${event.description}`));
        console.log(chalk.gray(`   Resumed at phase: ${event.resumedAtPhase + 1}`));
        console.log(chalk.gray(`   Previous cost: ${formatCurrency(event.previousCostUsd)}`));
        console.log();
        break;

      case 'phase-started':
        spinner = ora({
          text: chalk.cyan(
            `Phase ${event.phaseIndex + 1}/${event.totalPhases}: ${event.phase} (${event.agent})`
          ),
        }).start();
        break;

      case 'phase-completed':
        spinner.succeed(
          chalk.green(
            `${event.phase} completed (${formatCurrency(event.result.costUsd)})`
          )
        );
        break;

      case 'cost-update':
        console.log(
          chalk.gray(
            `   💰 Cost: ${formatCurrency(event.currentCostUsd)} / Budget remaining: ${formatCurrency(event.budgetRemainingUsd)}`
          )
        );
        break;

      case 'approval-requested':
        spinner.stop();
        console.log();
        console.log(chalk.yellow.bold('⏸️  Approval Required'));
        console.log(chalk.yellow(`   Phase: ${event.phase}`));
        console.log();
        console.log(chalk.white('Summary:'));
        console.log(chalk.gray(event.summary));
        console.log();

        const approved = await promptForApproval();

        if (approved) {
          console.log(chalk.green('✓ Approved, continuing...'));
          console.log();
          // Continue the workflow
          const continueEvents = orchestrator.continueWorkflow(true);
          await handleWorkflowEvents(continueEvents, orchestrator, auditLogger, eventOptions);
        } else {
          // Offer rollback before cancelling
          const state = orchestrator.getState();
          if (state && !eventOptions?.sandboxEnabled) {
            const workflow = getWorkflow(state.workflow);
            const currentPhase = workflow.phases[state.currentPhaseIndex];
            if (state.checkpoints?.[currentPhase.agent]) {
              const tag = state.checkpoints[currentPhase.agent];
              const shouldRollback = await promptForRollback(currentPhase.name);
              if (shouldRollback) {
                const result = rollbackToCheckpoint({
                  workingDirectory: orchestrator.getConfig().workingDirectory,
                  tagName: tag,
                });
                if (result.success) {
                  console.log(chalk.yellow(`  ↩ Rolled back to before ${currentPhase.name}`));
                  orchestrator.clearCheckpoint(currentPhase.agent);
                }
              }
            }
          }
          const feedback = await promptForFeedback();
          console.log(chalk.red('✗ Rejected'));
          const rejectEvents = orchestrator.continueWorkflow(false, feedback);
          await handleWorkflowEvents(rejectEvents, orchestrator, auditLogger, eventOptions);
        }
        return; // Exit after handling approval continuation

      case 'approval-received':
        if (event.approved) {
          console.log(chalk.green(`✓ ${event.phase} approved`));
        } else {
          console.log(
            chalk.red(`✗ ${event.phase} rejected: ${event.feedback}`)
          );
        }
        break;

      case 'workflow-completed':
        console.log();
        if (event.success) {
          console.log(chalk.green.bold('✅ Workflow completed successfully!'));
        } else {
          console.log(chalk.red.bold('❌ Workflow failed'));
        }
        console.log(
          chalk.gray(`   Total cost: ${formatCurrency(event.totalCostUsd)}`)
        );
        console.log(chalk.gray(`   Total turns: ${event.totalTurns}`));
        break;

      case 'phase-retry':
        spinner.warn(chalk.yellow(`${event.phase} failed — retrying (${event.attempt}/${event.maxRetries})`));
        spinner = ora({ text: chalk.cyan(`Retry ${event.attempt}: ${event.phase} (${event.agent})`) }).start();
        break;

      case 'checkpoint-created':
        if (eventOptions?.verbose) {
          console.log(chalk.gray(`   📌 Checkpoint: ${event.tagName} (${event.commitHash.slice(0, 7)})`));
        }
        break;

      case 'workflow-error':
        spinner.fail(chalk.red(`Error: ${event.error}`));
        if (event.phase) {
          console.log(chalk.gray(`   Phase: ${event.phase}`));
        }
        console.log(
          chalk.gray(`   Recoverable: ${event.recoverable ? 'yes' : 'no'}`)
        );
        // Offer rollback if checkpoint exists for the failed phase
        if (event.phase && !eventOptions?.sandboxEnabled) {
          const state = orchestrator.getState();
          if (state) {
            const workflow = getWorkflow(state.workflow);
            const failedPhase = workflow.phases.find(p => p.name === event.phase);
            if (failedPhase && state.checkpoints?.[failedPhase.agent]) {
              const tag = state.checkpoints[failedPhase.agent];
              const shouldRollback = await promptForRollback(event.phase);
              if (shouldRollback) {
                const result = rollbackToCheckpoint({
                  workingDirectory: orchestrator.getConfig().workingDirectory,
                  tagName: tag,
                });
                if (result.success) {
                  console.log(chalk.yellow(`  ↩ Rolled back to before ${event.phase}`));
                  orchestrator.clearCheckpoint(failedPhase.agent);
                } else {
                  console.log(chalk.red(`  Rollback failed: ${result.error}`));
                }
              }
            }
          }
        }
        break;
    }
  }
}

/**
 * Prompt user for approval
 */
async function promptForApproval(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.log(chalk.yellow('Approve and continue? (y/n): ') +
      chalk.green('y (auto-approved, non-interactive)'));
    return true;
  }

  try {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(
        chalk.yellow('Approve and continue? (y/n): '),
        (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        }
      );
    });
  } catch {
    console.log(chalk.yellow('Approve and continue? (y/n): ') +
      chalk.green('y (auto-approved, stdin unavailable)'));
    return true;
  }
}

/**
 * Prompt user for feedback
 */
async function promptForFeedback(): Promise<string> {
  if (!process.stdin.isTTY) {
    return '';
  }

  try {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(chalk.yellow('Feedback (optional): '), (answer: string) => {
        rl.close();
        resolve(answer);
      });
    });
  } catch {
    return '';
  }
}

/**
 * Prompt user to roll back changes from a failed/rejected phase
 */
async function promptForRollback(phaseName: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }

  try {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(
        chalk.yellow(`  Roll back changes from ${phaseName}? (y/N) `),
        (answer: string) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y');
        }
      );
    });
  } catch {
    return false;
  }
}

// New Feature command
program
  .command('new-feature <description>')
  .description('Run the new feature development pipeline')
  .option('-b, --budget <amount>', 'Maximum budget in USD (or "unlimited")')
  .option(
    '-m, --model <model>',
    'Default model (sonnet, opus, haiku)',
    'sonnet'
  )
  .option('--no-approval', 'Skip approval gates')
  .option('--dangerously-autonomous', 'Full autonomous mode (no prompts, elevated limits)')
  .option('--max-duration <minutes>', 'Maximum workflow duration in minutes')
  .option('--sandbox', 'Run workflow in isolated sandbox directory')
  .option('--no-sandbox', 'Disable sandbox (even in autonomous mode)')
  .option('--no-stall-detection', 'Disable stall detection for agents')
  .option('--no-retry', 'Disable phase retry on failure')
  .option('--no-checkpoints', 'Disable git checkpoints per phase')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(
    async (
      description: string,
      options: {
        budget?: string;
        model: string;
        approval: boolean;
        dangerouslyAutonomous: boolean;
        maxDuration?: string;
        sandbox: boolean;
        stallDetection: boolean;
        retry: boolean;
        checkpoints: boolean;
        verbose: boolean;
      }
    ) => {
      await runWorkflowCommand('new-feature', description, options);
    }
  );

// Status command - show recent sessions
program
  .command('status')
  .description('Show status of recent workflows')
  .option('-a, --all', 'Show all sessions, not just recent')
  .action((options: { all: boolean }) => {
    const orchestrator = new FeatureFactoryOrchestrator({});
    const sessions = orchestrator.listSessions();

    if (sessions.length === 0) {
      console.log(chalk.yellow('\nNo workflow sessions found.'));
      console.log(chalk.gray('Run `feature-factory new-feature "<description>"` to start one.\n'));
      return;
    }

    const displaySessions = options.all ? sessions : sessions.slice(0, 5);

    console.log(chalk.bold('\n📋 Recent Workflow Sessions\n'));

    for (const session of displaySessions) {
      const statusColor = {
        running: chalk.blue,
        'awaiting-approval': chalk.yellow,
        completed: chalk.green,
        failed: chalk.red,
        cancelled: chalk.gray,
      }[session.status] || chalk.white;

      console.log(`${chalk.bold(session.sessionId)} ${statusColor(`[${session.status}]`)}`);
      console.log(chalk.gray(`   Workflow: ${session.workflow}`));
      console.log(chalk.gray(`   Description: ${session.description.slice(0, 60)}${session.description.length > 60 ? '...' : ''}`));
      console.log(chalk.gray(`   Phase: ${session.currentPhase + 1}, Cost: ${formatCurrency(session.totalCostUsd)}`));
      console.log(chalk.gray(`   Updated: ${session.lastUpdatedAt}`));
      console.log();
    }

    if (!options.all && sessions.length > 5) {
      console.log(chalk.gray(`... and ${sessions.length - 5} more. Use --all to see all.\n`));
    }

    // Show resumable hint
    const resumable = sessions.find(s => s.status === 'running' || s.status === 'awaiting-approval');
    if (resumable) {
      console.log(chalk.cyan(`💡 Tip: Run \`feature-factory resume ${resumable.sessionId}\` to continue.\n`));
    }
  });

// Bug Fix command
program
  .command('bug-fix <description>')
  .description('Run the bug fix pipeline')
  .option('-b, --budget <amount>', 'Maximum budget in USD (or "unlimited")')
  .option(
    '-m, --model <model>',
    'Default model (sonnet, opus, haiku)',
    'sonnet'
  )
  .option('--no-approval', 'Skip approval gates')
  .option('--dangerously-autonomous', 'Full autonomous mode (no prompts, elevated limits)')
  .option('--max-duration <minutes>', 'Maximum workflow duration in minutes')
  .option('--sandbox', 'Run workflow in isolated sandbox directory')
  .option('--no-sandbox', 'Disable sandbox (even in autonomous mode)')
  .option('--no-stall-detection', 'Disable stall detection for agents')
  .option('--no-retry', 'Disable phase retry on failure')
  .option('--no-checkpoints', 'Disable git checkpoints per phase')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(
    async (
      description: string,
      options: {
        budget?: string;
        model: string;
        approval: boolean;
        dangerouslyAutonomous: boolean;
        maxDuration?: string;
        sandbox: boolean;
        stallDetection: boolean;
        retry: boolean;
        checkpoints: boolean;
        verbose: boolean;
      }
    ) => {
      await runWorkflowCommand('bug-fix', description, options);
    }
  );

// Refactor command
program
  .command('refactor <description>')
  .description('Run the safe refactoring pipeline')
  .option('-b, --budget <amount>', 'Maximum budget in USD (or "unlimited")')
  .option(
    '-m, --model <model>',
    'Default model (sonnet, opus, haiku)',
    'sonnet'
  )
  .option('--no-approval', 'Skip approval gates')
  .option('--dangerously-autonomous', 'Full autonomous mode (no prompts, elevated limits)')
  .option('--max-duration <minutes>', 'Maximum workflow duration in minutes')
  .option('--sandbox', 'Run workflow in isolated sandbox directory')
  .option('--no-sandbox', 'Disable sandbox (even in autonomous mode)')
  .option('--no-stall-detection', 'Disable stall detection for agents')
  .option('--no-retry', 'Disable phase retry on failure')
  .option('--no-checkpoints', 'Disable git checkpoints per phase')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(
    async (
      description: string,
      options: {
        budget?: string;
        model: string;
        approval: boolean;
        dangerouslyAutonomous: boolean;
        maxDuration?: string;
        sandbox: boolean;
        stallDetection: boolean;
        retry: boolean;
        checkpoints: boolean;
        verbose: boolean;
      }
    ) => {
      await runWorkflowCommand('refactor', description, options);
    }
  );

/**
 * Common workflow runner for all workflow types.
 * Handles autonomous mode, sandbox lifecycle, audit logging, and session summaries.
 */
async function runWorkflowCommand(
  workflow: 'new-feature' | 'bug-fix' | 'refactor',
  description: string,
  options: {
    budget?: string;
    model: string;
    approval: boolean;
    dangerouslyAutonomous: boolean;
    maxDuration?: string;
    sandbox: boolean;
    stallDetection: boolean;
    retry: boolean;
    checkpoints: boolean;
    verbose: boolean;
  }
): Promise<void> {
  console.log(chalk.bold('\n🏭 Feature Factory\n'));

  // Handle autonomous mode
  let autonomousMode: AutonomousModeConfig = {
    enabled: false,
    acknowledged: false,
    acknowledgedVia: null,
    acknowledgedAt: null,
  };

  if (options.dangerouslyAutonomous || isAutonomousCICD()) {
    autonomousMode.enabled = true;

    if (isAutonomousCICD()) {
      autonomousMode.acknowledged = true;
      autonomousMode.acknowledgedVia = 'environment';
      autonomousMode.acknowledgedAt = new Date();
      console.log(chalk.gray('Autonomous mode: acknowledged via environment variable'));
    } else {
      displayAutonomousWarning();
      try {
        autonomousMode = await requireAcknowledgment();
      } catch (error) {
        console.error(
          chalk.red(
            `\n${error instanceof Error ? error.message : 'Acknowledgment failed'}`
          )
        );
        process.exit(1);
      }
    }
  }

  // Determine sandbox mode
  const sandboxEnabled = options.sandbox ||
    (autonomousMode.enabled && options.sandbox !== false);

  // Set up sandbox if enabled
  let workingDirectory = process.cwd();
  let sandboxInfo: SandboxInfo | null = null;

  if (sandboxEnabled) {
    console.log(chalk.cyan('  Setting up sandbox...'));
    try {
      sandboxInfo = await createSandbox({
        sourceDirectory: process.cwd(),
        verbose: options.verbose,
      });
      workingDirectory = sandboxInfo.sandboxDirectory;
      console.log(chalk.gray(`   Sandbox: ${workingDirectory}`));
    } catch (error) {
      console.error(
        chalk.red(
          `\nSandbox setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  }

  // Register cleanup for process signals
  const signalCleanup = async () => {
    if (sandboxInfo) {
      await cleanupSandbox(sandboxInfo.sandboxDirectory);
    }
    process.exit(1);
  };
  if (sandboxInfo) {
    process.on('SIGINT', signalCleanup);
    process.on('SIGTERM', signalCleanup);
  }

  const approvalMode: ApprovalMode = autonomousMode.enabled
    ? 'none'
    : options.approval
      ? 'after-each-phase'
      : 'none';

  // Parse budget: "unlimited" → Infinity, numeric string → number, absent → undefined (use config default)
  const budgetValue = options.budget === 'unlimited'
    ? Infinity
    : options.budget
      ? parseFloat(options.budget)
      : undefined;

  // Parse max duration: minutes → milliseconds
  const maxDurationOverride = options.maxDuration
    ? parseInt(options.maxDuration, 10) * 60 * 1000
    : undefined;

  const orchestrator = new FeatureFactoryOrchestrator({
    ...(budgetValue !== undefined && { maxBudgetUsd: budgetValue }),
    ...(maxDurationOverride !== undefined && { maxDurationMsPerWorkflow: maxDurationOverride }),
    defaultModel: options.model as 'sonnet' | 'opus' | 'haiku',
    approvalMode,
    verbose: options.verbose,
    workingDirectory,
    autonomousMode,
    sandbox: sandboxEnabled ? { enabled: true, sourceDirectory: process.cwd() } : undefined,
    ...(options.stallDetection === false && { stallDetection: { enabled: false } }),
    ...(options.retry === false && { maxRetriesPerPhase: 0 }),
    ...(options.checkpoints === false && { gitCheckpoints: false }),
  });

  const auditLogger = autonomousMode.enabled
    ? createAuditLogger(orchestrator.getState()?.sessionId || 'unknown', workingDirectory)
    : null;

  const effectiveConfig = orchestrator.getConfig();
  const budgetDisplay = effectiveConfig.maxBudgetUsd === Infinity
    ? 'unlimited'
    : formatCurrency(effectiveConfig.maxBudgetUsd);

  if (autonomousMode.enabled) {
    console.log(chalk.cyan.bold('🤖 Running in AUTONOMOUS MODE'));
    console.log(chalk.gray(`   Budget: ${budgetDisplay}`));
    console.log(chalk.gray('   Quality gates: TDD, lint, coverage, credential safety'));
    if (sandboxEnabled) {
      console.log(chalk.gray('   Sandbox isolation: enabled'));
    }
    auditLogger?.log('workflow-started', { description, workflow, sandboxEnabled });
  } else {
    console.log(
      chalk.gray(
        `Config: budget=${budgetDisplay}, model=${options.model}, approval=${approvalMode}${sandboxEnabled ? ', sandbox=on' : ''}`
      )
    );
  }

  const startTime = new Date();
  const filesCreated: string[] = [];
  const filesModified: string[] = [];

  try {
    const events = orchestrator.runWorkflow(workflow, description);
    await handleWorkflowEvents(events, orchestrator, auditLogger, {
      verbose: options.verbose,
      sandboxEnabled,
    });

    // Copy results back from sandbox on success
    if (sandboxInfo) {
      const state = orchestrator.getState();
      if (state?.status === 'completed') {
        console.log(chalk.cyan('  Copying results back from sandbox...'));
        const copyResult = await copyResultsBack(sandboxInfo);
        console.log(chalk.green(`   Copied ${copyResult.filesCopied.length} files`));
        for (const file of copyResult.filesCopied) {
          console.log(chalk.gray(`   - ${file}`));
        }
        if (copyResult.skipped.length > 0 && options.verbose) {
          for (const skip of copyResult.skipped) {
            console.log(chalk.dim(`   Skipped: ${skip}`));
          }
        }
      } else if (state) {
        console.log(chalk.yellow(`  Sandbox results NOT copied (workflow status: ${state.status})`));
      }
    }

    if (autonomousMode.enabled) {
      const state = orchestrator.getState();
      if (state) {
        for (const result of Object.values(state.phaseResults)) {
          filesCreated.push(...result.filesCreated);
          filesModified.push(...result.filesModified);
        }

        const summary = generateSessionSummary(
          state,
          startTime,
          filesCreated,
          filesModified,
          auditLogger?.getPath() || '',
          workingDirectory
        );
        displaySessionSummary(summary);
        auditLogger?.log('workflow-completed', { success: state.status === 'completed' });
      }
    }
  } catch (error) {
    auditLogger?.log('workflow-error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    console.error(
      chalk.red(
        `\nFatal error: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
    process.exit(1);
  } finally {
    auditLogger?.close();
    if (sandboxInfo) {
      await cleanupSandbox(sandboxInfo.sandboxDirectory);
      process.removeListener('SIGINT', signalCleanup);
      process.removeListener('SIGTERM', signalCleanup);
    }
  }
}

// Resume command - continue a paused workflow
program
  .command('resume [sessionId]')
  .description('Resume a paused workflow')
  .option('-b, --budget <amount>', 'Maximum budget in USD', '5.00')
  .option('--dangerously-autonomous', 'Full autonomous mode (no prompts, no limits)')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(
    async (
      sessionId: string | undefined,
      options: { budget: string; dangerouslyAutonomous: boolean; verbose: boolean }
    ) => {
      console.log(chalk.bold('\n🏭 Feature Factory - Resume\n'));

      // Handle autonomous mode
      let autonomousMode: AutonomousModeConfig = {
        enabled: false,
        acknowledged: false,
        acknowledgedVia: null,
        acknowledgedAt: null,
      };

      if (options.dangerouslyAutonomous || isAutonomousCICD()) {
        autonomousMode.enabled = true;

        if (isAutonomousCICD()) {
          autonomousMode.acknowledged = true;
          autonomousMode.acknowledgedVia = 'environment';
          autonomousMode.acknowledgedAt = new Date();
        } else {
          displayAutonomousWarning();
          try {
            autonomousMode = await requireAcknowledgment();
          } catch (error) {
            console.error(
              chalk.red(
                `\n${error instanceof Error ? error.message : 'Acknowledgment failed'}`
              )
            );
            process.exit(1);
          }
        }
      }

      const orchestrator = new FeatureFactoryOrchestrator({
        maxBudgetUsd: parseFloat(options.budget),
        verbose: options.verbose,
        autonomousMode,
      });

      // If no sessionId provided, find the most recent resumable one
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        const resumable = orchestrator.getResumableSession();
        if (!resumable) {
          console.log(chalk.yellow('No resumable sessions found.'));
          console.log(chalk.gray('Use `feature-factory status` to see all sessions.\n'));
          return;
        }
        targetSessionId = resumable.state.sessionId;
        console.log(chalk.gray(`Auto-selected session: ${targetSessionId}`));
      }

      const auditLogger = autonomousMode.enabled
        ? createAuditLogger(targetSessionId)
        : null;

      try {
        const events = orchestrator.resumeWorkflow(targetSessionId);
        await handleWorkflowEvents(events, orchestrator, auditLogger);
      } catch (error) {
        auditLogger?.log('workflow-error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(
          chalk.red(
            `\nFatal error: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
        process.exit(1);
      } finally {
        auditLogger?.close();
      }
    }
  );

// Sessions subcommand group
const sessionsCmd = program
  .command('sessions')
  .description('Manage workflow sessions');

// List sessions
sessionsCmd
  .command('list')
  .description('List all workflow sessions')
  .action(() => {
    const orchestrator = new FeatureFactoryOrchestrator({});
    const sessions = orchestrator.listSessions();

    if (sessions.length === 0) {
      console.log(chalk.yellow('\nNo sessions found.\n'));
      return;
    }

    console.log(chalk.bold(`\n📋 All Sessions (${sessions.length})\n`));

    for (const session of sessions) {
      const statusColor = {
        running: chalk.blue,
        'awaiting-approval': chalk.yellow,
        completed: chalk.green,
        failed: chalk.red,
        cancelled: chalk.gray,
      }[session.status] || chalk.white;

      console.log(`${chalk.bold(session.sessionId)} ${statusColor(`[${session.status}]`)}`);
      console.log(chalk.gray(`   ${session.workflow}: ${session.description.slice(0, 50)}...`));
      console.log();
    }
  });

// Cleanup sessions
sessionsCmd
  .command('cleanup')
  .description('Remove old completed/cancelled sessions')
  .option('-d, --days <days>', 'Remove sessions older than N days', '7')
  .option('--include-failed', 'Also remove failed sessions')
  .action(async (options: { days: string; includeFailed: boolean }) => {
    // Import cleanup function
    const { cleanupSessions } = await import('./session.js');

    const deleted = cleanupSessions(process.cwd(), {
      olderThanDays: parseInt(options.days),
      includeCompleted: true,
      includeFailed: options.includeFailed,
    });

    if (deleted > 0) {
      console.log(chalk.green(`\n✓ Cleaned up ${deleted} old session(s).\n`));
    } else {
      console.log(chalk.gray('\nNo sessions to clean up.\n'));
    }
  });

// Parse and execute
program.parse();
