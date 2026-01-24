// ABOUTME: Unit tests for MCP tool integration in Feature Factory.
// ABOUTME: Tests tool schema generation and execution without real Twilio credentials.

import {
  getMcpToolNames,
  getMcpToolSchemas,
  isMcpInitialized,
  isMcpTool,
  executeMcpTool,
  initializeMcpTools,
} from '../src/mcp-tools.js';

describe('MCP Tools Integration', () => {
  describe('isMcpTool helper', () => {
    it('should identify known MCP tool names', () => {
      expect(isMcpTool('send_sms')).toBe(true);
      expect(isMcpTool('make_call')).toBe(true);
      expect(isMcpTool('get_debugger_logs')).toBe(true);
    });

    it('should identify validation tool names', () => {
      expect(isMcpTool('validate_message')).toBe(true);
      expect(isMcpTool('validate_call')).toBe(true);
      expect(isMcpTool('validate_verification')).toBe(true);
    });

    it('should return false for core tools', () => {
      expect(isMcpTool('Read')).toBe(false);
      expect(isMcpTool('Write')).toBe(false);
      expect(isMcpTool('Bash')).toBe(false);
    });

    it('should return false for unknown tools', () => {
      expect(isMcpTool('unknown_tool')).toBe(false);
      expect(isMcpTool('')).toBe(false);
    });
  });

  describe('Before initialization', () => {
    // These tests check behavior when MCP is not initialized
    // Note: Order matters - these should run before any initialization

    it('should return error when executing without initialization', async () => {
      // Only run if not already initialized
      if (!isMcpInitialized()) {
        const result = await executeMcpTool('send_sms', {
          to: '+15551234567',
          body: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not initialized');
      }
    });
  });

  describe('With initialization (requires credentials)', () => {
    const hasCredentials =
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER;

    beforeAll(() => {
      if (hasCredentials) {
        try {
          initializeMcpTools();
        } catch {
          // Expected if credentials are invalid
        }
      }
    });

    it('should be initialized when credentials are present', () => {
      if (!hasCredentials) {
        console.log('Skipping: No Twilio credentials');
        return;
      }
      expect(isMcpInitialized()).toBe(true);
    });

    it('should return MCP tool names', () => {
      if (!hasCredentials) {
        console.log('Skipping: No Twilio credentials');
        return;
      }
      const names = getMcpToolNames();
      expect(names).toContain('send_sms');
      expect(names).toContain('send_mms');
      expect(names).toContain('make_call');
      expect(names).toContain('get_debugger_logs');
      expect(names.length).toBeGreaterThanOrEqual(20);
    });

    it('should return MCP tool schemas', () => {
      if (!hasCredentials) {
        console.log('Skipping: No Twilio credentials');
        return;
      }
      const schemas = getMcpToolSchemas();

      // Should have all MCP tools plus validation tools
      expect(schemas.length).toBeGreaterThanOrEqual(23);

      // Check structure of a schema
      const smsSchema = schemas.find((s) => s.name === 'send_sms');
      expect(smsSchema).toBeDefined();
      expect(smsSchema?.description).toBeDefined();
      expect(smsSchema?.input_schema).toBeDefined();
      expect(smsSchema?.input_schema.type).toBe('object');

      // Check validation tools are included
      expect(schemas.find((s) => s.name === 'validate_message')).toBeDefined();
      expect(schemas.find((s) => s.name === 'validate_call')).toBeDefined();
    });

    it('should include validation tools in schemas', () => {
      if (!hasCredentials) {
        console.log('Skipping: No Twilio credentials');
        return;
      }
      const schemas = getMcpToolSchemas();

      const validateMessage = schemas.find((s) => s.name === 'validate_message');
      expect(validateMessage).toBeDefined();
      expect(validateMessage?.description).toContain('Deep validate');
      expect(validateMessage?.input_schema.properties).toHaveProperty(
        'message_sid'
      );

      const validateCall = schemas.find((s) => s.name === 'validate_call');
      expect(validateCall).toBeDefined();
      expect(validateCall?.input_schema.properties).toHaveProperty('call_sid');
    });
  });
});
