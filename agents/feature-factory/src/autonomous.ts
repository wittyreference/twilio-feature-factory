// ABOUTME: Autonomous mode utilities for Feature Factory.
// ABOUTME: Handles warning display, acknowledgment, session summaries, and audit logging.

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type {
  AutonomousModeConfig,
  AutonomousSessionSummary,
  WorkflowState,
} from './types.js';

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Box drawing characters for warning display
 */
const box = {
  topLeft: '\u2554',
  topRight: '\u2557',
  bottomLeft: '\u255a',
  bottomRight: '\u255d',
  horizontal: '\u2550',
  vertical: '\u2551',
  horizontalMiddle: '\u2560',
  horizontalMiddleRight: '\u2563',
};

/**
 * Display the autonomous mode warning box
 */
export function displayAutonomousWarning(): void {
  const width = 72;
  const horizontalLine = box.horizontal.repeat(width);

  const lines = [
    `${box.topLeft}${horizontalLine}${box.topRight}`,
    formatCenteredLine(
      `${colors.yellow}${colors.bold}  AUTONOMOUS MODE WARNING  ${colors.reset}`,
      width
    ),
    `${box.horizontalMiddle}${horizontalLine}${box.horizontalMiddleRight}`,
    formatLine('', width),
    formatLine(
      'This mode runs the full pipeline WITHOUT human approval prompts.',
      width
    ),
    formatLine('', width),
    formatLine(
      `${colors.red}REAL MONEY${colors.reset}: Twilio API calls will be made (charges apply).`,
      width
    ),
    formatLine(
      `${colors.red}REAL HUMANS${colors.reset}: Test calls/SMS may reach real phone numbers.`,
      width
    ),
    formatLine(
      `${colors.red}COMPLIANCE${colors.reset}: Ensure test numbers are properly isolated.`,
      width
    ),
    formatLine('', width),
    formatLine(`${colors.cyan}Quality gates STILL ENFORCED:${colors.reset}`, width),
    formatLine(
      `${colors.green}\u2713${colors.reset} TDD (tests must fail first, then pass)`,
      width
    ),
    formatLine(`${colors.green}\u2713${colors.reset} Linting (must pass)`, width),
    formatLine(
      `${colors.green}\u2713${colors.reset} Coverage (80% threshold)`,
      width
    ),
    formatLine(
      `${colors.green}\u2713${colors.reset} Credential safety (secrets never committed)`,
      width
    ),
    formatLine(
      `${colors.green}\u2713${colors.reset} Documentation flywheel (learnings captured)`,
      width
    ),
    formatLine('', width),
    formatLine(`${colors.cyan}When you return, you'll have:${colors.reset}`, width),
    formatLine('\u2022 Passing test results', width),
    formatLine('\u2022 E2E validation proof (real calls/messages)', width),
    formatLine('\u2022 Captured learnings', width),
    formatLine('\u2022 Recommended doc/code improvements', width),
    `${box.bottomLeft}${horizontalLine}${box.bottomRight}`,
  ];

  console.log('\n');
  lines.forEach((line) => console.log(line));
  console.log('\n');
}

/**
 * Format a line within the warning box
 */
function formatLine(content: string, width: number): string {
  // Strip ANSI codes for length calculation
  const visibleLength = content.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = width - visibleLength - 2; // -2 for box characters
  const leftPad = 2;
  const rightPad = Math.max(0, padding - leftPad);
  return `${box.vertical}${' '.repeat(leftPad)}${content}${' '.repeat(rightPad)}${box.vertical}`;
}

/**
 * Format a centered line within the warning box
 */
function formatCenteredLine(content: string, width: number): string {
  const visibleLength = content.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = width - visibleLength;
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return `${box.vertical}${' '.repeat(leftPad)}${content}${' '.repeat(rightPad)}${box.vertical}`;
}

/**
 * Acknowledgment phrase that must be typed exactly
 */
export const ACKNOWLEDGMENT_PHRASE = 'I ACKNOWLEDGE THE RISKS';

/**
 * Require user acknowledgment before proceeding with autonomous mode
 * Returns the updated AutonomousModeConfig if acknowledged, throws if cancelled
 */
export async function requireAcknowledgment(
  maxAttempts: number = 3
): Promise<AutonomousModeConfig> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    let attempts = 0;

    // Countdown before prompt
    console.log(`${colors.dim}Starting in 5 seconds...${colors.reset}`);
    let countdown = 5;
    const countdownInterval = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        process.stdout.write(`\r${colors.dim}Starting in ${countdown} seconds...${colors.reset}`);
      } else {
        clearInterval(countdownInterval);
        process.stdout.write('\r' + ' '.repeat(40) + '\r');
        promptForAcknowledgment();
      }
    }, 1000);

    function promptForAcknowledgment(): void {
      console.log(
        `\n${colors.yellow}To proceed, type: ${colors.bold}${ACKNOWLEDGMENT_PHRASE}${colors.reset}`
      );
      console.log(`${colors.dim}(${maxAttempts - attempts} attempts remaining)${colors.reset}\n`);

      rl.question('> ', (answer) => {
        attempts++;

        if (answer.trim() === ACKNOWLEDGMENT_PHRASE) {
          rl.close();
          console.log(
            `\n${colors.green}${colors.bold}Acknowledgment received. Proceeding with autonomous mode.${colors.reset}\n`
          );
          resolve({
            enabled: true,
            acknowledged: true,
            acknowledgedVia: 'interactive',
            acknowledgedAt: new Date(),
          });
        } else if (attempts >= maxAttempts) {
          rl.close();
          reject(
            new Error(
              `Acknowledgment failed after ${maxAttempts} attempts. Autonomous mode cancelled.`
            )
          );
        } else {
          console.log(
            `\n${colors.red}Incorrect. Please type exactly: ${ACKNOWLEDGMENT_PHRASE}${colors.reset}`
          );
          promptForAcknowledgment();
        }
      });
    }
  });
}

/**
 * Generate a comprehensive session summary
 */
export function generateSessionSummary(
  state: WorkflowState,
  startTime: Date,
  filesCreated: string[],
  filesModified: string[],
  auditLogPath: string
): AutonomousSessionSummary {
  const endTime = new Date();
  const durationMs = endTime.getTime() - startTime.getTime();

  // Extract test results from phase results
  const qaResult = state.phaseResults['qa'] || state.phaseResults['QA Agent'];
  const testResults = {
    unitTestsPassed: 0,
    unitTestsTotal: 0,
    integrationTestsPassed: 0,
    integrationTestsTotal: 0,
    coveragePercent: 0,
    lintClean: true,
  };

  if (qaResult?.output) {
    const output = qaResult.output as Record<string, unknown>;
    if (typeof output.unitTestsPassed === 'number') {
      testResults.unitTestsPassed = output.unitTestsPassed;
    }
    if (typeof output.unitTestsTotal === 'number') {
      testResults.unitTestsTotal = output.unitTestsTotal;
    }
    if (typeof output.integrationTestsPassed === 'number') {
      testResults.integrationTestsPassed = output.integrationTestsPassed;
    }
    if (typeof output.integrationTestsTotal === 'number') {
      testResults.integrationTestsTotal = output.integrationTestsTotal;
    }
    if (typeof output.coveragePercent === 'number') {
      testResults.coveragePercent = output.coveragePercent;
    }
    if (typeof output.lintClean === 'boolean') {
      testResults.lintClean = output.lintClean;
    }
  }

  // Count learnings from learnings.md if it exists
  let learningsCaptured = 0;
  const learningsPath = path.join(process.cwd(), '.claude', 'learnings.md');
  if (fs.existsSync(learningsPath)) {
    const content = fs.readFileSync(learningsPath, 'utf-8');
    // Count entries by looking for "**" patterns indicating learning titles
    const matches = content.match(/\*\*[^*]+\*\*:/g);
    learningsCaptured = matches ? matches.length : 0;
  }

  // Count pending actions
  let pendingActionsGenerated = 0;
  const pendingPath = path.join(process.cwd(), '.claude', 'pending-actions.md');
  if (fs.existsSync(pendingPath)) {
    const content = fs.readFileSync(pendingPath, 'utf-8');
    // Count entries by looking for "- [ ]" patterns
    const matches = content.match(/- \[ \]/g);
    pendingActionsGenerated = matches ? matches.length : 0;
  }

  // Calculate phases completed
  const phasesCompleted = Object.keys(state.phaseResults).length;

  return {
    sessionId: state.sessionId,
    durationMs,
    totalCostUsd: state.totalCostUsd,
    phasesCompleted,
    phasesTotal: 7, // Standard workflow has 7 phases
    testResults,
    filesCreated,
    filesModified,
    learningsCaptured,
    pendingActionsGenerated,
    e2eValidationPerformed: false, // Will be updated if E2E runs
    auditLogPath,
  };
}

/**
 * Display the session summary
 */
export function displaySessionSummary(summary: AutonomousSessionSummary): void {
  const width = 72;
  const horizontalLine = box.horizontal.repeat(width);

  const durationMinutes = Math.round(summary.durationMs / 60000);
  const phases = `${summary.phasesCompleted}/${summary.phasesTotal}`;
  const cost = `$${summary.totalCostUsd.toFixed(2)}`;

  const unitTests = `${summary.testResults.unitTestsPassed}/${summary.testResults.unitTestsTotal}`;
  const integrationTests = `${summary.testResults.integrationTestsPassed}/${summary.testResults.integrationTestsTotal}`;
  const coverage = `${summary.testResults.coveragePercent}%`;
  const lint = summary.testResults.lintClean ? 'Clean' : 'Issues found';

  const lines = [
    `${box.topLeft}${horizontalLine}${box.topRight}`,
    formatCenteredLine(
      `${colors.cyan}${colors.bold}AUTONOMOUS SESSION COMPLETE${colors.reset}`,
      width
    ),
    `${box.horizontalMiddle}${horizontalLine}${box.horizontalMiddleRight}`,
    formatLine('', width),
    formatLine(`Duration: ${durationMinutes} minutes`, width),
    formatLine(`Phases completed: ${phases}`, width),
    formatLine(`Cost: ${cost}`, width),
    formatLine('', width),
    formatLine(`${colors.cyan}TEST RESULTS:${colors.reset}`, width),
    formatLine(
      `${colors.green}\u2713${colors.reset} Unit tests: ${unitTests} passing`,
      width
    ),
    formatLine(
      `${colors.green}\u2713${colors.reset} Integration tests: ${integrationTests} passing`,
      width
    ),
    formatLine(
      `${colors.green}\u2713${colors.reset} Coverage: ${coverage}`,
      width
    ),
    formatLine(
      `${colors.green}\u2713${colors.reset} Lint: ${lint}`,
      width
    ),
    formatLine('', width),
  ];

  // Add E2E validation if performed
  if (summary.e2eValidationPerformed && summary.e2eValidationResult) {
    lines.push(
      formatLine(`${colors.cyan}E2E VALIDATION:${colors.reset}`, width),
      formatLine(
        `${colors.green}\u2713${colors.reset} Calls completed: ${summary.e2eValidationResult.callsCompleted}`,
        width
      ),
      formatLine(
        `${colors.green}\u2713${colors.reset} Messages delivered: ${summary.e2eValidationResult.messagesDelivered}`,
        width
      ),
      formatLine('', width)
    );
  }

  // Add files
  if (summary.filesCreated.length > 0 || summary.filesModified.length > 0) {
    lines.push(formatLine(`${colors.cyan}FILES:${colors.reset}`, width));
    summary.filesCreated.slice(0, 5).forEach((file) => {
      lines.push(formatLine(`\u2022 ${path.basename(file)} (created)`, width));
    });
    summary.filesModified.slice(0, 5).forEach((file) => {
      lines.push(formatLine(`\u2022 ${path.basename(file)} (modified)`, width));
    });
    const totalFiles = summary.filesCreated.length + summary.filesModified.length;
    if (totalFiles > 10) {
      lines.push(formatLine(`(+ ${totalFiles - 10} more files)`, width));
    }
    lines.push(formatLine('', width));
  }

  // Add learnings and pending actions
  lines.push(
    formatLine(
      `${colors.cyan}LEARNINGS CAPTURED:${colors.reset} .claude/learnings.md`,
      width
    ),
    formatLine(`\u2022 ${summary.learningsCaptured} discoveries documented`, width),
    formatLine('', width),
    formatLine(
      `${colors.cyan}RECOMMENDED ACTIONS:${colors.reset} .claude/pending-actions.md`,
      width
    ),
    formatLine(
      `\u2022 ${summary.pendingActionsGenerated} documentation updates suggested`,
      width
    ),
    formatLine('', width),
    formatLine(`${colors.dim}AUDIT LOG: ${summary.auditLogPath}${colors.reset}`, width),
    `${box.bottomLeft}${horizontalLine}${box.bottomRight}`
  );

  console.log('\n');
  lines.forEach((line) => console.log(line));
  console.log('\n');
}

/**
 * Audit logger for autonomous sessions
 */
export interface AuditLogger {
  log: (event: string, data?: Record<string, unknown>) => void;
  getPath: () => string;
  close: () => void;
}

/**
 * Create an audit logger for tracking autonomous session actions
 */
export function createAuditLogger(sessionId: string): AuditLogger {
  const auditDir = path.join(process.cwd(), '.feature-factory');
  if (!fs.existsSync(auditDir)) {
    fs.mkdirSync(auditDir, { recursive: true });
  }

  const logPath = path.join(auditDir, `autonomous-${sessionId}.log`);
  const stream = fs.createWriteStream(logPath, { flags: 'a' });

  // Write header
  stream.write(`\n${'='.repeat(80)}\n`);
  stream.write(`Autonomous Session: ${sessionId}\n`);
  stream.write(`Started: ${new Date().toISOString()}\n`);
  stream.write(`${'='.repeat(80)}\n\n`);

  return {
    log: (event: string, data?: Record<string, unknown>) => {
      const timestamp = new Date().toISOString();
      let line = `[${timestamp}] ${event}`;
      if (data) {
        line += ` ${JSON.stringify(data)}`;
      }
      stream.write(line + '\n');
    },
    getPath: () => logPath,
    close: () => {
      stream.write(`\n${'='.repeat(80)}\n`);
      stream.write(`Session ended: ${new Date().toISOString()}\n`);
      stream.write(`${'='.repeat(80)}\n`);
      stream.end();
    },
  };
}

/**
 * Check if running in CI/CD environment with autonomous mode enabled
 */
export function isAutonomousCICD(): boolean {
  return (
    process.env.FEATURE_FACTORY_AUTONOMOUS === 'true' &&
    process.env.FEATURE_FACTORY_AUTONOMOUS_ACKNOWLEDGED === 'true'
  );
}
