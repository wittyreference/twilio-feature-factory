// ABOUTME: MCP tool integration for Feature Factory agents.
// ABOUTME: Provides Twilio MCP tools and deep validation for agent self-verification.

import Twilio from 'twilio';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type Anthropic from '@anthropic-ai/sdk';
import type { ToolResult } from './tools.js';

// Import MCP tools from the local package dependency
import {
  messagingTools,
  voiceTools,
  phoneNumberTools,
  verifyTools,
  syncTools,
  taskrouterTools,
  debuggerTools,
  DeepValidator,
  type TwilioContext,
} from '@twilio-agent-factory/mcp-twilio';

/**
 * MCP tool configuration
 */
export interface McpToolConfig {
  accountSid?: string;
  authToken?: string;
  defaultFromNumber?: string;
  verifyServiceSid?: string;
  syncServiceSid?: string;
  taskrouterWorkspaceSid?: string;
}

/**
 * MCP tool instance with schema and executor
 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
  }>;
}

/**
 * Cached MCP tools and context
 */
let cachedContext: TwilioContext | null = null;
let cachedTools: McpTool[] | null = null;
let cachedValidator: DeepValidator | null = null;

/**
 * Initialize MCP tools with configuration
 */
export function initializeMcpTools(config: McpToolConfig = {}): void {
  const accountSid = config.accountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = config.authToken || process.env.TWILIO_AUTH_TOKEN;
  const defaultFromNumber =
    config.defaultFromNumber || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required for MCP tools');
  }

  if (!defaultFromNumber) {
    throw new Error('TWILIO_PHONE_NUMBER is required for MCP tools');
  }

  const client = Twilio(accountSid, authToken);

  cachedContext = {
    client,
    defaultFromNumber,
    verifyServiceSid:
      config.verifyServiceSid || process.env.TWILIO_VERIFY_SERVICE_SID,
    syncServiceSid:
      config.syncServiceSid || process.env.TWILIO_SYNC_SERVICE_SID,
    taskrouterWorkspaceSid:
      config.taskrouterWorkspaceSid ||
      process.env.TWILIO_TASKROUTER_WORKSPACE_SID,
  };

  // Initialize deep validator
  cachedValidator = new DeepValidator(client);

  // Collect all MCP tools
  cachedTools = [
    ...messagingTools(cachedContext),
    ...voiceTools(cachedContext),
    ...phoneNumberTools(cachedContext),
    ...verifyTools(cachedContext),
    ...syncTools(cachedContext),
    ...taskrouterTools(cachedContext),
    ...debuggerTools(cachedContext),
  ] as McpTool[];
}

/**
 * Get the deep validator instance
 */
export function getDeepValidator(): DeepValidator | null {
  return cachedValidator;
}

/**
 * Get the Twilio context
 */
export function getTwilioContext(): TwilioContext | null {
  return cachedContext;
}

/**
 * Check if MCP tools are initialized
 */
export function isMcpInitialized(): boolean {
  return cachedContext !== null && cachedTools !== null;
}

/**
 * Get all MCP tool names
 */
export function getMcpToolNames(): string[] {
  if (!cachedTools) {
    return [];
  }
  return cachedTools.map((t) => t.name);
}

/**
 * Convert Zod schema to JSON Schema for Anthropic API
 */
function zodToAnthropicSchema(
  zodSchema: z.ZodType
): Anthropic.Tool['input_schema'] {
  const jsonSchema = zodToJsonSchema(zodSchema, { target: 'openApi3' });

  // Remove $schema property which Anthropic doesn't accept
  const { $schema: _$schema, ...schemaWithoutMeta } = jsonSchema as Record<string, unknown>;

  return schemaWithoutMeta as Anthropic.Tool['input_schema'];
}

/**
 * Get MCP tool schemas for Anthropic API
 */
export function getMcpToolSchemas(): Anthropic.Tool[] {
  if (!cachedTools) {
    return [];
  }

  const schemas: Anthropic.Tool[] = cachedTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: zodToAnthropicSchema(tool.inputSchema),
  }));

  // Add deep validation tools
  schemas.push({
    name: 'validate_message',
    description:
      'Deep validate a sent message by checking delivery status, debugger alerts, and callbacks. Use after send_sms or send_mms to verify the message was actually delivered.',
    input_schema: {
      type: 'object',
      properties: {
        message_sid: {
          type: 'string',
          description: 'The Message SID to validate (SM...)',
        },
        wait_for_terminal: {
          type: 'boolean',
          description:
            'Wait for terminal status (delivered/failed). Default: true',
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds. Default: 30000',
        },
      },
      required: ['message_sid'],
    },
  });

  schemas.push({
    name: 'validate_call',
    description:
      'Deep validate a call by checking status, debugger alerts, call events, and Voice Insights. Use after make_call to verify the call connected and completed successfully.',
    input_schema: {
      type: 'object',
      properties: {
        call_sid: {
          type: 'string',
          description: 'The Call SID to validate (CA...)',
        },
        wait_for_terminal: {
          type: 'boolean',
          description:
            'Wait for terminal status (completed/failed). Default: true',
        },
        timeout_ms: {
          type: 'number',
          description: 'Timeout in milliseconds. Default: 30000',
        },
      },
      required: ['call_sid'],
    },
  });

  schemas.push({
    name: 'validate_verification',
    description:
      'Deep validate a verification by checking status and debugger alerts. Use after start_verification to verify the OTP was sent.',
    input_schema: {
      type: 'object',
      properties: {
        verification_sid: {
          type: 'string',
          description: 'The Verification SID to validate (VE...)',
        },
      },
      required: ['verification_sid'],
    },
  });

  return schemas;
}

/**
 * Execute an MCP tool
 */
export async function executeMcpTool(
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  if (!cachedTools || !cachedValidator || !cachedContext) {
    return {
      success: false,
      output: '',
      error: 'MCP tools not initialized. Call initializeMcpTools() first.',
    };
  }

  // Handle deep validation tools
  if (toolName === 'validate_message') {
    return await executeValidateMessage(input);
  }

  if (toolName === 'validate_call') {
    return await executeValidateCall(input);
  }

  if (toolName === 'validate_verification') {
    return await executeValidateVerification(input);
  }

  // Find and execute MCP tool
  const tool = cachedTools.find((t) => t.name === toolName);
  if (!tool) {
    return {
      success: false,
      output: '',
      error: `Unknown MCP tool: ${toolName}`,
    };
  }

  try {
    // Validate input with Zod schema
    const validatedInput = tool.inputSchema.parse(input);

    // Execute handler
    const result = await tool.handler(validatedInput);

    // Extract text output
    const textContent = result.content.find((c) => c.type === 'text');
    const output = textContent?.text || '';

    // Check if result indicates success
    let success = true;
    try {
      const parsed = JSON.parse(output);
      success = parsed.success !== false;
    } catch {
      // If not JSON, assume success
    }

    return {
      success,
      output,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        output: '',
        error: `Validation error: ${error.errors.map((e) => e.message).join(', ')}`,
      };
    }

    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute validate_message tool
 */
async function executeValidateMessage(
  input: Record<string, unknown>
): Promise<ToolResult> {
  if (!cachedValidator || !cachedContext) {
    return { success: false, output: '', error: 'Validator not initialized' };
  }

  const messageSid = input.message_sid as string;
  const waitForTerminal = (input.wait_for_terminal as boolean) ?? true;
  const timeout = (input.timeout_ms as number) ?? 30000;

  try {
    const result = await cachedValidator.validateMessage(messageSid, {
      waitForTerminal,
      timeout,
      syncServiceSid: cachedContext.syncServiceSid,
    });

    return {
      success: result.success,
      output: JSON.stringify(result, null, 2),
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Execute validate_call tool
 */
async function executeValidateCall(
  input: Record<string, unknown>
): Promise<ToolResult> {
  if (!cachedValidator || !cachedContext) {
    return { success: false, output: '', error: 'Validator not initialized' };
  }

  const callSid = input.call_sid as string;
  const waitForTerminal = (input.wait_for_terminal as boolean) ?? true;
  const timeout = (input.timeout_ms as number) ?? 30000;

  try {
    const result = await cachedValidator.validateCall(callSid, {
      waitForTerminal,
      timeout,
      syncServiceSid: cachedContext.syncServiceSid,
    });

    return {
      success: result.success,
      output: JSON.stringify(result, null, 2),
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Execute validate_verification tool
 */
async function executeValidateVerification(
  input: Record<string, unknown>
): Promise<ToolResult> {
  if (!cachedValidator || !cachedContext) {
    return { success: false, output: '', error: 'Validator not initialized' };
  }

  const verificationSid = input.verification_sid as string;

  if (!cachedContext.verifyServiceSid) {
    return {
      success: false,
      output: '',
      error: 'TWILIO_VERIFY_SERVICE_SID not configured',
    };
  }

  try {
    const result = await cachedValidator.validateVerification(
      cachedContext.verifyServiceSid,
      verificationSid,
      {}
    );

    return {
      success: result.success,
      output: JSON.stringify(result, null, 2),
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}

/**
 * Check if a tool name is an MCP tool
 */
/**
 * Static list of known MCP tool names (doesn't require initialization)
 */
const KNOWN_MCP_TOOLS = new Set([
  // Messaging
  'send_sms',
  'send_mms',
  'get_message_logs',
  'get_message_status',
  // Voice
  'get_call_logs',
  'make_call',
  'get_recording',
  // Phone Numbers
  'list_phone_numbers',
  'configure_webhook',
  'search_available_numbers',
  // Verify
  'start_verification',
  'check_verification',
  'get_verification_status',
  // Sync
  'create_document',
  'update_document',
  'get_document',
  'list_documents',
  // TaskRouter
  'create_task',
  'list_tasks',
  'get_task_status',
  'list_workers',
  'list_workflows',
  // Debugger
  'get_debugger_logs',
  'analyze_errors',
  'get_usage_records',
  // Deep Validation
  'validate_message',
  'validate_call',
  'validate_verification',
]);

/**
 * Check if a tool name is an MCP tool (works without initialization)
 */
export function isMcpTool(toolName: string): boolean {
  return KNOWN_MCP_TOOLS.has(toolName);
}
