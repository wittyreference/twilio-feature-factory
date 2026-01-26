// ABOUTME: Unit tests for Voice AI Builder use case configurations.
// ABOUTME: Tests all use case configs and the getUseCaseConfig utility.

import {
  useCaseConfigs,
  getUseCaseConfig,
  getAvailableUseCases,
  basicAssistantConfig,
  customerServiceConfig,
  customerServiceTools,
  appointmentBookingConfig,
  appointmentBookingTools,
} from '../../src/use-cases/index.js';
import type { UseCaseConfig, ToolDefinition } from '../../src/types.js';

describe('Use Case Configurations', () => {
  describe('getUseCaseConfig', () => {
    it('should return basic-assistant config', () => {
      const config = getUseCaseConfig('basic-assistant');
      expect(config.name).toBe('basic-assistant');
    });

    it('should return customer-service config', () => {
      const config = getUseCaseConfig('customer-service');
      expect(config.name).toBe('customer-service');
    });

    it('should return appointment-booking config', () => {
      const config = getUseCaseConfig('appointment-booking');
      expect(config.name).toBe('appointment-booking');
    });

    it('should throw for unknown use case', () => {
      expect(() => getUseCaseConfig('unknown' as any)).toThrow('Unknown use case type');
    });
  });

  describe('getAvailableUseCases', () => {
    it('should return all three use case types', () => {
      const useCases = getAvailableUseCases();
      expect(useCases).toContain('basic-assistant');
      expect(useCases).toContain('customer-service');
      expect(useCases).toContain('appointment-booking');
      expect(useCases).toHaveLength(3);
    });
  });

  describe('useCaseConfigs registry', () => {
    it('should have all use cases registered', () => {
      expect(Object.keys(useCaseConfigs)).toHaveLength(3);
      expect(useCaseConfigs['basic-assistant']).toBeDefined();
      expect(useCaseConfigs['customer-service']).toBeDefined();
      expect(useCaseConfigs['appointment-booking']).toBeDefined();
    });
  });
});

describe('Basic Assistant Config', () => {
  const config = basicAssistantConfig;

  it('should have correct name and description', () => {
    expect(config.name).toBe('basic-assistant');
    expect(config.description).toContain('Simple');
  });

  it('should have no tools', () => {
    expect(config.defaultTools).toHaveLength(0);
  });

  it('should have no escalation triggers', () => {
    expect(config.escalationTriggers).toHaveLength(0);
  });

  it('should have a system prompt', () => {
    expect(config.systemPrompt).toBeDefined();
    expect(config.systemPrompt.length).toBeGreaterThan(50);
  });

  it('should have default voice and language', () => {
    expect(config.defaultVoice).toBe('Polly.Matthew');
    expect(config.defaultLanguage).toBe('en-US');
  });

  it('should have conversation config', () => {
    expect(config.conversationConfig).toBeDefined();
    expect(config.conversationConfig?.maxTurns).toBe(20);
    expect(config.conversationConfig?.interruptible).toBe(true);
  });
});

describe('Customer Service Config', () => {
  const config = customerServiceConfig;

  it('should have correct name and description', () => {
    expect(config.name).toBe('customer-service');
    expect(config.description).toContain('Customer service');
  });

  it('should have three tools', () => {
    expect(config.defaultTools).toHaveLength(3);
  });

  it('should have lookup_account tool', () => {
    const tool = config.defaultTools.find((t) => t.name === 'lookup_account');
    expect(tool).toBeDefined();
    expect(tool?.description).toContain('Look up');
    expect(tool?.inputSchema).toBeDefined();
  });

  it('should have check_order_status tool', () => {
    const tool = config.defaultTools.find((t) => t.name === 'check_order_status');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('orderId');
  });

  it('should have transfer_to_agent tool', () => {
    const tool = config.defaultTools.find((t) => t.name === 'transfer_to_agent');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('reason');
  });

  it('should have escalation triggers', () => {
    expect(config.escalationTriggers).toBeDefined();
    expect(config.escalationTriggers!.length).toBeGreaterThan(5);
    expect(config.escalationTriggers).toContain('talk to a human');
    expect(config.escalationTriggers).toContain('supervisor');
  });

  it('should have a system prompt mentioning tools', () => {
    expect(config.systemPrompt).toContain('account');
    expect(config.systemPrompt).toContain('order');
    expect(config.systemPrompt).toContain('transfer');
  });

  it('should have higher maxTurns than basic', () => {
    expect(config.conversationConfig?.maxTurns).toBe(30);
  });
});

describe('Appointment Booking Config', () => {
  const config = appointmentBookingConfig;

  it('should have correct name and description', () => {
    expect(config.name).toBe('appointment-booking');
    expect(config.description).toContain('scheduling');
  });

  it('should have five tools', () => {
    expect(config.defaultTools).toHaveLength(5);
  });

  it('should have check_availability tool', () => {
    const tool = config.defaultTools.find((t) => t.name === 'check_availability');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('date');
  });

  it('should have book_appointment tool', () => {
    const tool = config.defaultTools.find((t) => t.name === 'book_appointment');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('date');
    expect(tool?.inputSchema.required).toContain('time');
    expect(tool?.inputSchema.required).toContain('customerName');
  });

  it('should have cancel_appointment tool', () => {
    const tool = config.defaultTools.find((t) => t.name === 'cancel_appointment');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain('confirmationNumber');
  });

  it('should have reschedule_appointment tool', () => {
    const tool = config.defaultTools.find((t) => t.name === 'reschedule_appointment');
    expect(tool).toBeDefined();
  });

  it('should have get_appointment_details tool', () => {
    const tool = config.defaultTools.find((t) => t.name === 'get_appointment_details');
    expect(tool).toBeDefined();
  });

  it('should have escalation triggers', () => {
    expect(config.escalationTriggers).toBeDefined();
    expect(config.escalationTriggers!.length).toBeGreaterThan(0);
  });

  it('should use female voice for appointment booking', () => {
    expect(config.defaultVoice).toBe('Polly.Joanna');
  });

  it('should have longer silence timeout', () => {
    expect(config.conversationConfig?.silenceTimeout).toBe(7000);
  });
});

describe('customerServiceTools export', () => {
  it('should export tools array', () => {
    expect(Array.isArray(customerServiceTools)).toBe(true);
    expect(customerServiceTools).toHaveLength(3);
  });

  it('should match config defaultTools', () => {
    expect(customerServiceTools).toEqual(customerServiceConfig.defaultTools);
  });
});

describe('appointmentBookingTools export', () => {
  it('should export tools array', () => {
    expect(Array.isArray(appointmentBookingTools)).toBe(true);
    expect(appointmentBookingTools).toHaveLength(5);
  });

  it('should match config defaultTools', () => {
    expect(appointmentBookingTools).toEqual(appointmentBookingConfig.defaultTools);
  });
});

describe('Tool definitions structure', () => {
  const allTools = [...customerServiceTools, ...appointmentBookingTools];

  it('all tools should have required fields', () => {
    for (const tool of allTools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
    }
  });

  it('all tools should have snake_case names', () => {
    for (const tool of allTools) {
      expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it('all tools should have type:object schema', () => {
    for (const tool of allTools) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('all tools should have properties in schema', () => {
    for (const tool of allTools) {
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });
});

describe('UseCaseConfig interface compliance', () => {
  const configs: UseCaseConfig[] = [
    basicAssistantConfig,
    customerServiceConfig,
    appointmentBookingConfig,
  ];

  it('all configs should have required fields', () => {
    for (const config of configs) {
      expect(config.name).toBeDefined();
      expect(config.description).toBeDefined();
      expect(config.systemPrompt).toBeDefined();
      expect(config.defaultVoice).toBeDefined();
      expect(config.defaultLanguage).toBeDefined();
      expect(Array.isArray(config.defaultTools)).toBe(true);
    }
  });

  it('all configs should have valid voice identifiers', () => {
    const validVoices = [
      'Polly.Matthew',
      'Polly.Joanna',
      'Polly.Amy',
      'Google.en-US-Neural2-D',
      'Google.en-US-Neural2-F',
    ];
    for (const config of configs) {
      expect(validVoices).toContain(config.defaultVoice);
    }
  });

  it('all configs should have valid language codes', () => {
    const validLanguages = ['en-US', 'en-GB', 'es-ES', 'fr-FR'];
    for (const config of configs) {
      expect(validLanguages).toContain(config.defaultLanguage);
    }
  });
});
