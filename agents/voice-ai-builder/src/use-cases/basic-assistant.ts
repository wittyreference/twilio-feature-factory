// ABOUTME: Basic assistant use case configuration for Voice AI Builder.
// ABOUTME: Simple conversational AI without tool calling capabilities.

import type { UseCaseConfig } from '../types.js';

/**
 * Basic Assistant Use Case
 *
 * A simple conversational AI that can answer questions and have natural
 * conversations without needing to call external tools or APIs.
 *
 * Best for:
 * - Information queries
 * - FAQ-style interactions
 * - General customer engagement
 * - Getting started with voice AI
 */
export const basicAssistantConfig: UseCaseConfig = {
  name: 'basic-assistant',
  description: 'Simple conversational AI without tool calling',

  systemPrompt: `You are a helpful voice assistant. Your role is to have natural, helpful conversations with callers.

Guidelines:
- Keep responses concise (1-2 sentences) since this is a phone conversation
- Be friendly and professional
- If you don't know something, say so honestly
- Avoid long lists or complex explanations - offer to explain one thing at a time
- Use natural conversational language, not formal written language

Remember: The caller cannot see text, only hear your responses. Optimize for spoken clarity.`,

  defaultVoice: 'Google.en-US-Neural2-F',
  defaultLanguage: 'en-US',

  // No tools for basic assistant
  defaultTools: [],

  // No escalation triggers for basic assistant
  escalationTriggers: [],

  conversationConfig: {
    maxTurns: 20,
    silenceTimeout: 5000,
    interruptible: true,
  },
};
