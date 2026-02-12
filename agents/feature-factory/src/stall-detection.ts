// ABOUTME: Stall detection for Feature Factory agents.
// ABOUTME: Detects repetition, oscillation, and idle patterns to prevent stuck agents.

/**
 * Configuration for stall detection behavior
 */
export interface StallDetectionConfig {
  /** Whether stall detection is enabled */
  enabled: boolean;

  /** Number of consecutive identical tool calls to trigger repetition detection */
  repetitionThreshold: number;

  /** Window size for oscillation detection (A-B-A-B pattern) */
  oscillationWindowSize: number;

  /** Number of turns without file changes to trigger idle detection */
  idleTurnThreshold: number;

  /** Hard stop after this many interventions */
  maxInterventions: number;
}

/** Types of stalls that can be detected */
export type StallType = 'repetition' | 'oscillation' | 'idle';

/** Description of a detected stall */
export interface StallDetection {
  /** Which stall pattern was detected */
  type: StallType;

  /** Human-readable description of the stall */
  description: string;

  /** Evidence details that triggered the detection */
  evidence: string[];
}

/** Record of a single tool call within a turn */
export interface ToolCallRecord {
  /** Name of the tool that was called */
  toolName: string;

  /** Hash of the tool input for comparison */
  inputHash: string;

  /** Whether this tool call produced file changes */
  hadFileActivity: boolean;
}

/** Tracker interface for monitoring agent stall behavior */
export interface StallTracker {
  /** Record tool calls from a completed turn */
  recordTurn(calls: ToolCallRecord[]): void;

  /** Check if the agent is currently stalled */
  detectStall(): StallDetection | null;

  /** Record that an intervention was sent to the agent */
  recordIntervention(): void;

  /** Whether the agent should be hard-stopped (exceeded max interventions) */
  shouldHardStop(): boolean;

  /** Number of interventions sent so far */
  getInterventionCount(): number;
}

/** Default stall detection configuration */
export const DEFAULT_STALL_DETECTION_CONFIG: StallDetectionConfig = {
  enabled: true,
  repetitionThreshold: 3,
  oscillationWindowSize: 6,
  idleTurnThreshold: 10,
  maxInterventions: 2,
};

/**
 * Deterministic hash of tool input for comparison.
 * Uses djb2 algorithm on sorted JSON representation.
 */
export function hashToolInput(input: Record<string, unknown>): string {
  const str = JSON.stringify(input, Object.keys(input).sort());
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  // Convert to unsigned and return as hex
  return (hash >>> 0).toString(16);
}

/**
 * Detect N consecutive identical (toolName, inputHash) pairs at the tail of history.
 */
export function detectRepetition(
  history: Array<{ toolName: string; inputHash: string }>,
  threshold: number
): StallDetection | null {
  if (history.length < threshold) {return null;}

  const tail = history[history.length - 1];
  let count = 0;

  for (let i = history.length - 1; i >= 0; i--) {
    if (
      history[i].toolName === tail.toolName &&
      history[i].inputHash === tail.inputHash
    ) {
      count++;
    } else {
      break;
    }
  }

  if (count >= threshold) {
    return {
      type: 'repetition',
      description: `Repeated ${tail.toolName} with identical input ${count} times`,
      evidence: [
        `Tool: ${tail.toolName}`,
        `Consecutive identical calls: ${count}`,
        `Threshold: ${threshold}`,
      ],
    };
  }

  return null;
}

/**
 * Detect A-B-A-B oscillation pattern in the tail of history.
 * Requires alternating pairs for at least windowSize entries.
 */
export function detectOscillation(
  history: Array<{ toolName: string; inputHash: string }>,
  windowSize: number
): StallDetection | null {
  if (history.length < windowSize || windowSize < 4) {return null;}

  const window = history.slice(-windowSize);
  const keyA = `${window[0].toolName}:${window[0].inputHash}`;
  const keyB = `${window[1].toolName}:${window[1].inputHash}`;

  // Must be different calls
  if (keyA === keyB) {return null;}

  // Check that the entire window alternates A-B-A-B
  for (let i = 0; i < window.length; i++) {
    const key = `${window[i].toolName}:${window[i].inputHash}`;
    const expected = i % 2 === 0 ? keyA : keyB;
    if (key !== expected) {return null;}
  }

  return {
    type: 'oscillation',
    description: `Oscillating between ${window[0].toolName} and ${window[1].toolName}`,
    evidence: [
      `Pattern A: ${window[0].toolName} (hash: ${window[0].inputHash})`,
      `Pattern B: ${window[1].toolName} (hash: ${window[1].inputHash})`,
      `Window size: ${windowSize}`,
    ],
  };
}

/**
 * Detect extended idle periods without file activity.
 */
export function detectIdle(
  currentTurn: number,
  lastFileActivityTurn: number,
  threshold: number
): StallDetection | null {
  const idleTurns = currentTurn - lastFileActivityTurn;

  if (idleTurns >= threshold) {
    return {
      type: 'idle',
      description: `No file changes for ${idleTurns} turns`,
      evidence: [
        `Current turn: ${currentTurn}`,
        `Last file activity: turn ${lastFileActivityTurn}`,
        `Idle turns: ${idleTurns}`,
        `Threshold: ${threshold}`,
      ],
    };
  }

  return null;
}

/**
 * Build a human-readable intervention message for the agent.
 */
export function buildInterventionMessage(stall: StallDetection): string {
  const header = '=== STALL DETECTED ===\n\n';
  const footer =
    '\n\nIf you cannot make progress, summarize what you have accomplished and what is blocking you, then stop.';

  switch (stall.type) {
    case 'repetition':
      return (
        header +
        'You are repeating the same tool call with identical input. ' +
        `${stall.description}. ` +
        'Try a different approach or different input.' +
        footer
      );

    case 'oscillation':
      return (
        header +
        'You are oscillating between two actions without making progress. ' +
        `${stall.description}. ` +
        'Step back, reassess your approach, and try a different strategy.' +
        footer
      );

    case 'idle':
      return (
        header +
        'You have not created or modified any files for an extended period. ' +
        `${stall.description}. ` +
        'If you are researching, start writing code. If you are stuck, explain what is blocking you.' +
        footer
      );
  }
}

/**
 * Create a stall tracker with the given configuration.
 * Returns a StallTracker that maintains internal state via closure.
 */
export function createStallTracker(
  config: StallDetectionConfig = DEFAULT_STALL_DETECTION_CONFIG
): StallTracker {
  const history: Array<{ toolName: string; inputHash: string }> = [];
  let interventionCount = 0;
  let lastFileActivityTurn = 0;
  let currentTurn = 0;

  return {
    recordTurn(calls: ToolCallRecord[]): void {
      currentTurn++;

      for (const call of calls) {
        history.push({
          toolName: call.toolName,
          inputHash: call.inputHash,
        });

        if (call.hadFileActivity) {
          lastFileActivityTurn = currentTurn;
        }
      }
    },

    detectStall(): StallDetection | null {
      // Priority: repetition > oscillation > idle
      const repetition = detectRepetition(history, config.repetitionThreshold);
      if (repetition) {return repetition;}

      const oscillation = detectOscillation(
        history,
        config.oscillationWindowSize
      );
      if (oscillation) {return oscillation;}

      const idle = detectIdle(
        currentTurn,
        lastFileActivityTurn,
        config.idleTurnThreshold
      );
      if (idle) {return idle;}

      return null;
    },

    recordIntervention(): void {
      interventionCount++;
    },

    shouldHardStop(): boolean {
      return interventionCount >= config.maxInterventions;
    },

    getInterventionCount(): number {
      return interventionCount;
    },
  };
}
