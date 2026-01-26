// ABOUTME: Main entry point for Voice AI Builder.
// ABOUTME: Exports generators, types, and use case configurations.

// Types
export type {
  GeneratedFile,
  VoiceOptions,
  TwimlGeneratorInput,
  ToolDefinition,
  WebSocketGeneratorInput,
  LLMIntegrationInput,
  UseCaseConfig,
  ConversationFlowAnalysis,
  AnalysisRecommendation,
  MigrationStep,
} from './types.js';

// Generators
export {
  generateTwimlHandler,
  generateWebSocketServer,
  generateLLMIntegration,
} from './generators/index.js';

// Use Case Configurations
export type { UseCaseType } from './use-cases/index.js';
export {
  useCaseConfigs,
  getUseCaseConfig,
  getAvailableUseCases,
  basicAssistantConfig,
  customerServiceConfig,
  customerServiceTools,
  appointmentBookingConfig,
  appointmentBookingTools,
} from './use-cases/index.js';
