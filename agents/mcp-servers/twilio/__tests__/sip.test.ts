// ABOUTME: Unit tests for account-level SIP resource tools (IP ACLs, credentials).
// ABOUTME: Tests tool structure, schema validation, and API integration with real credentials.

import { sipTools, TwilioContext } from '../src/index';
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

describe('sipTools', () => {
  let tools: Tool[];

  beforeAll(() => {
    tools = sipTools(createTestContext()) as Tool[];
  });

  describe('tool structure', () => {
    it('should return an array of 40 tools', () => {
      expect(tools).toHaveLength(40);
    });

    it('should have list_sip_ip_access_control_lists tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_sip_ip_access_control_lists');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('IP access control');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_sip_ip_address tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_sip_ip_address');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('IP address');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have list_sip_credential_lists tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'list_sip_credential_lists');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('credential list');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have create_sip_credential tool with correct metadata', () => {
      const tool = tools.find(t => t.name === 'create_sip_credential');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('credential');
      expect(tool?.inputSchema).toBeDefined();
      expect(typeof tool?.handler).toBe('function');
    });

    it('should have all expected tool names', () => {
      const expectedNames = [
        // IP Access Control Lists
        'list_sip_ip_access_control_lists',
        'get_sip_ip_access_control_list',
        'create_sip_ip_access_control_list',
        'update_sip_ip_access_control_list',
        'delete_sip_ip_access_control_list',
        // IP Addresses
        'list_sip_ip_addresses',
        'get_sip_ip_address',
        'create_sip_ip_address',
        'update_sip_ip_address',
        'delete_sip_ip_address',
        // Credential Lists
        'list_sip_credential_lists',
        'get_sip_credential_list',
        'create_sip_credential_list',
        'update_sip_credential_list',
        'delete_sip_credential_list',
        // Credentials
        'list_sip_credentials',
        'get_sip_credential',
        'create_sip_credential',
        'update_sip_credential',
        'delete_sip_credential',
        // SIP Domains (Programmable Voice)
        'list_sip_domains',
        'get_sip_domain',
        'create_sip_domain',
        'update_sip_domain',
        'delete_sip_domain',
        // Legacy domain-level IP ACL mappings
        'list_sip_domain_ip_acl_mappings',
        'create_sip_domain_ip_acl_mapping',
        'delete_sip_domain_ip_acl_mapping',
        // Legacy domain-level credential list mappings
        'list_sip_domain_credential_list_mappings',
        'create_sip_domain_credential_list_mapping',
        'delete_sip_domain_credential_list_mapping',
        // SIP Domain Auth: Calls
        'list_sip_domain_auth_calls_credential_list_mappings',
        'create_sip_domain_auth_calls_credential_list_mapping',
        'delete_sip_domain_auth_calls_credential_list_mapping',
        'list_sip_domain_auth_calls_ip_acl_mappings',
        'create_sip_domain_auth_calls_ip_acl_mapping',
        'delete_sip_domain_auth_calls_ip_acl_mapping',
        // SIP Domain Auth: Registrations
        'list_sip_domain_auth_registrations_credential_list_mappings',
        'create_sip_domain_auth_registrations_credential_list_mapping',
        'delete_sip_domain_auth_registrations_credential_list_mapping',
      ];

      const toolNames = tools.map(t => t.name);
      for (const name of expectedNames) {
        expect(toolNames).toContain(name);
      }
    });
  });

  describe('schema validation', () => {
    describe('list_sip_ip_access_control_lists schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'list_sip_ip_access_control_lists');
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

    describe('create_sip_ip_access_control_list schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_sip_ip_access_control_list');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName', () => {
        const valid = schema.safeParse({ friendlyName: 'Test ACL' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({});
        expect(invalid.success).toBe(false);
      });
    });

    describe('get_sip_ip_access_control_list schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_sip_ip_access_control_list');
        schema = tool!.inputSchema;
      });

      it('should require ipAccessControlListSid starting with AL', () => {
        const valid = schema.safeParse({ ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ ipAccessControlListSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('create_sip_ip_address schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_sip_ip_address');
        schema = tool!.inputSchema;
      });

      it('should require ipAccessControlListSid, friendlyName, and ipAddress', () => {
        const valid = schema.safeParse({
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          friendlyName: 'Office IP',
          ipAddress: '10.0.0.1',
        });
        expect(valid.success).toBe(true);

        const missingIp = schema.safeParse({
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          friendlyName: 'Office IP',
        });
        expect(missingIp.success).toBe(false);
      });

      it('should validate cidrPrefixLength bounds', () => {
        const valid = schema.safeParse({
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          friendlyName: 'Subnet',
          ipAddress: '10.0.0.0',
          cidrPrefixLength: 24,
        });
        expect(valid.success).toBe(true);

        const tooHigh = schema.safeParse({
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          friendlyName: 'Subnet',
          ipAddress: '10.0.0.0',
          cidrPrefixLength: 33,
        });
        expect(tooHigh.success).toBe(false);
      });
    });

    describe('update_sip_ip_address schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'update_sip_ip_address');
        schema = tool!.inputSchema;
      });

      it('should require ipAccessControlListSid and ipAddressSid', () => {
        const valid = schema.safeParse({
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          ipAddressSid: 'IPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const missingIpSid = schema.safeParse({
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingIpSid.success).toBe(false);
      });

      it('should validate IP SID prefix', () => {
        const invalid = schema.safeParse({
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          ipAddressSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('get_sip_credential_list schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_sip_credential_list');
        schema = tool!.inputSchema;
      });

      it('should require credentialListSid starting with CL', () => {
        const valid = schema.safeParse({ credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({ credentialListSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('create_sip_credential schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_sip_credential');
        schema = tool!.inputSchema;
      });

      it('should require credentialListSid, username, and password', () => {
        const valid = schema.safeParse({
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          username: 'testuser',
          password: 'SecurePass123!',
        });
        expect(valid.success).toBe(true);

        const missingPassword = schema.safeParse({
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          username: 'testuser',
        });
        expect(missingPassword.success).toBe(false);
      });

      it('should validate password minimum length of 12', () => {
        const tooShort = schema.safeParse({
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          username: 'testuser',
          password: 'Short1!',
        });
        expect(tooShort.success).toBe(false);
      });

      it('should validate username maximum length of 32', () => {
        const tooLong = schema.safeParse({
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          username: 'a'.repeat(33),
          password: 'SecurePass123!',
        });
        expect(tooLong.success).toBe(false);
      });
    });

    describe('get_sip_credential schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'get_sip_credential');
        schema = tool!.inputSchema;
      });

      it('should require credentialListSid and credentialSid', () => {
        const valid = schema.safeParse({
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          credentialSid: 'CRxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const missing = schema.safeParse({
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missing.success).toBe(false);
      });

      it('should validate credential SID prefix', () => {
        const invalid = schema.safeParse({
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          credentialSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(invalid.success).toBe(false);
      });
    });
  });

    describe('create_sip_domain schema', () => {
      let schema: z.ZodType;

      beforeAll(() => {
        const tool = tools.find(t => t.name === 'create_sip_domain');
        schema = tool!.inputSchema;
      });

      it('should require friendlyName and domainName', () => {
        const valid = schema.safeParse({
          friendlyName: 'Test Domain',
          domainName: 'test-domain.sip.twilio.com',
        });
        expect(valid.success).toBe(true);

        const missingDomain = schema.safeParse({ friendlyName: 'Test' });
        expect(missingDomain.success).toBe(false);

        const missingName = schema.safeParse({ domainName: 'test.sip.twilio.com' });
        expect(missingName.success).toBe(false);
      });

      it('should have default voiceMethod of POST', () => {
        const result = schema.safeParse({
          friendlyName: 'Test Domain',
          domainName: 'test-domain.sip.twilio.com',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.voiceMethod).toBe('POST');
        }
      });

      it('should validate voiceMethod enum', () => {
        const valid = schema.safeParse({
          friendlyName: 'Test',
          domainName: 'test.sip.twilio.com',
          voiceMethod: 'GET',
        });
        expect(valid.success).toBe(true);

        const invalid = schema.safeParse({
          friendlyName: 'Test',
          domainName: 'test.sip.twilio.com',
          voiceMethod: 'PUT',
        });
        expect(invalid.success).toBe(false);
      });
    });

    describe('get_sip_domain schema', () => {
      it('should require domainSid starting with SD', () => {
        const tool = tools.find(t => t.name === 'get_sip_domain')!;

        const valid = tool.inputSchema.safeParse({ domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ domainSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });
    });

    describe('update_sip_domain schema', () => {
      it('should require domainSid, all other fields optional', () => {
        const tool = tools.find(t => t.name === 'update_sip_domain')!;

        const valid = tool.inputSchema.safeParse({ domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({});
        expect(invalid.success).toBe(false);
      });
    });

    describe('create_sip_domain_ip_acl_mapping schema', () => {
      it('should require domainSid (SD) and ipAccessControlListSid (AL)', () => {
        const tool = tools.find(t => t.name === 'create_sip_domain_ip_acl_mapping')!;

        const valid = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const wrongPrefix = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          ipAccessControlListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(wrongPrefix.success).toBe(false);
      });
    });

    describe('create_sip_domain_credential_list_mapping schema', () => {
      it('should require domainSid (SD) and credentialListSid (CL)', () => {
        const tool = tools.find(t => t.name === 'create_sip_domain_credential_list_mapping')!;

        const valid = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const wrongPrefix = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          credentialListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(wrongPrefix.success).toBe(false);
      });
    });

    describe('SIP Domain Auth: Calls credential list mapping schemas', () => {
      it('list should require domainSid starting with SD', () => {
        const tool = tools.find(t => t.name === 'list_sip_domain_auth_calls_credential_list_mappings')!;

        const valid = tool.inputSchema.safeParse({ domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ domainSid: 'XXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });

      it('create should require domainSid and credentialListSid', () => {
        const tool = tools.find(t => t.name === 'create_sip_domain_auth_calls_credential_list_mapping')!;

        const valid = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const missingCl = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingCl.success).toBe(false);
      });

      it('delete should require domainSid and credentialListSid', () => {
        const tool = tools.find(t => t.name === 'delete_sip_domain_auth_calls_credential_list_mapping')!;

        const valid = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const missingDomain = tool.inputSchema.safeParse({
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingDomain.success).toBe(false);
      });
    });

    describe('SIP Domain Auth: Calls IP ACL mapping schemas', () => {
      it('list should require domainSid starting with SD', () => {
        const tool = tools.find(t => t.name === 'list_sip_domain_auth_calls_ip_acl_mappings')!;

        const valid = tool.inputSchema.safeParse({ domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);

        const invalid = tool.inputSchema.safeParse({ domainSid: 'TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(invalid.success).toBe(false);
      });

      it('create should require domainSid and ipAccessControlListSid', () => {
        const tool = tools.find(t => t.name === 'create_sip_domain_auth_calls_ip_acl_mapping')!;

        const valid = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const wrongPrefix = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          ipAccessControlListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(wrongPrefix.success).toBe(false);
      });

      it('delete should require domainSid and ipAccessControlListSid', () => {
        const tool = tools.find(t => t.name === 'delete_sip_domain_auth_calls_ip_acl_mapping')!;

        const valid = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          ipAccessControlListSid: 'ALxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);
      });
    });

    describe('SIP Domain Auth: Registrations credential list mapping schemas', () => {
      it('list should require domainSid starting with SD', () => {
        const tool = tools.find(t => t.name === 'list_sip_domain_auth_registrations_credential_list_mappings')!;

        const valid = tool.inputSchema.safeParse({ domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' });
        expect(valid.success).toBe(true);
      });

      it('create should require domainSid and credentialListSid', () => {
        const tool = tools.find(t => t.name === 'create_sip_domain_auth_registrations_credential_list_mapping')!;

        const valid = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);

        const missingCl = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(missingCl.success).toBe(false);
      });

      it('delete should require domainSid and credentialListSid', () => {
        const tool = tools.find(t => t.name === 'delete_sip_domain_auth_registrations_credential_list_mapping')!;

        const valid = tool.inputSchema.safeParse({
          domainSid: 'SDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          credentialListSid: 'CLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        });
        expect(valid.success).toBe(true);
      });

      it('should include authType in tool descriptions', () => {
        const callsTool = tools.find(t => t.name === 'list_sip_domain_auth_calls_credential_list_mappings')!;
        expect(callsTool.description).toContain('calls');

        const regsTool = tools.find(t => t.name === 'list_sip_domain_auth_registrations_credential_list_mappings')!;
        expect(regsTool.description).toContain('registration');
      });
    });

  describe('API integration', () => {
    const itWithCredentials = hasRealCredentials ? it : it.skip;

    itWithCredentials(
      'list_sip_ip_access_control_lists should return ACLs list',
      async () => {
        const tool = tools.find(t => t.name === 'list_sip_ip_access_control_lists')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.ipAccessControlLists)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'list_sip_credential_lists should return credential lists',
      async () => {
        const tool = tools.find(t => t.name === 'list_sip_credential_lists')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.credentialLists)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_sip_ip_access_control_list should return ACL details when ACLs exist',
      async () => {
        const listTool = tools.find(t => t.name === 'list_sip_ip_access_control_lists')!;
        const getTool = tools.find(t => t.name === 'get_sip_ip_access_control_list')!;

        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const aclSid = listResponse.ipAccessControlLists[0].sid;

          const getResult = await getTool.handler({ ipAccessControlListSid: aclSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(aclSid);
          expect(getResponse.friendlyName).toBeDefined();
        }
      },
      20000
    );

    itWithCredentials(
      'list_sip_domains should return domains list',
      async () => {
        const tool = tools.find(t => t.name === 'list_sip_domains')!;

        const result = await tool.handler({ limit: 5 });

        expect(result.content).toHaveLength(1);
        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.count).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(response.sipDomains)).toBe(true);
      },
      15000
    );

    itWithCredentials(
      'get_sip_domain should return domain details when domains exist',
      async () => {
        const listTool = tools.find(t => t.name === 'list_sip_domains')!;
        const getTool = tools.find(t => t.name === 'get_sip_domain')!;

        const listResult = await listTool.handler({ limit: 1 });
        const listResponse = JSON.parse(listResult.content[0].text);

        if (listResponse.count > 0) {
          const domainSid = listResponse.sipDomains[0].sid;

          const getResult = await getTool.handler({ domainSid });
          const getResponse = JSON.parse(getResult.content[0].text);

          expect(getResponse.success).toBe(true);
          expect(getResponse.sid).toBe(domainSid);
          expect(getResponse.domainName).toBeDefined();
        }
      },
      20000
    );

    itWithCredentials(
      'list_sip_credentials should return credentials for a credential list',
      async () => {
        const listClTool = tools.find(t => t.name === 'list_sip_credential_lists')!;
        const listCredsTool = tools.find(t => t.name === 'list_sip_credentials')!;

        const clResult = await listClTool.handler({ limit: 1 });
        const clResponse = JSON.parse(clResult.content[0].text);

        if (clResponse.count > 0) {
          const credentialListSid = clResponse.credentialLists[0].sid;

          const credsResult = await listCredsTool.handler({ credentialListSid, limit: 10 });
          const credsResponse = JSON.parse(credsResult.content[0].text);

          expect(credsResponse.success).toBe(true);
          expect(credsResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(credsResponse.credentials)).toBe(true);
        }
      },
      20000
    );

    itWithCredentials(
      'list_sip_ip_addresses should return IPs for an ACL',
      async () => {
        const listAclTool = tools.find(t => t.name === 'list_sip_ip_access_control_lists')!;
        const listIpTool = tools.find(t => t.name === 'list_sip_ip_addresses')!;

        const aclResult = await listAclTool.handler({ limit: 1 });
        const aclResponse = JSON.parse(aclResult.content[0].text);

        if (aclResponse.count > 0) {
          const aclSid = aclResponse.ipAccessControlLists[0].sid;

          const ipResult = await listIpTool.handler({ ipAccessControlListSid: aclSid, limit: 10 });
          const ipResponse = JSON.parse(ipResult.content[0].text);

          expect(ipResponse.success).toBe(true);
          expect(ipResponse.count).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(ipResponse.ipAddresses)).toBe(true);
        }
      },
      20000
    );
  });
});
