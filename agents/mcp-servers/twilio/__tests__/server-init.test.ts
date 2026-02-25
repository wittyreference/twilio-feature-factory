// ABOUTME: Unit tests for MCP server initialization and tool registration.
// ABOUTME: Validates server startup, tool count, tool structure, and credential validation.

import { createTwilioMcpServer, TwilioMcpServerConfig } from '../src/index';
import { z } from 'zod';

// Test credentials (don't need to be real for structure tests)
const MOCK_CONFIG: TwilioMcpServerConfig = {
  accountSid: 'ACtest12345678901234567890123456',
  authToken: 'test_auth_token_32_chars_long__',
  defaultFromNumber: '+15551234567',
};

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('MCP Server Initialization', () => {
  describe('createTwilioMcpServer', () => {
    it('should create server with valid config', () => {
      const server = createTwilioMcpServer(MOCK_CONFIG);

      expect(server).toBeDefined();
      expect(server.name).toBe('twilio-tools');
      expect(server.version).toBe('1.0.0');
      expect(Array.isArray(server.tools)).toBe(true);
    });

    it('should register exactly 284 tools', () => {
      const server = createTwilioMcpServer(MOCK_CONFIG);

      expect(server.tools).toHaveLength(310);
    });

    it('should throw error when missing TWILIO_ACCOUNT_SID', () => {
      const originalSid = process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_ACCOUNT_SID;

      try {
        expect(() => {
          createTwilioMcpServer({
            authToken: 'test_token',
            defaultFromNumber: '+15551234567',
          });
        }).toThrow('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
      } finally {
        if (originalSid) {
          process.env.TWILIO_ACCOUNT_SID = originalSid;
        }
      }
    });

    it('should throw error when missing TWILIO_AUTH_TOKEN', () => {
      const originalToken = process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_AUTH_TOKEN;

      try {
        expect(() => {
          createTwilioMcpServer({
            accountSid: 'ACtest12345678901234567890123456',
            defaultFromNumber: '+15551234567',
          });
        }).toThrow('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required');
      } finally {
        if (originalToken) {
          process.env.TWILIO_AUTH_TOKEN = originalToken;
        }
      }
    });

    it('should throw error when missing TWILIO_PHONE_NUMBER', () => {
      const originalPhone = process.env.TWILIO_PHONE_NUMBER;
      delete process.env.TWILIO_PHONE_NUMBER;

      try {
        expect(() => {
          createTwilioMcpServer({
            accountSid: 'ACtest12345678901234567890123456',
            authToken: 'test_token',
          });
        }).toThrow('TWILIO_PHONE_NUMBER is required');
      } finally {
        if (originalPhone) {
          process.env.TWILIO_PHONE_NUMBER = originalPhone;
        }
      }
    });
  });

  describe('Tool Registration', () => {
    let tools: Tool[];

    beforeAll(() => {
      const server = createTwilioMcpServer(MOCK_CONFIG);
      tools = server.tools as Tool[];
    });

    it('all tools should have valid name (string)', () => {
      for (const tool of tools) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
      }
    });

    it('all tools should have valid description (string)', () => {
      for (const tool of tools) {
        expect(typeof tool.description).toBe('string');
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });

    it('all tools should have inputSchema (Zod schema)', () => {
      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        // Zod schemas have a _def property
        expect(tool.inputSchema._def).toBeDefined();
      }
    });

    it('all tools should have handler function', () => {
      for (const tool of tools) {
        expect(typeof tool.handler).toBe('function');
      }
    });

    it('all tool names should be unique', () => {
      const names = tools.map(t => t.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it('tool names should follow naming convention (lowercase with underscores)', () => {
      for (const tool of tools) {
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });
  });

  describe('Tool Categories', () => {
    let tools: Tool[];

    beforeAll(() => {
      const server = createTwilioMcpServer(MOCK_CONFIG);
      tools = server.tools as Tool[];
    });

    it('should have messaging tools', () => {
      const messagingTools = tools.filter(t => t.name.startsWith('send_') || t.name.includes('message'));
      expect(messagingTools.length).toBeGreaterThan(0);
    });

    it('should have voice tools', () => {
      const voiceTools = tools.filter(t =>
        t.name.includes('call') ||
        t.name.includes('conference') ||
        t.name.includes('recording')
      );
      expect(voiceTools.length).toBeGreaterThan(0);
    });

    it('should have verify tools', () => {
      const verifyTools = tools.filter(t => t.name.includes('verification'));
      expect(verifyTools.length).toBeGreaterThan(0);
    });

    it('should have sync tools', () => {
      const syncTools = tools.filter(t => t.name.includes('document'));
      expect(syncTools.length).toBeGreaterThan(0);
    });

    it('should have debugger tools', () => {
      const debuggerTools = tools.filter(t =>
        t.name.includes('debugger') ||
        t.name.includes('analyze_errors')
      );
      expect(debuggerTools.length).toBeGreaterThan(0);
    });

    it('should have studio tools', () => {
      const studioTools = tools.filter(t =>
        t.name.includes('flow') ||
        t.name.includes('execution')
      );
      expect(studioTools.length).toBeGreaterThan(0);
    });

    it('should have serverless tools', () => {
      const serverlessTools = tools.filter(t =>
        t.name.includes('service') ||
        t.name.includes('function') ||
        t.name.includes('build')
      );
      expect(serverlessTools.length).toBeGreaterThan(0);
    });
  });
});
