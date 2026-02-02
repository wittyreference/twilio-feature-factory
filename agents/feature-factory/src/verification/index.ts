// ABOUTME: Export replay verification interfaces and verifier.
// ABOUTME: Validates that captured learnings improve fix performance.

export {
  type ReplayScenario,
  type ReplayAttempt,
  type ReplayResult,
  type ReplayComparison,
  type VerificationSummary,
  type ReplayVerifierConfig,
  type ReplayVerifierEvents,
  type FixExecutor,
  ReplayVerifier,
  createReplayVerifier,
} from './replay-verifier.js';
