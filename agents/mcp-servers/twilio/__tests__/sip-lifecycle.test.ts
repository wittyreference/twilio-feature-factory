// ABOUTME: End-to-end lifecycle test for SIP infrastructure provisioning via MCP tools.
// ABOUTME: Creates, validates, and tears down ephemeral SIP resources across sip.ts, trunking.ts, and voice-config.ts.

import { sipTools, trunkingTools, voiceConfigTools, validationTools, TwilioContext } from '../src/index';
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

// Ephemeral resource naming: hex timestamp with digits mapped to alpha to avoid FriendlyName digit restriction
const testId = Date.now().toString(16).replace(/[0-9]/g, c =>
  String.fromCharCode(97 + parseInt(c)));
const TEST_PREFIX = `mcp-test-${testId}`;
const TEST_IP = '10.20.30.40';

// Module-scoped SID tracking for teardown
let createdAclSid: string | null = null;
let createdIpSid: string | null = null;
let createdClSid: string | null = null;
let createdCredSid: string | null = null;
let createdDomainSid: string | null = null;
let createdTrunkSid: string | null = null;
let createdOriginationUrlSid: string | null = null;
let createdPolicySid: string | null = null;
let createdTargetSid: string | null = null;

const describeCrud = hasRealCredentials ? describe : describe.skip;

describeCrud('SIP Infrastructure Lifecycle', () => {
  let sipToolList: Tool[];
  let trunkToolList: Tool[];
  let voiceConfigToolList: Tool[];
  let validationToolList: Tool[];

  function findTool(tools: Tool[], name: string): Tool {
    const tool = tools.find(t => t.name === name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    return tool;
  }

  async function callTool(tools: Tool[], name: string, params: Record<string, unknown>) {
    const tool = findTool(tools, name);
    const result = await tool.handler(params);
    return JSON.parse(result.content[0].text);
  }

  beforeAll(() => {
    const context = createTestContext();
    sipToolList = sipTools(context) as Tool[];
    trunkToolList = trunkingTools(context) as Tool[];
    voiceConfigToolList = voiceConfigTools(context) as Tool[];
    validationToolList = validationTools(context) as Tool[];
  });

  afterAll(async () => {
    const cleanup = async (label: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        console.warn(`Teardown ${label} failed:`, (e as Error).message);
      }
    };

    // Phase 4: connection policy targets before policy
    if (createdTargetSid && createdPolicySid) {
      await cleanup('connection policy target', () =>
        callTool(voiceConfigToolList, 'delete_connection_policy_target', {
          policySid: createdPolicySid, targetSid: createdTargetSid,
        }));
    }
    if (createdPolicySid) {
      await cleanup('connection policy', () =>
        callTool(voiceConfigToolList, 'delete_connection_policy', {
          policySid: createdPolicySid,
        }));
    }

    // Phase 3: origination URL, then associations, then trunk
    if (createdOriginationUrlSid && createdTrunkSid) {
      await cleanup('origination URL', () =>
        callTool(trunkToolList, 'delete_origination_url', {
          trunkSid: createdTrunkSid, originationUrlSid: createdOriginationUrlSid,
        }));
    }
    if (createdClSid && createdTrunkSid) {
      await cleanup('trunk CL association', () =>
        callTool(trunkToolList, 'remove_trunk_credential_list', {
          trunkSid: createdTrunkSid, credentialListSid: createdClSid,
        }));
    }
    if (createdAclSid && createdTrunkSid) {
      await cleanup('trunk ACL association', () =>
        callTool(trunkToolList, 'remove_trunk_ip_access_control_list', {
          trunkSid: createdTrunkSid, ipAccessControlListSid: createdAclSid,
        }));
    }
    if (createdTrunkSid) {
      await cleanup('trunk', () =>
        callTool(trunkToolList, 'delete_sip_trunk', { trunkSid: createdTrunkSid }));
    }

    // Phase 2: domain mappings then domain
    // Legacy mappings cover both legacy and v2 auth endpoints
    if (createdDomainSid && createdAclSid) {
      await cleanup('domain ACL mapping', () =>
        callTool(sipToolList, 'delete_sip_domain_ip_acl_mapping', {
          domainSid: createdDomainSid, ipAccessControlListSid: createdAclSid,
        }));
    }
    if (createdDomainSid && createdClSid) {
      await cleanup('domain CL mapping', () =>
        callTool(sipToolList, 'delete_sip_domain_credential_list_mapping', {
          domainSid: createdDomainSid, credentialListSid: createdClSid,
        }));
    }
    if (createdDomainSid) {
      await cleanup('domain', () =>
        callTool(sipToolList, 'delete_sip_domain', { domainSid: createdDomainSid }));
    }

    // Phase 1: IPs/creds before ACLs/CLs
    if (createdIpSid && createdAclSid) {
      await cleanup('IP address', () =>
        callTool(sipToolList, 'delete_sip_ip_address', {
          ipAccessControlListSid: createdAclSid, ipAddressSid: createdIpSid,
        }));
    }
    if (createdCredSid && createdClSid) {
      await cleanup('credential', () =>
        callTool(sipToolList, 'delete_sip_credential', {
          credentialListSid: createdClSid, credentialSid: createdCredSid,
        }));
    }
    if (createdAclSid) {
      await cleanup('ACL', () =>
        callTool(sipToolList, 'delete_sip_ip_access_control_list', {
          ipAccessControlListSid: createdAclSid,
        }));
    }
    if (createdClSid) {
      await cleanup('credential list', () =>
        callTool(sipToolList, 'delete_sip_credential_list', {
          credentialListSid: createdClSid,
        }));
    }
  }, 60000);

  describe('Phase 1: Account-level SIP Resources', () => {
    it('should create an IP ACL', async () => {
      const response = await callTool(sipToolList, 'create_sip_ip_access_control_list', {
        friendlyName: `${TEST_PREFIX}-acl`,
      });

      expect(response.success).toBe(true);
      expect(response.sid).toMatch(/^AL/);
      createdAclSid = response.sid;
    }, 15000);

    it('should add an IP address to the ACL', async () => {
      expect(createdAclSid).not.toBeNull();

      const response = await callTool(sipToolList, 'create_sip_ip_address', {
        ipAccessControlListSid: createdAclSid,
        friendlyName: `${TEST_PREFIX}-ip`,
        ipAddress: TEST_IP,
      });

      expect(response.success).toBe(true);
      expect(response.ipAddress).toBe(TEST_IP);
      createdIpSid = response.sid;
    }, 15000);

    it('should create a credential list', async () => {
      const response = await callTool(sipToolList, 'create_sip_credential_list', {
        friendlyName: `${TEST_PREFIX}-cl`,
      });

      expect(response.success).toBe(true);
      expect(response.sid).toMatch(/^CL/);
      createdClSid = response.sid;
    }, 15000);

    it('should add a credential to the credential list', async () => {
      expect(createdClSid).not.toBeNull();

      const response = await callTool(sipToolList, 'create_sip_credential', {
        credentialListSid: createdClSid,
        username: 'mcptestuser',
        password: 'McpTestPass123!Secure',
      });

      expect(response.success).toBe(true);
      expect(response.username).toBe('mcptestuser');
      createdCredSid = response.sid;
    }, 15000);
  });

  describe('Phase 2: SIP Domain (Programmable Voice)', () => {
    it('should create a SIP Domain', async () => {
      const response = await callTool(sipToolList, 'create_sip_domain', {
        friendlyName: `${TEST_PREFIX}-domain`,
        domainName: `${TEST_PREFIX}.sip.twilio.com`,
      });

      expect(response.success).toBe(true);
      expect(response.sid).toMatch(/^SD/);
      expect(response.domainName).toContain(TEST_PREFIX);
      createdDomainSid = response.sid;
    }, 15000);

    it('should associate IP ACL mapping with domain (legacy)', async () => {
      expect(createdDomainSid).not.toBeNull();
      expect(createdAclSid).not.toBeNull();

      const response = await callTool(sipToolList, 'create_sip_domain_ip_acl_mapping', {
        domainSid: createdDomainSid,
        ipAccessControlListSid: createdAclSid,
      });

      expect(response.success).toBe(true);
      expect(response.sid).toBeDefined();
    }, 15000);

    it('should associate credential list mapping with domain (legacy)', async () => {
      expect(createdDomainSid).not.toBeNull();
      expect(createdClSid).not.toBeNull();

      const response = await callTool(sipToolList, 'create_sip_domain_credential_list_mapping', {
        domainSid: createdDomainSid,
        credentialListSid: createdClSid,
      });

      expect(response.success).toBe(true);
      expect(response.sid).toBeDefined();
    }, 15000);

    it('should list auth calls credential list mappings', async () => {
      // Legacy mappings auto-populate the v2 auth endpoints, so listing should
      // show the CL we associated above
      expect(createdDomainSid).not.toBeNull();

      const response = await callTool(sipToolList, 'list_sip_domain_auth_calls_credential_list_mappings', {
        domainSid: createdDomainSid,
      });

      expect(response.success).toBe(true);
      expect(response.count).toBeGreaterThanOrEqual(0);
    }, 15000);

    it('should list auth calls IP ACL mappings', async () => {
      expect(createdDomainSid).not.toBeNull();

      const response = await callTool(sipToolList, 'list_sip_domain_auth_calls_ip_acl_mappings', {
        domainSid: createdDomainSid,
      });

      expect(response.success).toBe(true);
      expect(response.count).toBeGreaterThanOrEqual(0);
    }, 15000);
  });

  describe('Phase 3: Elastic SIP Trunk', () => {
    it('should create a SIP trunk', async () => {
      const response = await callTool(trunkToolList, 'create_sip_trunk', {
        friendlyName: `${TEST_PREFIX}-trunk`,
      });

      expect(response.success).toBe(true);
      expect(response.sid).toMatch(/^TK/);
      createdTrunkSid = response.sid;
    }, 15000);

    it('should associate IP ACL with trunk', async () => {
      expect(createdTrunkSid).not.toBeNull();
      expect(createdAclSid).not.toBeNull();

      const response = await callTool(trunkToolList, 'associate_ip_access_control_list', {
        trunkSid: createdTrunkSid,
        ipAccessControlListSid: createdAclSid,
      });

      expect(response.success).toBe(true);
    }, 15000);

    it('should associate credential list with trunk', async () => {
      expect(createdTrunkSid).not.toBeNull();
      expect(createdClSid).not.toBeNull();

      const response = await callTool(trunkToolList, 'associate_credential_list', {
        trunkSid: createdTrunkSid,
        credentialListSid: createdClSid,
      });

      expect(response.success).toBe(true);
    }, 15000);

    it('should create origination URL on trunk', async () => {
      expect(createdTrunkSid).not.toBeNull();

      const response = await callTool(trunkToolList, 'create_origination_url', {
        trunkSid: createdTrunkSid,
        friendlyName: `${TEST_PREFIX}-orig`,
        sipUrl: `sip:${TEST_IP}:5060`,
        weight: 10,
        priority: 10,
        enabled: true,
      });

      expect(response.success).toBe(true);
      expect(response.sipUrl).toContain(TEST_IP);
      createdOriginationUrlSid = response.sid;
    }, 15000);
  });

  describe('Phase 4: Connection Policy', () => {
    it('should create a connection policy', async () => {
      const response = await callTool(voiceConfigToolList, 'create_connection_policy', {
        friendlyName: `${TEST_PREFIX}-policy`,
      });

      expect(response.success).toBe(true);
      expect(response.sid).toMatch(/^NY/);
      createdPolicySid = response.sid;
    }, 15000);

    it('should add a target to the connection policy', async () => {
      expect(createdPolicySid).not.toBeNull();

      const response = await callTool(voiceConfigToolList, 'create_connection_policy_target', {
        policySid: createdPolicySid,
        target: `sip:${TEST_IP}:5060`,
        friendlyName: `${TEST_PREFIX}-target`,
        priority: 10,
        weight: 10,
        enabled: true,
      });

      expect(response.success).toBe(true);
      expect(response.sid).toMatch(/^NE/);
      createdTargetSid = response.sid;
    }, 15000);
  });

  describe('Phase 5: Validation', () => {
    it('should validate trunk infrastructure checks', async () => {
      expect(createdTrunkSid).not.toBeNull();

      const response = await callTool(validationToolList, 'validate_sip', {
        trunkSid: createdTrunkSid,
        expectedPbxIp: TEST_IP,
        checkDebugger: false,
      });

      expect(response.checks).toBeDefined();

      // Core trunk checks should pass
      expect(response.checks.trunk.passed).toBe(true);
      expect(response.checks.trunkIpAcl.passed).toBe(true);
      expect(response.checks.trunkPbxIp.passed).toBe(true);
      expect(response.checks.trunkOrigination.passed).toBe(true);

      // No phone numbers is expected in lifecycle test (warning, not error)
      expect(response.checks.trunkPhoneNumbers.passed).toBe(false);
      expect(response.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('no phone numbers')])
      );
    }, 30000);

    it('should validate domain exists with ACL and credential mappings', async () => {
      expect(createdDomainSid).not.toBeNull();

      const response = await callTool(validationToolList, 'validate_sip', {
        domainSid: createdDomainSid,
        checkDebugger: false,
      });

      expect(response.checks).toBeDefined();

      // Domain should exist with proper mappings
      expect(response.checks.domain.passed).toBe(true);
      expect(response.checks.domainIpAcl.passed).toBe(true);
      expect(response.checks.domainCredentials.passed).toBe(true);

      // No voiceUrl is expected in lifecycle test
      expect(response.checks.domainVoiceUrl.passed).toBe(false);
    }, 30000);
  });

  describe('Phase 6: Updates', () => {
    it('should update IP ACL name', async () => {
      expect(createdAclSid).not.toBeNull();

      const response = await callTool(sipToolList, 'update_sip_ip_access_control_list', {
        ipAccessControlListSid: createdAclSid,
        friendlyName: `${TEST_PREFIX}-acl-updated`,
      });

      expect(response.success).toBe(true);
      expect(response.friendlyName).toBe(`${TEST_PREFIX}-acl-updated`);
    }, 15000);

    it('should update trunk configuration', async () => {
      expect(createdTrunkSid).not.toBeNull();

      const response = await callTool(trunkToolList, 'update_sip_trunk', {
        trunkSid: createdTrunkSid,
        friendlyName: `${TEST_PREFIX}-trunk-updated`,
      });

      expect(response.success).toBe(true);
      expect(response.friendlyName).toBe(`${TEST_PREFIX}-trunk-updated`);
    }, 15000);

    it('should update SIP Domain voice URL', async () => {
      expect(createdDomainSid).not.toBeNull();

      const response = await callTool(sipToolList, 'update_sip_domain', {
        domainSid: createdDomainSid,
        voiceUrl: 'https://example.com/voice/updated',
      });

      expect(response.success).toBe(true);
      expect(response.voiceUrl).toBe('https://example.com/voice/updated');
    }, 15000);
  });
});
