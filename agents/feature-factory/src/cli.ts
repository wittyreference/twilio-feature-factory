#!/usr/bin/env node
// ABOUTME: CLI interface for Feature Factory.
// ABOUTME: Provides commands to run autonomous Twilio feature development pipelines.

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as readline from 'readline';
import { FeatureFactoryOrchestrator } from './orchestrator.js';
import type { WorkflowEvent, ApprovalMode } from './types.js';

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
  orchestrator: FeatureFactoryOrchestrator
): Promise<void> {
  let spinner = ora();

  for await (const event of events) {
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
          await handleWorkflowEvents(continueEvents, orchestrator);
        } else {
          const feedback = await promptForFeedback();
          console.log(chalk.red('✗ Rejected'));
          const rejectEvents = orchestrator.continueWorkflow(false, feedback);
          await handleWorkflowEvents(rejectEvents, orchestrator);
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

      case 'workflow-error':
        spinner.fail(chalk.red(`Error: ${event.error}`));
        if (event.phase) {
          console.log(chalk.gray(`   Phase: ${event.phase}`));
        }
        console.log(
          chalk.gray(`   Recoverable: ${event.recoverable ? 'yes' : 'no'}`)
        );
        break;
    }
  }
}

/**
 * Prompt user for approval
 */
async function promptForApproval(): Promise<boolean> {
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
}

/**
 * Prompt user for feedback
 */
async function promptForFeedback(): Promise<string> {
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
}

// New Feature command
program
  .command('new-feature <description>')
  .description('Run the new feature development pipeline')
  .option('-b, --budget <amount>', 'Maximum budget in USD', '5.00')
  .option(
    '-m, --model <model>',
    'Default model (sonnet, opus, haiku)',
    'sonnet'
  )
  .option('--no-approval', 'Skip approval gates (autonomous mode)')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(
    async (
      description: string,
      options: {
        budget: string;
        model: string;
        approval: boolean;
        verbose: boolean;
      }
    ) => {
      console.log(chalk.bold('\n🏭 Feature Factory\n'));

      const approvalMode: ApprovalMode = options.approval
        ? 'after-each-phase'
        : 'none';

      const orchestrator = new FeatureFactoryOrchestrator({
        maxBudgetUsd: parseFloat(options.budget),
        defaultModel: options.model as 'sonnet' | 'opus' | 'haiku',
        approvalMode,
        verbose: options.verbose,
      });

      console.log(
        chalk.gray(
          `Config: budget=${formatCurrency(parseFloat(options.budget))}, model=${options.model}, approval=${approvalMode}`
        )
      );

      try {
        const events = orchestrator.runWorkflow('new-feature', description);
        await handleWorkflowEvents(events, orchestrator);
      } catch (error) {
        console.error(
          chalk.red(
            `\nFatal error: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
        process.exit(1);
      }
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

// Resume command - continue a paused workflow
program
  .command('resume [sessionId]')
  .description('Resume a paused workflow')
  .option('-b, --budget <amount>', 'Maximum budget in USD', '5.00')
  .option('-v, --verbose', 'Enable verbose logging')
  .action(
    async (
      sessionId: string | undefined,
      options: { budget: string; verbose: boolean }
    ) => {
      console.log(chalk.bold('\n🏭 Feature Factory - Resume\n'));

      const orchestrator = new FeatureFactoryOrchestrator({
        maxBudgetUsd: parseFloat(options.budget),
        verbose: options.verbose,
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

      try {
        const events = orchestrator.resumeWorkflow(targetSessionId);
        await handleWorkflowEvents(events, orchestrator);
      } catch (error) {
        console.error(
          chalk.red(
            `\nFatal error: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
        process.exit(1);
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
  .action((options: { days: string; includeFailed: boolean }) => {
    // Import cleanup function
    const { cleanupSessions } = require('./session.js');

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
