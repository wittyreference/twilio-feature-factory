// ABOUTME: Unit tests for Twilio Media/Video Recording tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { mediaTools, TwilioContext } from '../src/index';
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

describe('mediaTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = mediaTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 10 tools', () => {
      expect(tools).toHaveLength(10);
    });

    it('should have list_video_recordings tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_video_recordings');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('recording');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_video_recording tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_video_recording');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('recording');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_compositions tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_compositions');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('composition');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_video_recordings schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_video_recordings');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate status enum', () => {
        const valid = schema.safeParse({ status: 'completed' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ status: 'invalid' });
        expect(invalid.success).toBe(false);
      });

      it('should accept optional sourceSid', () => {
        const result = schema.safeParse({ sourceSid: 'RM12345678901234567890123456789012' });
        expect(result.success).toBe(true);
      });
    });

    describe('get_video_recording schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_video_recording');
        schema = tool!.inputSchema;
      });

      it('should require recordingSid', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate recordingSid starts with RT', () => {
        const valid = schema.safeParse({ recordingSid: 'RT12345678901234567890123456789012' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ recordingSid: 'XX12345678901234567890123456789012' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_compositions schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_compositions');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate status enum', () => {
        const valid = schema.safeParse({ status: 'completed' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ status: 'invalid' });
        expect(invalid.success).toBe(false);
      });

      it('should validate roomSid starts with RM', () => {
        const valid = schema.safeParse({ roomSid: 'RM12345678901234567890123456789012' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ roomSid: 'XX12345678901234567890123456789012' });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_video_recordings should return recordings',
      async () => {
        const tool = tools.find(t => t.name === 'list_video_recordings')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.recordings)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_compositions should return compositions',
      async () => {
        const tool = tools.find(t => t.name === 'list_compositions')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.compositions)).toBe(true);
      },
      15000
    );
  });
});
