// ABOUTME: Type definitions for Voice AI Builder generators and templates.
// ABOUTME: Defines interfaces for TwiML, WebSocket, and LLM code generation.

/**
 * Generated file output from generators
 */
export interface GeneratedFile {
  /** Relative path where file should be written */
  path: string;
  /** File content */
  content: string;
  /** Type of generated file for categorization */
  type: 'twiml-handler' | 'websocket-server' | 'llm-integration' | 'config' | 'test';
}

/**
 * Voice configuration options for ConversationRelay
 */
export interface VoiceOptions {
  /** TTS voice identifier (e.g., 'Google.en-US-Neural2-F', 'Google.en-US-Neural2-D') */
  voice: string;
  /** Language code (e.g., 'en-US', 'es-ES') */
  language: string;
  /** Speech recognition provider */
  transcriptionProvider?: 'google' | 'deepgram';
  /** Speech model for recognition */
  speechModel?: 'telephony' | 'default';
}

/**
 * Input for TwiML handler generator
 */
export interface TwimlGeneratorInput {
  /** Use case template type */
  useCaseType: 'basic-assistant' | 'customer-service' | 'appointment-booking' | 'custom';
  /** WebSocket URL for ConversationRelay (wss://) */
  relayUrl: string;
  /** Voice and language options */
  voiceOptions: VoiceOptions;
  /** Enable DTMF detection */
  dtmfEnabled: boolean;
  /** Allow user to interrupt AI speech */
  interruptible: boolean;
  /** Optional welcome greeting before connecting */
  welcomeGreeting?: string;
  /** Enable profanity filter */
  profanityFilter?: boolean;
  /** Custom status callback URL */
  statusCallback?: string;
}

/**
 * Tool definition for LLM function calling
 */
export interface ToolDefinition {
  /** Tool name (snake_case) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: Record<string, unknown>;
}

/**
 * Input for WebSocket server generator
 */
export interface WebSocketGeneratorInput {
  /** LLM provider to use */
  llmProvider: 'anthropic' | 'openai' | 'custom';
  /** System prompt for the AI agent */
  systemPrompt: string;
  /** Tools available to the agent */
  tools: ToolDefinition[];
  /** Maximum conversation turns before ending */
  maxTurns: number;
  /** Context management strategy */
  contextManagement: 'sliding-window' | 'summary' | 'full';
  /** Port for WebSocket server */
  port?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Input for LLM integration generator
 */
export interface LLMIntegrationInput {
  /** LLM provider */
  provider: 'anthropic' | 'openai';
  /** Model identifier */
  model: string;
  /** Enable streaming responses */
  streamingEnabled: boolean;
  /** Enable tool/function calling */
  toolCalling: boolean;
  /** Tool definitions if tool calling enabled */
  tools?: ToolDefinition[];
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Temperature for response generation */
  temperature?: number;
}

/**
 * Use case configuration for templates
 */
export interface UseCaseConfig {
  /** Use case identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** System prompt for the AI agent */
  systemPrompt: string;
  /** Default TTS voice */
  defaultVoice: string;
  /** Default language */
  defaultLanguage: string;
  /** Default tools for this use case */
  defaultTools: ToolDefinition[];
  /** Phrases that trigger human escalation */
  escalationTriggers?: string[];
  /** Conversation configuration */
  conversationConfig?: {
    maxTurns: number;
    silenceTimeout: number;
    interruptible: boolean;
  };
}

/**
 * Result of conversation flow analysis
 */
export interface ConversationFlowAnalysis {
  /** Detected current pattern */
  currentPattern: 'static-ivr' | 'dialogflow' | 'conversation-relay' | 'custom' | 'none';
  /** Complexity assessment */
  complexity: 'simple' | 'moderate' | 'complex';
  /** Improvement recommendations */
  recommendations: AnalysisRecommendation[];
  /** Migration steps if upgrading */
  migrationPath?: MigrationStep[];
  /** Effort estimate */
  estimatedEffort: 'trivial' | 'small' | 'medium' | 'large';
}

/**
 * Analysis recommendation
 */
export interface AnalysisRecommendation {
  /** Recommendation type */
  type: 'upgrade-tts' | 'add-streaming' | 'improve-latency' | 'add-tools' | 'add-guardrails' | 'add-escalation';
  /** Priority level */
  priority: 'high' | 'medium' | 'low';
  /** Detailed description */
  description: string;
  /** File path where change is needed */
  codeLocation?: string;
}

/**
 * Migration step for upgrading voice flows
 */
export interface MigrationStep {
  /** Step number */
  order: number;
  /** Step description */
  description: string;
  /** Files to modify */
  files: string[];
  /** Is this step breaking? */
  breaking: boolean;
}
