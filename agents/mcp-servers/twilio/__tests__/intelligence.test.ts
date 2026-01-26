// ABOUTME: Unit tests for Twilio Intelligence v2 tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { intelligenceTools, TwilioContext } from '../src/index';
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

describe('intelligenceTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = intelligenceTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 8 tools', () => {
      expect(tools).toHaveLength(8);
    });

    it('should have list_intelligence_services tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_intelligence_services');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Intelligence');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_transcripts tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_transcripts');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('transcript');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_transcript tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_transcript');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('transcript');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_intelligence_services schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_intelligence_services');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate limit bounds', () => {
        const tooLow = schema.safeParse({ limit: 0 });
        expect(tooLow.success).toBe(false);

        const tooHigh = schema.safeParse({ limit: 100 });
        expect(tooHigh.success).toBe(false);

        const valid = schema.safeParse({ limit: 25 });
        expect(valid.success).toBe(true);
      });
    });

    describe('list_transcripts schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_transcripts');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });
    });

    describe('get_transcript schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_transcript');
        schema = tool!.inputSchema;
      });

      it('should require transcriptSid', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate transcriptSid starts with GT', () => {
        const valid = schema.safeParse({ transcriptSid: 'GT12345678901234567890123456789012' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ transcriptSid: 'XX12345678901234567890123456789012' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_intelligence_services should return services',
      async () => {
        const tool = tools.find(t => t.name === 'list_intelligence_services')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.services)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_intelligence_service should return service details when services exist',
      async () => {
        const listTool = tools.find(t => t.name === 'list_intelligence_services')!;
        const getTool = tools.find(t => t.name === 'get_intelligence_service')!;

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
      'list_transcripts should return transcripts',
      async () => {
        const tool = tools.find(t => t.name === 'list_transcripts')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.transcripts)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_transcript should return transcript details when transcripts exist',
      async () => {
        const listTool = tools.find(t => t.name === 'list_transcripts')!;
        const getTool = tools.find(t => t.name === 'get_transcript')!;

        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const transcriptSid = listResponse.transcripts[0].sid;

          const getResult = await getTool.handler({ transcriptSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(transcriptSid);
          expect(getResponse.status).toBeDefined();
        }
      },
      20000
    );
  });
});
