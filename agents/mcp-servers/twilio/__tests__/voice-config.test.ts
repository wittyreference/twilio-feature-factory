// ABOUTME: Unit tests for Twilio Voice Configuration tools.
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { voiceConfigTools, TwilioContext } from '../src/index';
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

describe('voiceConfigTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = voiceConfigTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 14 tools', () => {
      expect(tools).toHaveLength(14);
    });

    it('should have get_dialing_permissions tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'get_dialing_permissions');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('dialing permission');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_dialing_permissions_countries tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_dialing_permissions_countries');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('countr');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_byoc_trunks tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_byoc_trunks');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('BYOC');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_byoc_trunk tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_byoc_trunk');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('BYOC');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });
  });

  describe('schema validation', () => {
    describe('get_dialing_permissions schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_dialing_permissions');
        schema = tool!.inputSchema;
      });

      it('should require isoCode', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate isoCode is 2 characters', () => {
        const valid = schema.safeParse({ isoCode: 'US' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ isoCode: 'USA' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('list_dialing_permissions_countries schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_dialing_permissions_countries');
        schema = tool!.inputSchema;
      });

      it('should have default limit', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.limit).toBe(50);
        }
      });

      it('should accept optional continent filter', () => {
        const result = schema.safeParse({ continent: 'North America' });
        expect(result.success).toBe(true);
      });
    });

    describe('list_byoc_trunks schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_byoc_trunks');
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

    describe('create_byoc_trunk schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_byoc_trunk');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName and voiceUrl', () => {
        const result = schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should accept friendlyName and voiceUrl', () => {
        const result = schema.safeParse({
          friendlyName: 'Test Trunk',
          voiceUrl: 'https://example.com/webhook',
        });
        expect(result.success).toBe(true);
      });

      it('should accept optional voiceFallbackUrl', () => {
        const result = schema.safeParse({
          friendlyName: 'Test Trunk',
          voiceUrl: 'https://example.com/webhook',
          voiceFallbackUrl: 'https://example.com/fallback',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('list_connection_policies schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_connection_policies');
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
        const tooLow = schema.safeParse({ limit: 0 });
        expect(tooLow.success).toBe(false);

        const tooHigh = schema.safeParse({ limit: 101 });
        expect(tooHigh.success).toBe(false);
      });
    });

    describe('get_connection_policy schema', () => {
      it('should require policySid starting with NY', () => {
        const tool = tools.find(t => t.name === 'get_connection_policy')!;

        const valid = tool.inputSchema.safeParse({ policySid: 'NYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ policySid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('create_connection_policy_target schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_connection_policy_target');
        schema = tool!.inputSchema;
      });

      it('should require policySid (NY) and target', () => {
        const valid = schema.safeParse({
          policySid: 'NYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          target: 'sip:carrier.example.com:5060',
        });
        expect(valid.success).toBe(true);

        const missingTarget = schema.safeParse({
          policySid: 'NYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingTarget.success).toBe(false);
      });

      it('should have defaults for priority, weight, enabled', () => {
        const result = schema.safeParse({
          policySid: 'NYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          target: 'sip:carrier.example.com',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.priority).toBe(10);
          expect(result.data.weight).toBe(10);
          expect(result.data.enabled).toBe(true);
        }
      });
    });

    describe('delete_connection_policy_target schema', () => {
      it('should require policySid (NY) and targetSid (NE)', () => {
        const tool = tools.find(t => t.name === 'delete_connection_policy_target')!;

        const valid = tool.inputSchema.safeParse({
          policySid: 'NYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          targetSid: 'NExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const wrongPrefix = tool.inputSchema.safeParse({
          policySid: 'NYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          targetSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(wrongPrefix.success).toBe(false);
      });
    });
  });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'get_dialing_permissions should return permissions for US',
      async () => {
        const tool = tools.find(t => t.name === 'get_dialing_permissions')!;

        const result = await tool.handler({ isoCode: 'US' });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.isoCode).toBe('US');
        expect(response.name).toBeDefined();
      },
      15000
    );

    itWithCredentials(
      'list_dialing_permissions_countries should return countries',
      async () => {
        const tool = tools.find(t => t.name === 'list_dialing_permissions_countries')!;

        const result = await tool.handler({ limit: 10 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.countries)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_connection_policies should return policies',
      async () => {
        const tool = tools.find(t => t.name === 'list_connection_policies')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.connectionPolicies)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_connection_policy_targets should return targets for a policy',
      async () => {
        const listPoliciesTool = tools.find(t => t.name === 'list_connection_policies')!;
        const listTargetsTool = tools.find(t => t.name === 'list_connection_policy_targets')!;

        const policiesResult = await listPoliciesTool.handler({ limit: 1 });
        const policiesResponse = JSON.parse(policiesResult.content[0].text);

        if (policiesResponse.count > 0) {
          const policySid = policiesResponse.connectionPolicies[0].sid;

          const targetsResult = await listTargetsTool.handler({ policySid, limit: 10 });
          const targetsResponse = JSON.parse(targetsResult.content[0].text);

          expect(targetsResponse.success).toBe(true);
          expect(targetsResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(targetsResponse.targets)).toBe(true);
        }
      },
      20000
    );

    itWithCredentials(
      'list_byoc_trunks should return trunks',
      async () => {
        const tool = tools.find(t => t.name === 'list_byoc_trunks')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeDefined();
        expect(Array.isArray(response.trunks)).toBe(true);
      },
      15000
    );
  });
});
