// ABOUTME: Index file for Voice AI Builder use case configurations.
// ABOUTME: Exports all use case configs and provides lookup function.

import type { UseCaseConfig } from '../types.js';
import { basicAssistantConfig } from './basic-assistant.js';
import { customerServiceConfig, customerServiceTools } from './customer-service.js';
import { appointmentBookingConfig, appointmentBookingTools } from './appointment-booking.js';

/**
 * Available use case types
 */
export type UseCaseType = 'basic-assistant' | 'customer-service' | 'appointment-booking';

/**
 * All available use case configurations
 */
export const useCaseConfigs: Record<UseCaseType, UseCaseConfig> = {
  'basic-assistant': basicAssistantConfig,
  'customer-service': customerServiceConfig,
  'appointment-booking': appointmentBookingConfig,
};

/**
 * Get use case configuration by type
 */
export function getUseCaseConfig(useCaseType: UseCaseType): UseCaseConfig {
  const config = useCaseConfigs[useCaseType];
  if (!config) {
    throw new Error(`Unknown use case type: ${useCaseType}`);
  }
  return config;
}

/**
 * Get all available use case types
 */
export function getAvailableUseCases(): UseCaseType[] {
  return Object.keys(useCaseConfigs) as UseCaseType[];
}

// Named exports
export {
  basicAssistantConfig,
  customerServiceConfig,
  customerServiceTools,
  appointmentBookingConfig,
  appointmentBookingTools,
};
