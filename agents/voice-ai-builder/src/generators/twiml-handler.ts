// ABOUTME: TwiML handler generator for ConversationRelay voice applications.
// ABOUTME: Generates Twilio Functions that connect calls to WebSocket servers.

import type { TwimlGeneratorInput, GeneratedFile } from '../types.js';

/**
 * Generates TwiML handler code for ConversationRelay
 * @param input - Configuration for the TwiML handler
 * @returns Array of generated files
 */
export function generateTwimlHandler(input: TwimlGeneratorInput): GeneratedFile[] {
  const {
    useCaseType,
    relayUrl,
    voiceOptions,
    dtmfEnabled,
    interruptible,
    welcomeGreeting,
    profanityFilter,
    statusCallback,
  } = input;

  const handlerCode = generateHandlerCode({
    relayUrl,
    voice: voiceOptions.voice,
    language: voiceOptions.language,
    transcriptionProvider: voiceOptions.transcriptionProvider,
    speechModel: voiceOptions.speechModel,
    dtmfEnabled,
    interruptible,
    welcomeGreeting,
    profanityFilter,
    statusCallback,
    useCaseType,
  });

  return [
    {
      path: `functions/voice/relay-handler.protected.js`,
      content: handlerCode,
      type: 'twiml-handler',
    },
  ];
}

interface HandlerCodeOptions {
  relayUrl: string;
  voice: string;
  language: string;
  transcriptionProvider?: string;
  speechModel?: string;
  dtmfEnabled: boolean;
  interruptible: boolean;
  welcomeGreeting?: string;
  profanityFilter?: boolean;
  statusCallback?: string;
  useCaseType: string;
}

function generateHandlerCode(options: HandlerCodeOptions): string {
  const {
    relayUrl,
    voice,
    language,
    transcriptionProvider,
    speechModel,
    dtmfEnabled,
    interruptible,
    welcomeGreeting,
    profanityFilter,
    statusCallback,
    useCaseType,
  } = options;

  const lines: string[] = [];

  // ABOUTME comments
  lines.push(`// ABOUTME: TwiML handler for ${useCaseType} voice AI application.`);
  lines.push(`// ABOUTME: Connects inbound calls to ConversationRelay WebSocket server.`);
  lines.push('');

  // Handler function
  lines.push('exports.handler = function(context, event, callback) {');
  lines.push('  const twiml = new Twilio.twiml.VoiceResponse();');
  lines.push('');

  // Welcome greeting if provided
  if (welcomeGreeting) {
    lines.push(`  // Welcome greeting`);
    lines.push(`  twiml.say('${escapeString(welcomeGreeting)}');`);
    lines.push('');
  }

  // Connect to ConversationRelay
  lines.push('  const connect = twiml.connect();');
  lines.push('');

  // Build ConversationRelay options
  lines.push('  connect.conversationRelay({');
  lines.push(`    url: '${relayUrl}',`);
  lines.push(`    voice: '${voice}',`);
  lines.push(`    language: '${language}',`);

  // Transcription provider
  if (transcriptionProvider) {
    lines.push(`    transcriptionProvider: '${transcriptionProvider}',`);
  } else {
    lines.push(`    transcriptionProvider: 'google',`);
  }

  // Speech model
  if (speechModel) {
    lines.push(`    speechModel: '${speechModel}',`);
  } else {
    lines.push(`    speechModel: 'telephony',`);
  }

  // DTMF detection
  lines.push(`    dtmfDetection: '${dtmfEnabled}',`);

  // Interruptible
  lines.push(`    interruptible: '${interruptible}',`);
  lines.push(`    interruptByDtmf: '${dtmfEnabled}',`);

  // Profanity filter
  if (profanityFilter !== undefined) {
    lines.push(`    profanityFilter: '${profanityFilter}',`);
  }

  // Status callback
  if (statusCallback) {
    lines.push(`    statusCallback: '${statusCallback}',`);
  }

  lines.push('  });');
  lines.push('');

  // Return TwiML
  lines.push('  callback(null, twiml);');
  lines.push('};');

  return lines.join('\n');
}

/**
 * Escapes special characters in strings for JavaScript output
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}
