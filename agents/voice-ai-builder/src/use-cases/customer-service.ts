// ABOUTME: Customer service use case configuration for Voice AI Builder.
// ABOUTME: Tool-calling agent with account lookup, order status, and human escalation.

import type { UseCaseConfig, ToolDefinition } from '../types.js';

/**
 * Customer Service Tools
 */
const customerServiceTools: ToolDefinition[] = [
  {
    name: 'lookup_account',
    description: 'Look up customer account by phone number or account ID. Returns account details including name, status, and recent activity.',
    inputSchema: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Customer phone number in E.164 format',
        },
        accountId: {
          type: 'string',
          description: 'Customer account ID',
        },
      },
    },
  },
  {
    name: 'check_order_status',
    description: 'Check the status of a customer order. Returns order status, estimated delivery, and tracking information.',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          description: 'Order ID or order number',
        },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'transfer_to_agent',
    description: 'Transfer the call to a human agent. Use when customer requests a human or when the issue is beyond AI capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for the transfer',
        },
        department: {
          type: 'string',
          enum: ['billing', 'technical', 'general', 'sales'],
          description: 'Department to transfer to',
        },
        priority: {
          type: 'string',
          enum: ['normal', 'high'],
          description: 'Transfer priority level',
        },
      },
      required: ['reason'],
    },
  },
];

/**
 * Customer Service Use Case
 *
 * A full-featured customer service agent that can look up account information,
 * check order status, and escalate to human agents when needed.
 *
 * Best for:
 * - E-commerce customer support
 * - Account inquiries
 * - Order status checking
 * - Tiered support with human fallback
 */
export const customerServiceConfig: UseCaseConfig = {
  name: 'customer-service',
  description: 'Customer service agent with tool calling and human escalation',

  systemPrompt: `You are a customer service agent. Your role is to help customers with their account and order inquiries.

You have access to the following capabilities:
1. Look up customer accounts by phone number or account ID
2. Check order status and tracking information
3. Transfer to a human agent when needed

Guidelines:
- Keep responses concise (1-2 sentences) since this is a phone conversation
- Always verify the customer's identity before sharing account details
- If the customer asks for something you cannot help with, offer to transfer them
- Be empathetic when customers are frustrated
- Never make up information - use your tools to get accurate data

When to transfer to a human:
- Customer explicitly requests a human agent
- The issue requires actions you cannot perform (refunds, cancellations, etc.)
- Customer is highly frustrated or upset
- Complex issues that require human judgment

Remember: The caller cannot see text, only hear your responses. Speak clearly and confirm important details.`,

  defaultVoice: 'Polly.Matthew',
  defaultLanguage: 'en-US',

  defaultTools: customerServiceTools,

  escalationTriggers: [
    'talk to a human',
    'speak to a person',
    'agent please',
    'real person',
    'supervisor',
    'manager',
    'representative',
    'human agent',
    'live agent',
    'transfer me',
  ],

  conversationConfig: {
    maxTurns: 30,
    silenceTimeout: 5000,
    interruptible: true,
  },
};

// Export tools separately for testing
export { customerServiceTools };
