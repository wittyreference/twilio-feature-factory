// ABOUTME: Unit tests for Twilio Messaging Services tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { messagingServicesTools, TwilioContext } from '../src/index';
import Twilio from 'twilio';
import { z } from 'zod';

// Real Twilio credentials from environment - NO magic test numbers.
const TEST_CREDENTIALS = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  authToken: process.env.TWILIO_AUTH_TOKEN || '',
  fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
  messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID || '',
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

describe('messagingServicesTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = messagingServicesTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 14 tools', () => {
      expect(tools).toHaveLength(14);
    });

    it('should have create_messaging_service tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_messaging_service');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Create');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have add_number_to_service tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'add_number_to_service');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Add');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_a2p_status tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_a2p_status');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('A2P');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('create_messaging_service schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_messaging_service');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName parameter', () => {
        const withName = schema.safeParse({ friendlyName: 'Test Service' });
        expect(withName.success).toBe(true);

        const withoutName = schema.safeParse({});
        expect(withoutName.success).toBe(false);
      });

      it('should have default stickySender of true', () => {
        const result = schema.safeParse({ friendlyName: 'Test Service' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.stickySender).toBe(true);
        }
      });

      it('should have default inboundMethod of POST', () => {
        const result = schema.safeParse({ friendlyName: 'Test Service' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.inboundMethod).toBe('POST');
        }
      });

      it('should validate inboundMethod enum', () => {
        const validMethod = schema.safeParse({
          friendlyName: 'Test Service',
          inboundMethod: 'GET',
        });
        expect(validMethod.success).toBe(true);

        const invalidMethod = schema.safeParse({
          friendlyName: 'Test Service',
          inboundMethod: 'PUT',
        });
        expect(invalidMethod.success).toBe(false);
      });

      it('should validate URL formats', () => {
        const validUrl = schema.safeParse({
          friendlyName: 'Test Service',
          inboundRequestUrl: 'https://example.com/webhook',
        });
        expect(validUrl.success).toBe(true);

        const invalidUrl = schema.safeParse({
          friendlyName: 'Test Service',
          inboundRequestUrl: 'not-a-url',
        });
        expect(invalidUrl.success).toBe(false);
      });
    });

    describe('add_number_to_service schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'add_number_to_service');
        schema = tool!.inputSchema;
      });

      it('should require serviceSid and phoneNumberSid', () => {
        const valid = schema.safeParse({
          serviceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const withoutServiceSid = schema.safeParse({
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(withoutServiceSid.success).toBe(false);

        const withoutPhoneNumberSid = schema.safeParse({
          serviceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(withoutPhoneNumberSid.success).toBe(false);
      });

      it('should validate serviceSid starts with MG', () => {
        const validSid = schema.safeParse({
          serviceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          serviceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });

      it('should validate phoneNumberSid starts with PN', () => {
        const validSid = schema.safeParse({
          serviceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          serviceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          phoneNumberSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });

    describe('get_a2p_status schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_a2p_status');
        schema = tool!.inputSchema;
      });

      it('should require serviceSid', () => {
        const valid = schema.safeParse({
          serviceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const withoutServiceSid = schema.safeParse({});
        expect(withoutServiceSid.success).toBe(false);
      });

      it('should validate serviceSid starts with MG', () => {
        const validSid = schema.safeParse({
          serviceSid: 'MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(validSid.success).toBe(true);

        const invalidSid = schema.safeParse({
          serviceSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalidSid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;
    const itWithMessagingService = hasRealCredentials && TEST_CREDENTIALS.messagingServiceSid ? it : it.skip;

    itWithCredentials(
      'list_messaging_services should return services list',
      async () => {
        const tool = tools.find(t => t.name === 'list_messaging_services')!;

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
      'get_messaging_service should return service details when service exists',
      async () => {
        const listTool = tools.find(t => t.name === 'list_messaging_services')!;
        const getTool = tools.find(t => t.name === 'get_messaging_service')!;

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
      'list_phone_numbers_in_service should return numbers for a service',
      async () => {
        const listServicesTool = tools.find(t => t.name === 'list_messaging_services')!;
        const listNumbersTool = tools.find(t => t.name === 'list_phone_numbers_in_service')!;

        const servicesResult = await listServicesTool.handler({ limit: 1 });
        const servicesResponse = JSON.parse(servicesResult.content[0].text);

        if (servicesResponse.count > 0) {
          const serviceSid = servicesResponse.services[0].sid;

          const numbersResult = await listNumbersTool.handler({ serviceSid, limit: 10 });
          const numbersResponse = JSON.parse(numbersResult.content[0].text);

          expect(numbersResponse.success).toBe(true);
          expect(numbersResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(numbersResponse.phoneNumbers)).toBe(true);
        }
      },
      20000
    );

    itWithMessagingService(
      'get_a2p_status should return A2P registration details',
      async () => {
        const tool = tools.find(t => t.name === 'get_a2p_status')!;

        const result = await tool.handler({
          serviceSid: TEST_CREDENTIALS.messagingServiceSid,
        });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.serviceSid).toBe(TEST_CREDENTIALS.messagingServiceSid);
        expect(response.a2pRegistrationCount).toBeGreaterThanOrEqual(0);
      },
      15000
    );
  });
});
