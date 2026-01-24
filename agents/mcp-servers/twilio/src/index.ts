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
      ...messagingTools(context),
      ...voiceTools(context),
      ...phoneNumberTools(context),
      ...verifyTools(context),
      ...syncTools(context),
      ...taskrouterTools(context),
      ...debuggerTools(context),
    ],
  };
}

export { messagingTools } from './tools/messaging.js';
export { voiceTools } from './tools/voice.js';
export { phoneNumberTools } from './tools/phone-numbers.js';
export { verifyTools } from './tools/verify.js';
export { syncTools } from './tools/sync.js';
export { taskrouterTools } from './tools/taskrouter.js';
export { debuggerTools } from './tools/debugger.js';

// Export validation utilities
export {
  DeepValidator,
  createDeepValidator,
  type ValidationResult,
  type ValidationOptions,
  type CheckResult,
} from './validation/index.js';
