// ABOUTME: Unit tests for stall detection module.
// ABOUTME: Tests repetition, oscillation, idle detection, intervention tracking, and config.

import { describe, it, expect } from '@jest/globals';
import {
  hashToolInput,
  detectRepetition,
  detectOscillation,
  detectIdle,
  buildInterventionMessage,
  createStallTracker,
  DEFAULT_STALL_DETECTION_CONFIG,
  type StallDetectionConfig,
  type ToolCallRecord,
} from '../src/stall-detection.js';

// ============================================================================
// hashToolInput
// ============================================================================

describe('hashToolInput', () => {
  it('should return the same hash for identical input', () => {
    const input = { file_path: '/src/app.ts', content: 'hello' };
    expect(hashToolInput(input)).toBe(hashToolInput(input));
  });

  it('should be deterministic regardless of key order', () => {
    const a = { file_path: '/src/app.ts', content: 'hello' };
    const b = { content: 'hello', file_path: '/src/app.ts' };
    expect(hashToolInput(a)).toBe(hashToolInput(b));
  });

  it('should return different hashes for different input', () => {
    const a = { file_path: '/src/app.ts' };
    const b = { file_path: '/src/other.ts' };
    expect(hashToolInput(a)).not.toBe(hashToolInput(b));
  });
});

// ============================================================================
// Repetition detection
// ============================================================================

describe('detectRepetition', () => {
  it('should detect N consecutive identical calls at threshold', () => {
    const history = [
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Read', inputHash: 'aaa' },
    ];
    const result = detectRepetition(history, 3);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('repetition');
    expect(result!.evidence).toContain('Consecutive identical calls: 3');
  });

  it('should not trigger below threshold', () => {
    const history = [
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Read', inputHash: 'aaa' },
    ];
    expect(detectRepetition(history, 3)).toBeNull();
  });

  it('should not trigger when inputs differ', () => {
    const history = [
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Read', inputHash: 'bbb' },
      { toolName: 'Read', inputHash: 'ccc' },
    ];
    expect(detectRepetition(history, 3)).toBeNull();
  });

  it('should not trigger when tools differ', () => {
    const history = [
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'aaa' },
      { toolName: 'Glob', inputHash: 'aaa' },
    ];
    expect(detectRepetition(history, 3)).toBeNull();
  });

  it('should detect when exceeding threshold', () => {
    const history = [
      { toolName: 'Bash', inputHash: 'fff' },
      { toolName: 'Bash', inputHash: 'fff' },
      { toolName: 'Bash', inputHash: 'fff' },
      { toolName: 'Bash', inputHash: 'fff' },
      { toolName: 'Bash', inputHash: 'fff' },
    ];
    const result = detectRepetition(history, 3);
    expect(result).not.toBeNull();
    expect(result!.evidence).toContain('Consecutive identical calls: 5');
  });
});

// ============================================================================
// Oscillation detection
// ============================================================================

describe('detectOscillation', () => {
  it('should detect A-B-A-B-A-B pattern', () => {
    const history = [
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
    ];
    const result = detectOscillation(history, 6);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('oscillation');
    expect(result!.description).toContain('Read');
    expect(result!.description).toContain('Grep');
  });

  it('should not trigger for A-B-C pattern', () => {
    const history = [
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
      { toolName: 'Bash', inputHash: 'ccc' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
      { toolName: 'Bash', inputHash: 'ccc' },
    ];
    expect(detectOscillation(history, 6)).toBeNull();
  });

  it('should require the full window to match', () => {
    const history = [
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
    ];
    // Window of 6 but only 4 entries
    expect(detectOscillation(history, 6)).toBeNull();
  });

  it('should handle mixed calls before the oscillation pattern', () => {
    const history = [
      { toolName: 'Bash', inputHash: 'zzz' },
      { toolName: 'Write', inputHash: 'yyy' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Grep', inputHash: 'bbb' },
    ];
    // Uses last 6 entries
    const result = detectOscillation(history, 6);
    expect(result).not.toBeNull();
  });

  it('should treat same tool with different input as different', () => {
    const history = [
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Read', inputHash: 'bbb' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Read', inputHash: 'bbb' },
      { toolName: 'Read', inputHash: 'aaa' },
      { toolName: 'Read', inputHash: 'bbb' },
    ];
    const result = detectOscillation(history, 6);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('oscillation');
  });
});

// ============================================================================
// Idle detection
// ============================================================================

describe('detectIdle', () => {
  it('should trigger at threshold', () => {
    const result = detectIdle(10, 0, 10);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('idle');
    expect(result!.description).toContain('10 turns');
  });

  it('should not trigger below threshold', () => {
    expect(detectIdle(9, 0, 10)).toBeNull();
  });

  it('should reset when file activity is recent', () => {
    // File activity at turn 8, currently at turn 12, threshold 10
    expect(detectIdle(12, 8, 10)).toBeNull();
  });

  it('should trigger when file activity was long ago', () => {
    // File activity at turn 2, currently at turn 15, threshold 10
    const result = detectIdle(15, 2, 10);
    expect(result).not.toBeNull();
    expect(result!.evidence).toContain('Idle turns: 13');
  });

  it('should handle agent that never writes', () => {
    const result = detectIdle(20, 0, 10);
    expect(result).not.toBeNull();
    expect(result!.evidence).toContain('Last file activity: turn 0');
  });
});

// ============================================================================
// Intervention tracking
// ============================================================================

describe('StallTracker intervention tracking', () => {
  function makeTracker(config?: Partial<StallDetectionConfig>) {
    return createStallTracker({
      ...DEFAULT_STALL_DETECTION_CONFIG,
      ...config,
    });
  }

  it('should not hard stop before max interventions', () => {
    const tracker = makeTracker({ maxInterventions: 2 });
    tracker.recordIntervention();
    expect(tracker.shouldHardStop()).toBe(false);
    expect(tracker.getInterventionCount()).toBe(1);
  });

  it('should hard stop at max interventions', () => {
    const tracker = makeTracker({ maxInterventions: 2 });
    tracker.recordIntervention();
    tracker.recordIntervention();
    expect(tracker.shouldHardStop()).toBe(true);
    expect(tracker.getInterventionCount()).toBe(2);
  });

  it('should track intervention count correctly', () => {
    const tracker = makeTracker({ maxInterventions: 5 });
    expect(tracker.getInterventionCount()).toBe(0);
    tracker.recordIntervention();
    expect(tracker.getInterventionCount()).toBe(1);
    tracker.recordIntervention();
    tracker.recordIntervention();
    expect(tracker.getInterventionCount()).toBe(3);
  });

  it('should continue detecting after intervention', () => {
    const tracker = makeTracker({
      repetitionThreshold: 2,
      maxInterventions: 3,
    });

    // Trigger first detection
    const call: ToolCallRecord = { toolName: 'Read', inputHash: 'abc', hadFileActivity: false };
    tracker.recordTurn([call]);
    tracker.recordTurn([call]);
    expect(tracker.detectStall()).not.toBeNull();
    tracker.recordIntervention();

    // Trigger again
    tracker.recordTurn([call]);
    tracker.recordTurn([call]);
    expect(tracker.detectStall()).not.toBeNull();
  });
});

// ============================================================================
// Priority ordering
// ============================================================================

describe('StallTracker detection priority', () => {
  it('should detect repetition before oscillation', () => {
    // Build history that matches both repetition (3 consecutive) and could trigger other patterns
    const tracker = createStallTracker({
      ...DEFAULT_STALL_DETECTION_CONFIG,
      repetitionThreshold: 3,
      oscillationWindowSize: 6,
      idleTurnThreshold: 2,
    });

    const call: ToolCallRecord = { toolName: 'Read', inputHash: 'abc', hadFileActivity: false };
    tracker.recordTurn([call]);
    tracker.recordTurn([call]);
    tracker.recordTurn([call]);

    const stall = tracker.detectStall();
    expect(stall).not.toBeNull();
    expect(stall!.type).toBe('repetition');
  });

  it('should detect oscillation before idle', () => {
    const tracker = createStallTracker({
      ...DEFAULT_STALL_DETECTION_CONFIG,
      repetitionThreshold: 100, // disable repetition
      oscillationWindowSize: 4,
      idleTurnThreshold: 3,
    });

    const callA: ToolCallRecord = { toolName: 'Read', inputHash: 'aaa', hadFileActivity: false };
    const callB: ToolCallRecord = { toolName: 'Grep', inputHash: 'bbb', hadFileActivity: false };

    tracker.recordTurn([callA]);
    tracker.recordTurn([callB]);
    tracker.recordTurn([callA]);
    tracker.recordTurn([callB]);

    const stall = tracker.detectStall();
    expect(stall).not.toBeNull();
    expect(stall!.type).toBe('oscillation');
  });
});

// ============================================================================
// Config and disabled tracker
// ============================================================================

describe('StallTracker configuration', () => {
  it('should respect custom thresholds', () => {
    const tracker = createStallTracker({
      ...DEFAULT_STALL_DETECTION_CONFIG,
      repetitionThreshold: 5,
    });

    const call: ToolCallRecord = { toolName: 'Read', inputHash: 'abc', hadFileActivity: false };
    tracker.recordTurn([call]);
    tracker.recordTurn([call]);
    tracker.recordTurn([call]);
    // 3 calls, threshold is 5
    expect(tracker.detectStall()).toBeNull();

    tracker.recordTurn([call]);
    tracker.recordTurn([call]);
    // Now 5 calls
    expect(tracker.detectStall()).not.toBeNull();
  });

  it('should use default config values', () => {
    expect(DEFAULT_STALL_DETECTION_CONFIG.enabled).toBe(true);
    expect(DEFAULT_STALL_DETECTION_CONFIG.repetitionThreshold).toBe(3);
    expect(DEFAULT_STALL_DETECTION_CONFIG.oscillationWindowSize).toBe(6);
    expect(DEFAULT_STALL_DETECTION_CONFIG.idleTurnThreshold).toBe(10);
    expect(DEFAULT_STALL_DETECTION_CONFIG.maxInterventions).toBe(2);
  });

  it('should not detect stall when no problematic patterns exist', () => {
    const tracker = createStallTracker();

    // Normal varied workflow
    tracker.recordTurn([{ toolName: 'Read', inputHash: 'a', hadFileActivity: false }]);
    tracker.recordTurn([{ toolName: 'Grep', inputHash: 'b', hadFileActivity: false }]);
    tracker.recordTurn([{ toolName: 'Write', inputHash: 'c', hadFileActivity: true }]);
    tracker.recordTurn([{ toolName: 'Bash', inputHash: 'd', hadFileActivity: false }]);
    tracker.recordTurn([{ toolName: 'Edit', inputHash: 'e', hadFileActivity: true }]);

    expect(tracker.detectStall()).toBeNull();
  });
});

// ============================================================================
// buildInterventionMessage
// ============================================================================

describe('buildInterventionMessage', () => {
  it('should produce different messages for repetition', () => {
    const msg = buildInterventionMessage({
      type: 'repetition',
      description: 'Repeated Read 5 times',
      evidence: ['Tool: Read'],
    });
    expect(msg).toContain('STALL DETECTED');
    expect(msg).toContain('repeating the same tool call');
    expect(msg).toContain('different approach');
  });

  it('should produce different messages for oscillation', () => {
    const msg = buildInterventionMessage({
      type: 'oscillation',
      description: 'Oscillating between Read and Grep',
      evidence: ['Pattern A: Read', 'Pattern B: Grep'],
    });
    expect(msg).toContain('STALL DETECTED');
    expect(msg).toContain('oscillating');
    expect(msg).toContain('different strategy');
  });

  it('should produce different messages for idle', () => {
    const msg = buildInterventionMessage({
      type: 'idle',
      description: 'No file changes for 15 turns',
      evidence: ['Idle turns: 15'],
    });
    expect(msg).toContain('STALL DETECTED');
    expect(msg).toContain('not created or modified any files');
    expect(msg).toContain('start writing code');
  });
});

// ============================================================================
// Full tracker integration
// ============================================================================

describe('StallTracker full integration', () => {
  it('should track file activity and reset idle counter', () => {
    const tracker = createStallTracker({
      ...DEFAULT_STALL_DETECTION_CONFIG,
      idleTurnThreshold: 3,
      repetitionThreshold: 100, // disable
      oscillationWindowSize: 100, // disable
    });

    tracker.recordTurn([{ toolName: 'Read', inputHash: 'a', hadFileActivity: false }]);
    tracker.recordTurn([{ toolName: 'Read', inputHash: 'b', hadFileActivity: false }]);
    // Write resets the counter
    tracker.recordTurn([{ toolName: 'Write', inputHash: 'c', hadFileActivity: true }]);
    tracker.recordTurn([{ toolName: 'Read', inputHash: 'd', hadFileActivity: false }]);
    tracker.recordTurn([{ toolName: 'Read', inputHash: 'e', hadFileActivity: false }]);

    // Only 2 idle turns since last file activity, threshold is 3
    expect(tracker.detectStall()).toBeNull();
  });

  it('should detect idle after file activity gap', () => {
    const tracker = createStallTracker({
      ...DEFAULT_STALL_DETECTION_CONFIG,
      idleTurnThreshold: 3,
      repetitionThreshold: 100,
      oscillationWindowSize: 100,
    });

    tracker.recordTurn([{ toolName: 'Write', inputHash: 'a', hadFileActivity: true }]);
    tracker.recordTurn([{ toolName: 'Read', inputHash: 'b', hadFileActivity: false }]);
    tracker.recordTurn([{ toolName: 'Read', inputHash: 'c', hadFileActivity: false }]);
    tracker.recordTurn([{ toolName: 'Grep', inputHash: 'd', hadFileActivity: false }]);

    // 3 idle turns since last file activity (turns 2, 3, 4 — activity at turn 1)
    const stall = tracker.detectStall();
    expect(stall).not.toBeNull();
    expect(stall!.type).toBe('idle');
  });

  it('should handle multiple tool calls per turn', () => {
    const tracker = createStallTracker({
      ...DEFAULT_STALL_DETECTION_CONFIG,
      repetitionThreshold: 3,
    });

    // Each turn has 2 calls, but they are different
    tracker.recordTurn([
      { toolName: 'Read', inputHash: 'a', hadFileActivity: false },
      { toolName: 'Grep', inputHash: 'b', hadFileActivity: false },
    ]);
    tracker.recordTurn([
      { toolName: 'Read', inputHash: 'c', hadFileActivity: false },
      { toolName: 'Write', inputHash: 'd', hadFileActivity: true },
    ]);

    expect(tracker.detectStall()).toBeNull();
  });
});
