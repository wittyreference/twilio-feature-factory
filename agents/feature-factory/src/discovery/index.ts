// ABOUTME: Export work discovery interfaces and poller for autonomous mode.
// ABOUTME: Enables agents to respond to discovered work without human initiation.

export {
  type DiscoveredWork,
  type WorkSource,
  type WorkPriority,
  type SuggestedWorkflow,
  type AutomationTier,
  type WorkDiscoveryConfig,
  determinePriority,
  determineAutomationTier,
  suggestWorkflow,
  createWorkFromValidation,
} from './work-discovery.js';

export {
  WorkPoller,
  createWorkPoller,
  type WorkPollerEvents,
} from './work-poller.js';
