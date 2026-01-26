// ABOUTME: Unit tests for Twilio Notify tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { notifyTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
};

const hasRealCredentials =
  TEST_CREDENTIALS.accountSid.startsWith('AC') &&
  TEST_CREDENTIALS.authToken.length > 0 &&
  TEST_CREDENTIALS.fromNumber.startsWith('+');

function createTestContext(): TwilioContext {
  const client = Twilio(TEST_CREDENTIALS.accountSid, TEST_CREDENTIALS.authToken);
  return {
    client,
    defaultFromNumber: TEST_CREDENTIALS.fromNumber,
  };
}

interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (params: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

describe('notifyTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = notifyTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 10 tools', () => {
      expect(tools).toHaveLength(10);
    });

    it('should have list_notify_services tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_notify_services');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Notify');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_notify_service tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_notify_service');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Create');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have send_notification tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'send_notification');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('notification');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_notify_binding tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_notify_binding');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('binding');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_notify_services schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_notify_services');
        schema = tool!.inputSchema;
      });

      it('should have default limit of 20', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });
    });

    describe('create_notify_service schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_notify_service');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Test Service' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({});
        expect(invalid.success).toBe(false);
      });

      it('should have default logEnabled of false', () => {
        const result = schema.safeParse({ friendlyName: 'Test' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.logEnabled).toBe(false);
        }
      });
    });

    describe('create_notify_binding schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_notify_binding');
        schema = tool!.inputSchema;
      });

      it('should require serviceSid, identity, bindingType, and address', () => {
        const valid = schema.safeParse({
          serviceSid: 'ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          identity: 'user123',
          bindingType: 'fcm',
          address: 'device-token-here',
        });
        expect(valid.success).toBe(true);

        const missingAddress = schema.safeParse({
          serviceSid: 'ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          identity: 'user123',
          bindingType: 'fcm',
        });
        expect(missingAddress.success).toBe(false);
      });

      it('should validate bindingType enum', () => {
        const validFcm = schema.safeParse({
          serviceSid: 'ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          identity: 'user123',
          bindingType: 'fcm',
          address: 'token',
        });
        expect(validFcm.success).toBe(true);

        const invalidType = schema.safeParse({
          serviceSid: 'ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          identity: 'user123',
          bindingType: 'invalid',
          address: 'token',
        });
        expect(invalidType.success).toBe(false);
      });
    });

    describe('send_notification schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'send_notification');
        schema = tool!.inputSchema;
      });

      it('should require serviceSid and body', () => {
        const valid = schema.safeParse({
          serviceSid: 'ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          body: 'Hello!',
        });
        expect(valid.success).toBe(true);

        const missingBody = schema.safeParse({
          serviceSid: 'ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingBody.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_notify_services should return services list',
      async () => {
        const tool = tools.find(t => t.name === 'list_notify_services')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.services)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_notify_service should return service details when services exist',
      async () => {
        const listTool = tools.find(t => t.name === 'list_notify_services')!;
        const getTool = tools.find(t => t.name === 'get_notify_service')!;

        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const serviceSid = listResponse.services[0].sid;

          const getResult = await getTool.handler({ serviceSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(serviceSid);
          expect(getResponse.friendlyName).toBeDefined();
        }
      },
      20000
    );

    itWithCredentials(
      'list_notify_bindings should return bindings for a service',
      async () => {
        const listServicesTool = tools.find(t => t.name === 'list_notify_services')!;
        const listBindingsTool = tools.find(t => t.name === 'list_notify_bindings')!;

        const servicesResult = await listServicesTool.handler({ limit: 1 });
        const servicesResponse = JSON.parse(servicesResult.content[0].text);

        if (servicesResponse.count > 0) {
          const serviceSid = servicesResponse.services[0].sid;

          const bindingsResult = await listBindingsTool.handler({ serviceSid, limit: 10 });
          const bindingsResponse = JSON.parse(bindingsResult.content[0].text);

          expect(bindingsResponse.success).toBe(true);
          expect(bindingsResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(bindingsResponse.bindings)).toBe(true);
        }
      },
      20000
    );
  });
});
