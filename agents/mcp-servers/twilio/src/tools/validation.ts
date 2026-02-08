// ABOUTME: Deep validation tools that expose DeepValidator and ComprehensiveValidator as MCP tools.
// ABOUTME: Provides validate_call, validate_message, validate_voice_ai_flow, and validate_debugger tools.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';
import { DeepValidator, ComprehensiveValidator } from '../validation/index.js';

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
) {
  return { name, description, inputSchema: schema, handler };
}

/**
 * Returns all deep validation tools configured with the given Twilio context.
 */
export function validationTools(context: TwilioContext) {
  const { client } = context;

  const validateCall = createTool(
    'validate_call',
    'Deep validate a call - checks status, notifications, events, Voice Insights, and optionally content quality (recordings/transcripts). Use after making calls to verify they truly succeeded beyond HTTP 200.',
    z.object({
      callSid: z.string().describe('Call SID to validate (CA...)'),
      validateContent: z.boolean().optional().default(false).describe('Enable content validation (check recordings/transcripts for errors)'),
      minDuration: z.number().optional().describe('Minimum expected duration in seconds (default: 15). Shorter calls may indicate errors.'),
      forbiddenPatterns: z.array(z.string()).optional().describe('Patterns that should NOT appear in transcripts (e.g., ["application error", "please try again"])'),
      intelligenceServiceSid: z.string().optional().describe('Voice Intelligence Service SID for transcript analysis'),
      requireRecording: z.boolean().optional().default(false).describe('Fail if no recording exists'),
      waitForTerminal: z.boolean().optional().default(true).describe('Wait for call to reach terminal status'),
      timeout: z.number().optional().default(30000).describe('Maximum wait time in ms'),
    }),
    async ({ callSid, validateContent, minDuration, forbiddenPatterns, intelligenceServiceSid, requireRecording, waitForTerminal, timeout }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateCall(callSid, {
        validateContent,
        minDuration,
        forbiddenPatterns,
        intelligenceServiceSid,
        requireRecording,
        waitForTerminal,
        timeout,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateMessage = createTool(
    'validate_message',
    'Deep validate a message - checks delivery status and debugger alerts. Use after sending SMS/MMS to verify delivery beyond HTTP 200.',
    z.object({
      messageSid: z.string().describe('Message SID to validate (SM...)'),
      waitForTerminal: z.boolean().optional().default(true).describe('Wait for terminal status (delivered/undelivered/failed)'),
      timeout: z.number().optional().default(30000).describe('Maximum wait time in ms'),
    }),
    async ({ messageSid, waitForTerminal, timeout }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateMessage(messageSid, {
        waitForTerminal,
        timeout,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateVoiceAiFlow = createTool(
    'validate_voice_ai_flow',
    'Comprehensive validation for Voice AI flows - validates call, recording, transcript, message, and sync state. Use for end-to-end voice AI validation.',
    z.object({
      callSid: z.string().describe('Call SID to validate'),
      recordingSid: z.string().optional().describe('Recording SID (optional - will be auto-discovered from call)'),
      transcriptSid: z.string().optional().describe('Transcript SID (optional - will be auto-discovered)'),
      smsSid: z.string().optional().describe('SMS summary SID (optional - validates if provided)'),
      syncDocumentName: z.string().optional().describe('Sync document name to validate (optional)'),
      forbiddenPatterns: z.array(z.string()).optional().describe('Patterns that should NOT appear in conversation'),
      minSentencesPerSide: z.number().optional().describe('Minimum sentences per side for two-way validation'),
      intelligenceServiceSid: z.string().optional().describe('Voice Intelligence Service SID'),
      syncServiceSid: z.string().optional().describe('Sync Service SID'),
      serverlessServiceSid: z.string().optional().describe('Serverless Service SID'),
      conversationRelayUrl: z.string().optional().describe('ConversationRelay WebSocket URL to validate'),
      projectRoot: z.string().optional().describe('Project root for learnings storage (default: process.cwd())'),
    }),
    async ({ callSid, recordingSid, transcriptSid, smsSid, syncDocumentName, forbiddenPatterns, minSentencesPerSide, intelligenceServiceSid, syncServiceSid, serverlessServiceSid, conversationRelayUrl, projectRoot }) => {
      const validator = new ComprehensiveValidator(client, {
        projectRoot: projectRoot || process.cwd(),
      });

      const result = await validator.validateVoiceAIFlow({
        callSid,
        recordingSid,
        transcriptSid,
        smsSid,
        syncDocumentName,
        forbiddenPatterns,
        minSentencesPerSide,
        intelligenceServiceSid,
        syncServiceSid: syncServiceSid || context.syncServiceSid,
        serverlessServiceSid,
        conversationRelayUrl,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateDebugger = createTool(
    'validate_debugger',
    'Check Twilio debugger for errors in a time window. Use after operations to ensure no errors occurred.',
    z.object({
      lookbackSeconds: z.number().optional().default(300).describe('How far back to check (seconds, default: 300 = 5 min)'),
      resourceSid: z.string().optional().describe('Filter to specific resource SID'),
      logLevel: z.enum(['error', 'warning', 'notice', 'debug']).optional().describe('Filter by log level'),
      limit: z.number().optional().default(100).describe('Maximum alerts to return'),
    }),
    async ({ lookbackSeconds, resourceSid, logLevel, limit }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateDebugger({
        lookbackSeconds,
        resourceSid,
        logLevel,
        limit,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateRecording = createTool(
    'validate_recording',
    'Validate a call/conference recording completed successfully.',
    z.object({
      recordingSid: z.string().describe('Recording SID to validate (RE...)'),
      waitForCompleted: z.boolean().optional().default(true).describe('Wait for recording to complete'),
      timeout: z.number().optional().default(60000).describe('Maximum wait time in ms'),
    }),
    async ({ recordingSid, waitForCompleted, timeout }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateRecording(recordingSid, {
        waitForCompleted,
        timeout,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateTranscript = createTool(
    'validate_transcript',
    'Validate a Voice Intelligence transcript completed successfully.',
    z.object({
      transcriptSid: z.string().describe('Transcript SID to validate (GT...)'),
      waitForCompleted: z.boolean().optional().default(true).describe('Wait for transcript to complete'),
      timeout: z.number().optional().default(120000).describe('Maximum wait time in ms'),
      checkSentences: z.boolean().optional().default(true).describe('Verify transcript has sentences'),
    }),
    async ({ transcriptSid, waitForCompleted, timeout, checkSentences }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateTranscript(transcriptSid, {
        waitForCompleted,
        timeout,
        checkSentences,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateTwoWay = createTool(
    'validate_two_way',
    'Validate a two-way conversation between two calls (e.g., AI agent and customer). Checks both transcripts for natural conversation flow.',
    z.object({
      callSidA: z.string().describe('First call leg SID (e.g., AI agent)'),
      callSidB: z.string().describe('Second call leg SID (e.g., customer)'),
      intelligenceServiceSid: z.string().describe('Voice Intelligence Service SID'),
      expectedTurns: z.number().optional().default(2).describe('Minimum speaker turns expected'),
      topicKeywords: z.array(z.string()).optional().describe('Keywords that should appear in conversation'),
      successPhrases: z.array(z.string()).optional().describe('Phrases indicating successful completion'),
      forbiddenPatterns: z.array(z.string()).optional().describe('Patterns that should NOT appear (errors)'),
      waitForTranscripts: z.boolean().optional().default(true).describe('Wait for transcripts to complete'),
      timeout: z.number().optional().default(120000).describe('Maximum wait time in ms'),
    }),
    async ({ callSidA, callSidB, intelligenceServiceSid, expectedTurns, topicKeywords, successPhrases, forbiddenPatterns, waitForTranscripts, timeout }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateTwoWay({
        callSidA,
        callSidB,
        intelligenceServiceSid,
        expectedTurns,
        topicKeywords,
        successPhrases,
        forbiddenPatterns,
        waitForTranscripts,
        timeout,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const validateLanguageOperator = createTool(
    'validate_language_operator',
    'Validate that Language Operators (summarization, classification, extraction) ran successfully on a transcript. Use after transcript completes to verify operators produced results.',
    z.object({
      transcriptSid: z.string().describe('Transcript SID (GT...) to check for operator results'),
      operatorType: z.enum(['text-generation', 'classification', 'extraction']).optional().describe('Filter by operator type (e.g., text-generation for summarization)'),
      operatorName: z.string().optional().describe('Filter by operator name (e.g., "Call Summary")'),
      requireResults: z.boolean().optional().default(true).describe('Fail if no operator results found'),
    }),
    async ({ transcriptSid, operatorType, operatorName, requireResults }) => {
      const validator = new DeepValidator(client);
      const result = await validator.validateLanguageOperator(transcriptSid, {
        operatorType,
        operatorName,
        requireResults,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  return [
    validateCall,
    validateMessage,
    validateVoiceAiFlow,
    validateDebugger,
    validateRecording,
    validateTranscript,
    validateTwoWay,
    validateLanguageOperator,
  ];
}
