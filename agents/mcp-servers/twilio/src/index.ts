// ABOUTME: Main entry point for the Twilio MCP server.
// ABOUTME: Exports the createTwilioMcpServer function for use with Claude Agent SDK.

import Twilio from 'twilio';
import { messagingTools } from './tools/messaging.js';
import { voiceTools } from './tools/voice.js';
import { phoneNumberTools } from './tools/phone-numbers.js';
import { verifyTools } from './tools/verify.js';
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

export interface TwilioMcpServerConfig {
  accountSid?: string;
  authToken?: string;
  defaultFromNumber?: string;
  verifyServiceSid?: string;
  syncServiceSid?: string;
  taskrouterWorkspaceSid?: string;
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
  const authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
  const defaultFromNumber = config.defaultFromNumber || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
  }

  if (!defaultFromNumber) {
    throw new Error('TWILIO_PHONE_NUMBER is required');
  }

  const client = Twilio(accountSid, authToken);

  const context: TwilioContext = {
    client,
    defaultFromNumber,
    verifyServiceSid: config.verifyServiceSid || process.env.TWILIO_VERIFY_SERVICE_SID,
    syncServiceSid: config.syncServiceSid || process.env.TWILIO_SYNC_SERVICE_SID,
    taskrouterWorkspaceSid: config.taskrouterWorkspaceSid || process.env.TWILIO_TASKROUTER_WORKSPACE_SID,
  };

  return {
    name: 'twilio-tools',
    version: '1.0.0',
    tools: [
      // P0 tools
      ...messagingTools(context),
      ...voiceTools(context),
      ...phoneNumberTools(context),
      ...verifyTools(context),
      ...syncTools(context),
      ...taskrouterTools(context),
      ...debuggerTools(context),
      // P1 tools
      ...lookupsTools(context),
      ...studioTools(context),
      ...messagingServicesTools(context),
      ...serverlessTools(context),
      // P2 tools
      ...intelligenceTools(context),
      ...videoTools(context),
      ...proxyTools(context),
      ...trusthubTools(context),
      ...contentTools(context),
      ...voiceConfigTools(context),
      ...regulatoryTools(context),
      ...mediaTools(context),
      // P3 tools
      ...sipTools(context),
      ...trunkingTools(context),
      ...accountsTools(context),
      ...iamTools(context),
      ...pricingTools(context),
      ...notifyTools(context),
      ...addressesTools(context),
      // Validation tools
      ...validationTools(context),
    ],
  };
}

// P0 tool exports
export { messagingTools } from './tools/messaging.js';
export { voiceTools } from './tools/voice.js';
export { phoneNumberTools } from './tools/phone-numbers.js';
export { verifyTools } from './tools/verify.js';
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
