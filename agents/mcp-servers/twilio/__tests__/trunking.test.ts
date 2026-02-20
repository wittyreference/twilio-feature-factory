// ABOUTME: Unit tests for Twilio SIP Trunking tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { trunkingTools, TwilioContext } from '../src/index';
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

describe('trunkingTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = trunkingTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 20 tools', () => {
      expect(tools).toHaveLength(20);
    });

    it('should have list_sip_trunks tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_sip_trunks');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('trunk');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_sip_trunk tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_sip_trunk');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Create');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_origination_urls tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_origination_urls');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('origination');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have associate_ip_access_control_list tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'associate_ip_access_control_list');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('IP');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have update_origination_url tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'update_origination_url');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('Update');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have get_trunk_recording tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_trunk_recording');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('recording');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have update_trunk_recording tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'update_trunk_recording');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('recording');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('list_sip_trunks schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_sip_trunks');
        schema = tool!.inputSchema;
      });

      it('should have default limit of 20', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(20);
        }
      });

      it('should validate limit bounds', () => {
        const validLimit = schema.safeParse({ limit: 50 });
        expect(validLimit.success).toBe(true);

        const tooLow = schema.safeParse({ limit: 0 });
        expect(tooLow.success).toBe(false);

        const tooHigh = schema.safeParse({ limit: 101 });
        expect(tooHigh.success).toBe(false);
      });
    });

    describe('create_sip_trunk schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_sip_trunk');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Test Trunk' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({});
        expect(invalid.success).toBe(false);
      });

      it('should have default values for optional fields', () => {
        const result = schema.safeParse({ friendlyName: 'Test Trunk' });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.secure).toBe(false);
          expect(result.data.cnamLookupEnabled).toBe(false);
        }
      });
    });

    describe('get_sip_trunk schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_sip_trunk');
        schema = tool!.inputSchema;
      });

      it('should require trunkSid starting with TK', () => {
        const valid = schema.safeParse({ trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ trunkSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('update_origination_url schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'update_origination_url');
        schema = tool!.inputSchema;
      });

      it('should require trunkSid and originationUrlSid', () => {
        const valid = schema.safeParse({
          trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          originationUrlSid: 'OUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const missingUrl = schema.safeParse({ trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(missingUrl.success).toBe(false);
      });

      it('should validate SID prefixes', () => {
        const badTrunk = schema.safeParse({
          trunkSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          originationUrlSid: 'OUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(badTrunk.success).toBe(false);

        const badUrl = schema.safeParse({
          trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          originationUrlSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(badUrl.success).toBe(false);
      });

      it('should accept optional update fields', () => {
        const result = schema.safeParse({
          trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          originationUrlSid: 'OUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          priority: 5,
          weight: 20,
          enabled: false,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('update_trunk_recording schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'update_trunk_recording');
        schema = tool!.inputSchema;
      });

      it('should require trunkSid', () => {
        const valid = schema.safeParse({ trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({});
        expect(invalid.success).toBe(false);
      });

      it('should validate recording mode enum', () => {
        const valid = schema.safeParse({
          trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          mode: 'record-from-answer',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          mode: 'invalid-mode',
        });
        expect(invalid.success).toBe(false);
      });

      it('should validate trim enum', () => {
        const valid = schema.safeParse({
          trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          trim: 'trim-silence',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          trunkSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          trim: 'invalid-trim',
        });
        expect(invalid.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_sip_trunks should return trunks list',
      async () => {
        const tool = tools.find(t => t.name === 'list_sip_trunks')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.trunks)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_sip_trunk should return trunk details when trunks exist',
      async () => {
        const listTool = tools.find(t => t.name === 'list_sip_trunks')!;
        const getTool = tools.find(t => t.name === 'get_sip_trunk')!;

        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const trunkSid = listResponse.trunks[0].sid;

          const getResult = await getTool.handler({ trunkSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(trunkSid);
          expect(getResponse.friendlyName).toBeDefined();
        }
      },
      20000
    );

    itWithCredentials(
      'list_origination_urls should return origination URLs for a trunk',
      async () => {
        const listTrunksTool = tools.find(t => t.name === 'list_sip_trunks')!;
        const listUrlsTool = tools.find(t => t.name === 'list_origination_urls')!;

        const trunksResult = await listTrunksTool.handler({ limit: 1 });
        const trunksResponse = JSON.parse(trunksResult.content[0].text);

        if (trunksResponse.count > 0) {
          const trunkSid = trunksResponse.trunks[0].sid;

          const urlsResult = await listUrlsTool.handler({ trunkSid, limit: 10 });
          const urlsResponse = JSON.parse(urlsResult.content[0].text);

          expect(urlsResponse.success).toBe(true);
          expect(urlsResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(urlsResponse.originationUrls)).toBe(true);
        }
      },
      20000
    );

    itWithCredentials(
      'get_trunk_recording should return recording settings for a trunk',
      async () => {
        const listTrunksTool = tools.find(t => t.name === 'list_sip_trunks')!;
        const getRecordingTool = tools.find(t => t.name === 'get_trunk_recording')!;

        const trunksResult = await listTrunksTool.handler({ limit: 1 });
        const trunksResponse = JSON.parse(trunksResult.content[0].text);

        if (trunksResponse.count > 0) {
          const trunkSid = trunksResponse.trunks[0].sid;

          const recordingResult = await getRecordingTool.handler({ trunkSid });
          const recordingResponse = JSON.parse(recordingResult.content[0].text);

          expect(recordingResponse.success).toBe(true);
          expect(recordingResponse.trunkSid).toBe(trunkSid);
          expect(recordingResponse.mode).toBeDefined();
        }
      },
      20000
    );

    itWithCredentials(
      'list_trunk_phone_numbers should return phone numbers for a trunk',
      async () => {
        const listTrunksTool = tools.find(t => t.name === 'list_sip_trunks')!;
        const listNumbersTool = tools.find(t => t.name === 'list_trunk_phone_numbers')!;

        const trunksResult = await listTrunksTool.handler({ limit: 1 });
        const trunksResponse = JSON.parse(trunksResult.content[0].text);

        if (trunksResponse.count > 0) {
          const trunkSid = trunksResponse.trunks[0].sid;

          const numbersResult = await listNumbersTool.handler({ trunkSid, limit: 10 });
          const numbersResponse = JSON.parse(numbersResult.content[0].text);

          expect(numbersResponse.success).toBe(true);
          expect(numbersResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(numbersResponse.phoneNumbers)).toBe(true);
        }
      },
      20000
    );
  });
});
