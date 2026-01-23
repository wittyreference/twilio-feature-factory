// ABOUTME: Agent configuration index for Feature Factory.
// ABOUTME: Exports all agent configs and provides lookup function.

import type { AgentConfig, AgentType } from '../types.js';
import { architectAgent } from './architect.js';
import { specAgent } from './spec.js';
import { testGenAgent } from './test-gen.js';
import { devAgent } from './dev.js';
import { reviewAgent } from './review.js';
import { docsAgent } from './docs.js';

/**
 * All available agent configurations
 */
export const agents: Record<AgentType, AgentConfig> = {
  architect: architectAgent,
  spec: specAgent,
  'test-gen': testGenAgent,
  dev: devAgent,
  review: reviewAgent,
  docs: docsAgent,
};

/**
 * Get agent configuration by type
 */
export function getAgentConfig(agentType: AgentType): AgentConfig {
  const config = agents[agentType];
  if (!config) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }
  return config;
}

export {
  architectAgent,
  specAgent,
  testGenAgent,
  devAgent,
  reviewAgent,
  docsAgent,
};
