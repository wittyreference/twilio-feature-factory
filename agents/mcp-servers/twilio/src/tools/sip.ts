// ABOUTME: Account-level SIP resource tools for IP ACLs, credentials, IP addresses, and SIP Domains.
// ABOUTME: Prerequisites for Elastic SIP Trunking and Programmable Voice SIP Domains.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
) {
  return { name, description, inputSchema: schema, handler };
}

/**
 * Returns all account-level SIP resource tools configured with the given Twilio context.
 * These manage IP ACLs, IP addresses, credential lists, and credentials
 * that can be associated with Elastic SIP Trunks.
 */
export function sipTools(context: TwilioContext) {
  const { client } = context;

  // ============ IP Access Control Lists ============

  const listIpAccessControlLists = createTool(
    'list_sip_ip_access_control_lists',
    'List all SIP IP access control lists in the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum ACLs to return'),
    }),
    async ({ limit }) => {
      const acls = await client.sip.ipAccessControlLists.list({ limit });

      const result = acls.map(a => ({
        sid: a.sid,
        friendlyName: a.friendlyName,
        dateCreated: a.dateCreated,
        dateUpdated: a.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            ipAccessControlLists: result,
          }, null, 2),
        }],
      };
    }
  );

  const getIpAccessControlList = createTool(
    'get_sip_ip_access_control_list',
    'Get details of a specific SIP IP access control list.',
    z.object({
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
    }),
    async ({ ipAccessControlListSid }) => {
      const acl = await client.sip.ipAccessControlLists(ipAccessControlListSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: acl.sid,
            friendlyName: acl.friendlyName,
            dateCreated: acl.dateCreated,
            dateUpdated: acl.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createIpAccessControlList = createTool(
    'create_sip_ip_access_control_list',
    'Create a new SIP IP access control list.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the IP ACL'),
    }),
    async ({ friendlyName }) => {
      const acl = await client.sip.ipAccessControlLists.create({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: acl.sid,
            friendlyName: acl.friendlyName,
            dateCreated: acl.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateIpAccessControlList = createTool(
    'update_sip_ip_access_control_list',
    'Update a SIP IP access control list name.',
    z.object({
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
      friendlyName: z.string().describe('New friendly name for the IP ACL'),
    }),
    async ({ ipAccessControlListSid, friendlyName }) => {
      const acl = await client.sip.ipAccessControlLists(ipAccessControlListSid).update({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: acl.sid,
            friendlyName: acl.friendlyName,
            dateUpdated: acl.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteIpAccessControlList = createTool(
    'delete_sip_ip_access_control_list',
    'Delete a SIP IP access control list.',
    z.object({
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
    }),
    async ({ ipAccessControlListSid }) => {
      await client.sip.ipAccessControlLists(ipAccessControlListSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            ipAccessControlListSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ IP Addresses within ACLs ============

  const listIpAddresses = createTool(
    'list_sip_ip_addresses',
    'List IP addresses in a SIP IP access control list.',
    z.object({
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum IP addresses to return'),
    }),
    async ({ ipAccessControlListSid, limit }) => {
      const ips = await client.sip.ipAccessControlLists(ipAccessControlListSid).ipAddresses.list({ limit });

      const result = ips.map(ip => ({
        sid: ip.sid,
        friendlyName: ip.friendlyName,
        ipAddress: ip.ipAddress,
        cidrPrefixLength: ip.cidrPrefixLength,
        dateCreated: ip.dateCreated,
        dateUpdated: ip.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            ipAccessControlListSid,
            count: result.length,
            ipAddresses: result,
          }, null, 2),
        }],
      };
    }
  );

  const getIpAddress = createTool(
    'get_sip_ip_address',
    'Get details of a specific IP address entry in an ACL.',
    z.object({
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
      ipAddressSid: z.string().startsWith('IP').describe('IP Address SID (starts with IP)'),
    }),
    async ({ ipAccessControlListSid, ipAddressSid }) => {
      const ip = await client.sip.ipAccessControlLists(ipAccessControlListSid).ipAddresses(ipAddressSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: ip.sid,
            friendlyName: ip.friendlyName,
            ipAddress: ip.ipAddress,
            cidrPrefixLength: ip.cidrPrefixLength,
            dateCreated: ip.dateCreated,
            dateUpdated: ip.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createIpAddress = createTool(
    'create_sip_ip_address',
    'Add an IP address to a SIP IP access control list.',
    z.object({
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
      friendlyName: z.string().describe('Friendly name for the IP address entry'),
      ipAddress: z.string().describe('IP address (e.g., 10.0.0.1)'),
      cidrPrefixLength: z.number().min(0).max(32).optional().describe('CIDR prefix length (0-32) for subnet ranges'),
    }),
    async ({ ipAccessControlListSid, friendlyName, ipAddress, cidrPrefixLength }) => {
      const ip = await client.sip.ipAccessControlLists(ipAccessControlListSid).ipAddresses.create({
        friendlyName,
        ipAddress,
        ...(cidrPrefixLength !== undefined && { cidrPrefixLength }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: ip.sid,
            friendlyName: ip.friendlyName,
            ipAddress: ip.ipAddress,
            cidrPrefixLength: ip.cidrPrefixLength,
            dateCreated: ip.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateIpAddress = createTool(
    'update_sip_ip_address',
    'Update an IP address entry in an ACL.',
    z.object({
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
      ipAddressSid: z.string().startsWith('IP').describe('IP Address SID (starts with IP)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      ipAddress: z.string().optional().describe('New IP address'),
      cidrPrefixLength: z.number().min(0).max(32).optional().describe('New CIDR prefix length'),
    }),
    async ({ ipAccessControlListSid, ipAddressSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {params[key] = value;}
      });

      const ip = await client.sip.ipAccessControlLists(ipAccessControlListSid).ipAddresses(ipAddressSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: ip.sid,
            friendlyName: ip.friendlyName,
            ipAddress: ip.ipAddress,
            cidrPrefixLength: ip.cidrPrefixLength,
            dateUpdated: ip.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteIpAddress = createTool(
    'delete_sip_ip_address',
    'Remove an IP address from a SIP IP access control list.',
    z.object({
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
      ipAddressSid: z.string().startsWith('IP').describe('IP Address SID (starts with IP)'),
    }),
    async ({ ipAccessControlListSid, ipAddressSid }) => {
      await client.sip.ipAccessControlLists(ipAccessControlListSid).ipAddresses(ipAddressSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            ipAccessControlListSid,
            ipAddressSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Credential Lists ============

  const listCredentialLists = createTool(
    'list_sip_credential_lists',
    'List all SIP credential lists in the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum credential lists to return'),
    }),
    async ({ limit }) => {
      const lists = await client.sip.credentialLists.list({ limit });

      const result = lists.map(l => ({
        sid: l.sid,
        friendlyName: l.friendlyName,
        dateCreated: l.dateCreated,
        dateUpdated: l.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            credentialLists: result,
          }, null, 2),
        }],
      };
    }
  );

  const getCredentialList = createTool(
    'get_sip_credential_list',
    'Get details of a specific SIP credential list.',
    z.object({
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
    }),
    async ({ credentialListSid }) => {
      const list = await client.sip.credentialLists(credentialListSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: list.sid,
            friendlyName: list.friendlyName,
            dateCreated: list.dateCreated,
            dateUpdated: list.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createCredentialList = createTool(
    'create_sip_credential_list',
    'Create a new SIP credential list.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the credential list'),
    }),
    async ({ friendlyName }) => {
      const list = await client.sip.credentialLists.create({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: list.sid,
            friendlyName: list.friendlyName,
            dateCreated: list.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateCredentialList = createTool(
    'update_sip_credential_list',
    'Update a SIP credential list name.',
    z.object({
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
      friendlyName: z.string().describe('New friendly name for the credential list'),
    }),
    async ({ credentialListSid, friendlyName }) => {
      const list = await client.sip.credentialLists(credentialListSid).update({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: list.sid,
            friendlyName: list.friendlyName,
            dateUpdated: list.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteCredentialList = createTool(
    'delete_sip_credential_list',
    'Delete a SIP credential list.',
    z.object({
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
    }),
    async ({ credentialListSid }) => {
      await client.sip.credentialLists(credentialListSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            credentialListSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Credentials within Lists ============

  const listCredentials = createTool(
    'list_sip_credentials',
    'List credentials in a SIP credential list.',
    z.object({
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum credentials to return'),
    }),
    async ({ credentialListSid, limit }) => {
      const creds = await client.sip.credentialLists(credentialListSid).credentials.list({ limit });

      const result = creds.map(c => ({
        sid: c.sid,
        username: c.username,
        dateCreated: c.dateCreated,
        dateUpdated: c.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            credentialListSid,
            count: result.length,
            credentials: result,
          }, null, 2),
        }],
      };
    }
  );

  const getCredential = createTool(
    'get_sip_credential',
    'Get details of a specific credential in a credential list.',
    z.object({
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
      credentialSid: z.string().startsWith('CR').describe('Credential SID (starts with CR)'),
    }),
    async ({ credentialListSid, credentialSid }) => {
      const cred = await client.sip.credentialLists(credentialListSid).credentials(credentialSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: cred.sid,
            username: cred.username,
            dateCreated: cred.dateCreated,
            dateUpdated: cred.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createCredential = createTool(
    'create_sip_credential',
    'Add a username/password credential to a SIP credential list.',
    z.object({
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
      username: z.string().max(32).describe('SIP username (max 32 characters)'),
      password: z.string().min(12).describe('SIP password (min 12 characters, must include digit and mixed case)'),
    }),
    async ({ credentialListSid, username, password }) => {
      const cred = await client.sip.credentialLists(credentialListSid).credentials.create({
        username,
        password,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: cred.sid,
            username: cred.username,
            dateCreated: cred.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateCredential = createTool(
    'update_sip_credential',
    'Update a credential password in a SIP credential list.',
    z.object({
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
      credentialSid: z.string().startsWith('CR').describe('Credential SID (starts with CR)'),
      password: z.string().min(12).optional().describe('New password (min 12 characters, must include digit and mixed case)'),
    }),
    async ({ credentialListSid, credentialSid, password }) => {
      const params: Record<string, unknown> = {};
      if (password !== undefined) {params.password = password;}

      const cred = await client.sip.credentialLists(credentialListSid).credentials(credentialSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: cred.sid,
            username: cred.username,
            dateUpdated: cred.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteCredential = createTool(
    'delete_sip_credential',
    'Remove a credential from a SIP credential list.',
    z.object({
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
      credentialSid: z.string().startsWith('CR').describe('Credential SID (starts with CR)'),
    }),
    async ({ credentialListSid, credentialSid }) => {
      await client.sip.credentialLists(credentialListSid).credentials(credentialSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            credentialListSid,
            credentialSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ SIP Domains (Programmable Voice) ============

  const listSipDomains = createTool(
    'list_sip_domains',
    'List all SIP Domains in the account. SIP Domains are used with Programmable Voice for SIP endpoint registration (unlike Elastic SIP Trunking which uses direct INVITE).',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum domains to return'),
    }),
    async ({ limit }) => {
      const domains = await client.sip.domains.list({ limit });

      const result = domains.map(d => ({
        sid: d.sid,
        friendlyName: d.friendlyName,
        domainName: d.domainName,
        voiceUrl: d.voiceUrl,
        voiceMethod: d.voiceMethod,
        voiceFallbackUrl: d.voiceFallbackUrl,
        voiceStatusCallbackUrl: d.voiceStatusCallbackUrl,
        dateCreated: d.dateCreated,
        dateUpdated: d.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            sipDomains: result,
          }, null, 2),
        }],
      };
    }
  );

  const getSipDomain = createTool(
    'get_sip_domain',
    'Get details of a specific SIP Domain.',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID (starts with SD)'),
    }),
    async ({ domainSid }) => {
      const domain = await client.sip.domains(domainSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: domain.sid,
            friendlyName: domain.friendlyName,
            domainName: domain.domainName,
            voiceUrl: domain.voiceUrl,
            voiceMethod: domain.voiceMethod,
            voiceFallbackUrl: domain.voiceFallbackUrl,
            voiceStatusCallbackUrl: domain.voiceStatusCallbackUrl,
            dateCreated: domain.dateCreated,
            dateUpdated: domain.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createSipDomain = createTool(
    'create_sip_domain',
    'Create a new SIP Domain for Programmable Voice. SIP endpoints can register to this domain. Inbound calls to registered endpoints trigger the voiceUrl webhook.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the SIP Domain'),
      domainName: z.string().describe('Unique domain name (e.g., "my-app.sip.twilio.com"). Must end with .sip.twilio.com'),
      voiceUrl: z.string().url().optional().describe('Voice webhook URL for inbound calls'),
      voiceMethod: z.enum(['GET', 'POST']).default('POST').describe('HTTP method for voice webhook'),
      voiceFallbackUrl: z.string().url().optional().describe('Fallback URL if voiceUrl fails'),
      voiceStatusCallbackUrl: z.string().url().optional().describe('URL for call status updates'),
    }),
    async ({ friendlyName, domainName, voiceUrl, voiceMethod, voiceFallbackUrl, voiceStatusCallbackUrl }) => {
      const domain = await client.sip.domains.create({
        friendlyName,
        domainName,
        voiceMethod,
        ...(voiceUrl && { voiceUrl }),
        ...(voiceFallbackUrl && { voiceFallbackUrl }),
        ...(voiceStatusCallbackUrl && { voiceStatusCallbackUrl }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: domain.sid,
            friendlyName: domain.friendlyName,
            domainName: domain.domainName,
            voiceUrl: domain.voiceUrl,
            dateCreated: domain.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateSipDomain = createTool(
    'update_sip_domain',
    'Update a SIP Domain configuration (voice URL, fallback URL, etc.).',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID (starts with SD)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      voiceUrl: z.string().url().optional().describe('New voice webhook URL'),
      voiceMethod: z.enum(['GET', 'POST']).optional().describe('HTTP method for voice webhook'),
      voiceFallbackUrl: z.string().url().optional().describe('New fallback URL'),
      voiceStatusCallbackUrl: z.string().url().optional().describe('New status callback URL'),
    }),
    async ({ domainSid, ...updates }) => {
      const domain = await client.sip.domains(domainSid).update({
        ...(updates.friendlyName && { friendlyName: updates.friendlyName }),
        ...(updates.voiceUrl && { voiceUrl: updates.voiceUrl }),
        ...(updates.voiceMethod && { voiceMethod: updates.voiceMethod }),
        ...(updates.voiceFallbackUrl && { voiceFallbackUrl: updates.voiceFallbackUrl }),
        ...(updates.voiceStatusCallbackUrl && { voiceStatusCallbackUrl: updates.voiceStatusCallbackUrl }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: domain.sid,
            friendlyName: domain.friendlyName,
            domainName: domain.domainName,
            voiceUrl: domain.voiceUrl,
            dateUpdated: domain.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteSipDomain = createTool(
    'delete_sip_domain',
    'Delete a SIP Domain. All associated IP ACL and credential list mappings are also removed.',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID (starts with SD)'),
    }),
    async ({ domainSid }) => {
      await client.sip.domains(domainSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            domainSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ SIP Domain IP ACL Mappings ============

  const listSipDomainIpAclMappings = createTool(
    'list_sip_domain_ip_acl_mappings',
    'List IP ACLs associated with a SIP Domain. IP ACLs control which IP addresses can send SIP traffic to this domain.',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum mappings to return'),
    }),
    async ({ domainSid, limit }) => {
      const mappings = await client.sip.domains(domainSid)
        .ipAccessControlListMappings.list({ limit });

      const result = mappings.map(m => ({
        sid: m.sid,
        friendlyName: m.friendlyName,
        dateCreated: m.dateCreated,
        dateUpdated: m.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            domainSid,
            ipAclMappings: result,
          }, null, 2),
        }],
      };
    }
  );

  const createSipDomainIpAclMapping = createTool(
    'create_sip_domain_ip_acl_mapping',
    'Associate an IP ACL with a SIP Domain. Only IPs in the ACL will be allowed to send SIP traffic to this domain.',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID'),
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID to associate'),
    }),
    async ({ domainSid, ipAccessControlListSid }) => {
      const mapping = await client.sip.domains(domainSid)
        .ipAccessControlListMappings.create({ ipAccessControlListSid });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: mapping.sid,
            domainSid,
            friendlyName: mapping.friendlyName,
            dateCreated: mapping.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteSipDomainIpAclMapping = createTool(
    'delete_sip_domain_ip_acl_mapping',
    'Remove an IP ACL association from a SIP Domain.',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID'),
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID to disassociate'),
    }),
    async ({ domainSid, ipAccessControlListSid }) => {
      await client.sip.domains(domainSid)
        .ipAccessControlListMappings(ipAccessControlListSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            domainSid,
            ipAccessControlListSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ SIP Domain Credential List Mappings ============

  const listSipDomainCredentialListMappings = createTool(
    'list_sip_domain_credential_list_mappings',
    'List credential lists associated with a SIP Domain. These control which username/password pairs can register to this domain.',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum mappings to return'),
    }),
    async ({ domainSid, limit }) => {
      const mappings = await client.sip.domains(domainSid)
        .credentialListMappings.list({ limit });

      const result = mappings.map(m => ({
        sid: m.sid,
        friendlyName: m.friendlyName,
        dateCreated: m.dateCreated,
        dateUpdated: m.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            domainSid,
            credentialListMappings: result,
          }, null, 2),
        }],
      };
    }
  );

  const createSipDomainCredentialListMapping = createTool(
    'create_sip_domain_credential_list_mapping',
    'Associate a credential list with a SIP Domain. Endpoints must authenticate with credentials from this list to register.',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID'),
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID to associate'),
    }),
    async ({ domainSid, credentialListSid }) => {
      const mapping = await client.sip.domains(domainSid)
        .credentialListMappings.create({ credentialListSid });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: mapping.sid,
            domainSid,
            friendlyName: mapping.friendlyName,
            dateCreated: mapping.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteSipDomainCredentialListMapping = createTool(
    'delete_sip_domain_credential_list_mapping',
    'Remove a credential list association from a SIP Domain.',
    z.object({
      domainSid: z.string().startsWith('SD').describe('SIP Domain SID'),
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID to disassociate'),
    }),
    async ({ domainSid, credentialListSid }) => {
      await client.sip.domains(domainSid)
        .credentialListMappings(credentialListSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            domainSid,
            credentialListSid,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listIpAccessControlLists,
    getIpAccessControlList,
    createIpAccessControlList,
    updateIpAccessControlList,
    deleteIpAccessControlList,
    listIpAddresses,
    getIpAddress,
    createIpAddress,
    updateIpAddress,
    deleteIpAddress,
    listCredentialLists,
    getCredentialList,
    createCredentialList,
    updateCredentialList,
    deleteCredentialList,
    listCredentials,
    getCredential,
    createCredential,
    updateCredential,
    deleteCredential,
    // SIP Domains (Programmable Voice)
    listSipDomains,
    getSipDomain,
    createSipDomain,
    updateSipDomain,
    deleteSipDomain,
    listSipDomainIpAclMappings,
    createSipDomainIpAclMapping,
    deleteSipDomainIpAclMapping,
    listSipDomainCredentialListMappings,
    createSipDomainCredentialListMapping,
    deleteSipDomainCredentialListMapping,
  ];
}
