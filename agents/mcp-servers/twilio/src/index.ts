// ABOUTME: Main entry point for the Twilio MCP server.
// ABOUTME: Exports the createTwilioMcpServer function for use with Claude Agent SDK.

import Twilio from 'twilio';
import type { z } from 'zod';
import { messagingTools } from './tools/messaging.js';
import { voiceTools } from './tools/voice.js';
import { phoneNumberTools } from './tools/phone-numbers.js';
import { verifyTools } from './tools/verify.js';
import { paymentsTools } from './tools/payments.js';
import { syncTools } from './tools/sync.js';
import { taskrouterTools } from './tools/taskrouter.js';
import { debuggerTools } from './tools/debugger.js';
// P1 tools
import { lookupsTools } from './tools/lookups.js';
import { studioTools } from './tools/studio.js';
import { messagingServicesTools } from './tools/messaging-services.js';
import { serverlessTools } from './tools/serverless.js';
// P2 tools
import { intelligenceTools } from './tools/intelligence.js';
import { videoTools } from './tools/video.js';
import { proxyTools } from './tools/proxy.js';
import { trusthubTools } from './tools/trusthub.js';
import { contentTools } from './tools/content.js';
import { voiceConfigTools } from './tools/voice-config.js';
import { regulatoryTools } from './tools/regulatory.js';
import { mediaTools } from './tools/media.js';
// P3 tools
import { sipTools } from './tools/sip.js';
import { trunkingTools } from './tools/trunking.js';
import { accountsTools } from './tools/accounts.js';
import { iamTools } from './tools/iam.js';
import { pricingTools } from './tools/pricing.js';
import { notifyTools } from './tools/notify.js';
import { addressesTools } from './tools/addresses.js';
// Validation tools (Deep validation beyond HTTP 200)
import { validationTools } from './tools/validation.js';

/**
 * Priority tiers for tool loading. Default loads P0 + validation only.
 * Use 'all' to load every tool (340 tools — previous default behavior).
 */
export type ToolTier = 'P0' | 'P1' | 'P2' | 'P3' | 'validation' | 'all';

export interface TwilioMcpServerConfig {
  accountSid?: string;
  authToken?: string;
  apiKey?: string;
  apiSecret?: string;
  region?: string;
  edge?: string;
  defaultFromNumber?: string;
  verifyServiceSid?: string;
  syncServiceSid?: string;
  taskrouterWorkspaceSid?: string;
  /** Which tool tiers to load. Default: ['P0', 'validation'] (~108 tools). Use ['all'] for all 340. */
  toolTiers?: ToolTier[];
}

export interface TwilioTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (params: any) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>;
}

export interface TwilioContext {
  client: Twilio.Twilio;
  defaultFromNumber: string;
  verifyServiceSid?: string;
  syncServiceSid?: string;
  taskrouterWorkspaceSid?: string;
}

/**
 * Creates a Twilio MCP server instance with all available tools.
 *
 * @param config - Optional configuration. Falls back to environment variables.
 * @returns MCP server configuration object for use with Claude Agent SDK
 */
export function createTwilioMcpServer(config: TwilioMcpServerConfig = {}) {
  const accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const apiKey = config.apiKey || process.env.TWILIO_API_KEY;
  const apiSecret = config.apiSecret || process.env.TWILIO_API_SECRET;
  const authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
  const region = config.region || process.env.TWILIO_REGION;
  const edge = config.edge || process.env.TWILIO_EDGE;
  const defaultFromNumber = config.defaultFromNumber || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid) {
    throw new Error('TWILIO_ACCOUNT_SID is required');
  }

  if (!defaultFromNumber) {
    throw new Error('TWILIO_PHONE_NUMBER is required');
  }

  let client: Twilio.Twilio;
  if (apiKey && apiSecret) {
    client = Twilio(apiKey, apiSecret, { accountSid, region, edge });
  } else if (authToken) {
    client = Twilio(accountSid, authToken, { region, edge });
  } else {
    throw new Error(
      'Authentication required: set TWILIO_API_KEY + TWILIO_API_SECRET, or TWILIO_AUTH_TOKEN'
    );
  }

  const context: TwilioContext = {
    client,
    defaultFromNumber,
    verifyServiceSid: config.verifyServiceSid || process.env.TWILIO_VERIFY_SERVICE_SID,
    syncServiceSid: config.syncServiceSid || process.env.TWILIO_SYNC_SERVICE_SID,
    taskrouterWorkspaceSid: config.taskrouterWorkspaceSid || process.env.TWILIO_TASKROUTER_WORKSPACE_SID,
  };

  // Tool tier registry — maps each module to its priority tier
  const tierRegistry: Record<string, Array<(ctx: TwilioContext) => TwilioTool[]>> = {
    P0: [messagingTools, voiceTools, phoneNumberTools, verifyTools, paymentsTools, syncTools, taskrouterTools, debuggerTools],
    P1: [lookupsTools, studioTools, messagingServicesTools, serverlessTools],
    P2: [intelligenceTools, videoTools, proxyTools, trusthubTools, contentTools, voiceConfigTools, regulatoryTools, mediaTools],
    P3: [sipTools, trunkingTools, accountsTools, iamTools, pricingTools, notifyTools, addressesTools],
    validation: [validationTools],
  };

  // Determine which tiers to load
  const tiers = config.toolTiers ?? ['P0', 'validation'];
  const loadAll = tiers.includes('all');
  const activeTiers = loadAll ? ['P0', 'P1', 'P2', 'P3', 'validation'] : tiers;

  // Collect tools from active tiers
  const tools: TwilioTool[] = [];
  for (const tier of activeTiers) {
    const modules = tierRegistry[tier];
    if (modules) {
      for (const mod of modules) {
        tools.push(...mod(context));
      }
    }
  }

  return {
    name: 'twilio-tools',
    version: '1.0.0',
    tools,
  };
}

// P0 tool exports
export { messagingTools } from './tools/messaging.js';
export { voiceTools } from './tools/voice.js';
export { phoneNumberTools } from './tools/phone-numbers.js';
export { verifyTools } from './tools/verify.js';
export { paymentsTools } from './tools/payments.js';
export { syncTools } from './tools/sync.js';
export { taskrouterTools } from './tools/taskrouter.js';
export { debuggerTools } from './tools/debugger.js';
// P1 tool exports
export { lookupsTools } from './tools/lookups.js';
export { studioTools } from './tools/studio.js';
export { messagingServicesTools } from './tools/messaging-services.js';
export { serverlessTools } from './tools/serverless.js';
// P2 tool exports
export { intelligenceTools } from './tools/intelligence.js';
export { videoTools } from './tools/video.js';
export { proxyTools } from './tools/proxy.js';
export { trusthubTools } from './tools/trusthub.js';
export { contentTools } from './tools/content.js';
export { voiceConfigTools } from './tools/voice-config.js';
export { regulatoryTools } from './tools/regulatory.js';
export { mediaTools } from './tools/media.js';
// P3 tool exports
export { sipTools } from './tools/sip.js';
export { trunkingTools } from './tools/trunking.js';
export { accountsTools } from './tools/accounts.js';
export { iamTools } from './tools/iam.js';
export { pricingTools } from './tools/pricing.js';
export { notifyTools } from './tools/notify.js';
export { addressesTools } from './tools/addresses.js';
// Validation tool exports
export { validationTools } from './tools/validation.js';

// Export validation utilities
export {
  DeepValidator,
  createDeepValidator,
  type ValidationResult,
  type ValidationOptions,
  type CheckResult,
} from './validation/index.js';
