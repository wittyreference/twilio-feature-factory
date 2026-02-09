// ABOUTME: Twilio SIP Trunking tools for Elastic SIP infrastructure.
// ABOUTME: Provides SIP domain, IP ACL, credential list, and trunk management.

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
 * Returns all SIP Trunking-related tools configured with the given Twilio context.
 */
export function trunkingTools(context: TwilioContext) {
  const { client } = context;

  // ============ SIP Trunks ============

  const listTrunks = createTool(
    'list_sip_trunks',
    'List all SIP trunks in the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum trunks to return'),
    }),
    async ({ limit }) => {
      const trunks = await client.trunking.v1.trunks.list({ limit });

      const result = trunks.map(t => ({
        sid: t.sid,
        friendlyName: t.friendlyName,
        domainName: t.domainName,
        disasterRecoveryMethod: t.disasterRecoveryMethod,
        disasterRecoveryUrl: t.disasterRecoveryUrl,
        recording: t.recording,
        secure: t.secure,
        cnamLookupEnabled: t.cnamLookupEnabled,
        dateCreated: t.dateCreated,
        dateUpdated: t.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            trunks: result,
          }, null, 2),
        }],
      };
    }
  );

  const getTrunk = createTool(
    'get_sip_trunk',
    'Get details of a specific SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
    }),
    async ({ trunkSid }) => {
      const trunk = await client.trunking.v1.trunks(trunkSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trunk.sid,
            friendlyName: trunk.friendlyName,
            domainName: trunk.domainName,
            disasterRecoveryMethod: trunk.disasterRecoveryMethod,
            disasterRecoveryUrl: trunk.disasterRecoveryUrl,
            recording: trunk.recording,
            secure: trunk.secure,
            cnamLookupEnabled: trunk.cnamLookupEnabled,
            dateCreated: trunk.dateCreated,
            dateUpdated: trunk.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createTrunk = createTool(
    'create_sip_trunk',
    'Create a new SIP trunk.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the trunk'),
      domainName: z.string().optional().describe('Unique domain name for the trunk'),
      disasterRecoveryUrl: z.string().url().optional().describe('Disaster recovery webhook URL'),
      disasterRecoveryMethod: z.enum(['GET', 'POST']).optional().describe('HTTP method for disaster recovery'),
      secure: z.boolean().default(false).describe('Require secure SIP signaling'),
      cnamLookupEnabled: z.boolean().default(false).describe('Enable CNAM lookup'),
    }),
    async ({ friendlyName, domainName, disasterRecoveryUrl, disasterRecoveryMethod, secure, cnamLookupEnabled }) => {
      const trunk = await client.trunking.v1.trunks.create({
        friendlyName,
        secure,
        cnamLookupEnabled,
        ...(domainName && { domainName }),
        ...(disasterRecoveryUrl && { disasterRecoveryUrl }),
        ...(disasterRecoveryMethod && { disasterRecoveryMethod }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trunk.sid,
            friendlyName: trunk.friendlyName,
            domainName: trunk.domainName,
            secure: trunk.secure,
            cnamLookupEnabled: trunk.cnamLookupEnabled,
            dateCreated: trunk.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateTrunk = createTool(
    'update_sip_trunk',
    'Update a SIP trunk configuration.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      domainName: z.string().optional().describe('New domain name'),
      disasterRecoveryUrl: z.string().url().optional().describe('New disaster recovery URL'),
      disasterRecoveryMethod: z.enum(['GET', 'POST']).optional().describe('HTTP method for disaster recovery'),
      secure: z.boolean().optional().describe('Require secure SIP signaling'),
      cnamLookupEnabled: z.boolean().optional().describe('Enable CNAM lookup'),
    }),
    async ({ trunkSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {params[key] = value;}
      });

      const trunk = await client.trunking.v1.trunks(trunkSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trunk.sid,
            friendlyName: trunk.friendlyName,
            domainName: trunk.domainName,
            secure: trunk.secure,
            dateUpdated: trunk.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteTrunk = createTool(
    'delete_sip_trunk',
    'Delete a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
    }),
    async ({ trunkSid }) => {
      await client.trunking.v1.trunks(trunkSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            trunkSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Origination URLs ============

  const listOriginationUrls = createTool(
    'list_origination_urls',
    'List origination URLs for a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum URLs to return'),
    }),
    async ({ trunkSid, limit }) => {
      const urls = await client.trunking.v1.trunks(trunkSid).originationUrls.list({ limit });

      const result = urls.map(u => ({
        sid: u.sid,
        friendlyName: u.friendlyName,
        sipUrl: u.sipUrl,
        weight: u.weight,
        priority: u.priority,
        enabled: u.enabled,
        dateCreated: u.dateCreated,
        dateUpdated: u.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            trunkSid,
            count: result.length,
            originationUrls: result,
          }, null, 2),
        }],
      };
    }
  );

  const createOriginationUrl = createTool(
    'create_origination_url',
    'Add an origination URL to a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      friendlyName: z.string().describe('Friendly name for the URL'),
      sipUrl: z.string().describe('SIP URI for origination (e.g., sip:example.com:5060)'),
      priority: z.number().min(0).max(65535).default(10).describe('Priority (lower = higher priority)'),
      weight: z.number().min(1).max(65535).default(10).describe('Weight for load balancing'),
      enabled: z.boolean().default(true).describe('Whether URL is enabled'),
    }),
    async ({ trunkSid, friendlyName, sipUrl, priority, weight, enabled }) => {
      const url = await client.trunking.v1.trunks(trunkSid).originationUrls.create({
        friendlyName,
        sipUrl,
        priority,
        weight,
        enabled,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: url.sid,
            friendlyName: url.friendlyName,
            sipUrl: url.sipUrl,
            priority: url.priority,
            weight: url.weight,
            enabled: url.enabled,
            dateCreated: url.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteOriginationUrl = createTool(
    'delete_origination_url',
    'Remove an origination URL from a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      originationUrlSid: z.string().startsWith('OU').describe('Origination URL SID (starts with OU)'),
    }),
    async ({ trunkSid, originationUrlSid }) => {
      await client.trunking.v1.trunks(trunkSid).originationUrls(originationUrlSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            trunkSid,
            originationUrlSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ IP Access Control Lists ============

  const listTrunkIpAccessControlLists = createTool(
    'list_trunk_ip_access_control_lists',
    'List IP access control lists associated with a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum ACLs to return'),
    }),
    async ({ trunkSid, limit }) => {
      const acls = await client.trunking.v1.trunks(trunkSid).ipAccessControlLists.list({ limit });

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
            trunkSid,
            count: result.length,
            ipAccessControlLists: result,
          }, null, 2),
        }],
      };
    }
  );

  const associateIpAccessControlList = createTool(
    'associate_ip_access_control_list',
    'Associate an IP access control list with a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
    }),
    async ({ trunkSid, ipAccessControlListSid }) => {
      const acl = await client.trunking.v1.trunks(trunkSid).ipAccessControlLists.create({
        ipAccessControlListSid,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            associated: true,
            trunkSid,
            sid: acl.sid,
            friendlyName: acl.friendlyName,
            dateCreated: acl.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const removeIpAccessControlList = createTool(
    'remove_trunk_ip_access_control_list',
    'Remove an IP access control list from a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      ipAccessControlListSid: z.string().startsWith('AL').describe('IP ACL SID (starts with AL)'),
    }),
    async ({ trunkSid, ipAccessControlListSid }) => {
      await client.trunking.v1.trunks(trunkSid).ipAccessControlLists(ipAccessControlListSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            trunkSid,
            ipAccessControlListSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Credential Lists ============

  const listTrunkCredentialLists = createTool(
    'list_trunk_credential_lists',
    'List credential lists associated with a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum lists to return'),
    }),
    async ({ trunkSid, limit }) => {
      const creds = await client.trunking.v1.trunks(trunkSid).credentialsLists.list({ limit });

      const result = creds.map((c: { sid: string; friendlyName: string; dateCreated: Date; dateUpdated: Date }) => ({
        sid: c.sid,
        friendlyName: c.friendlyName,
        dateCreated: c.dateCreated,
        dateUpdated: c.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            trunkSid,
            count: result.length,
            credentialLists: result,
          }, null, 2),
        }],
      };
    }
  );

  const associateCredentialList = createTool(
    'associate_credential_list',
    'Associate a credential list with a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
    }),
    async ({ trunkSid, credentialListSid }) => {
      const cred = await client.trunking.v1.trunks(trunkSid).credentialsLists.create({
        credentialListSid,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            associated: true,
            trunkSid,
            sid: cred.sid,
            friendlyName: cred.friendlyName,
            dateCreated: cred.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const removeCredentialList = createTool(
    'remove_trunk_credential_list',
    'Remove a credential list from a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      credentialListSid: z.string().startsWith('CL').describe('Credential List SID (starts with CL)'),
    }),
    async ({ trunkSid, credentialListSid }) => {
      await client.trunking.v1.trunks(trunkSid).credentialsLists(credentialListSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            trunkSid,
            credentialListSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Phone Numbers ============

  const listTrunkPhoneNumbers = createTool(
    'list_trunk_phone_numbers',
    'List phone numbers associated with a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum numbers to return'),
    }),
    async ({ trunkSid, limit }) => {
      const numbers = await client.trunking.v1.trunks(trunkSid).phoneNumbers.list({ limit });

      const result = numbers.map(n => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        dateCreated: n.dateCreated,
        dateUpdated: n.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            trunkSid,
            count: result.length,
            phoneNumbers: result,
          }, null, 2),
        }],
      };
    }
  );

  const associatePhoneNumber = createTool(
    'associate_phone_number_to_trunk',
    'Associate a phone number with a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      phoneNumberSid: z.string().startsWith('PN').describe('Phone Number SID (starts with PN)'),
    }),
    async ({ trunkSid, phoneNumberSid }) => {
      const number = await client.trunking.v1.trunks(trunkSid).phoneNumbers.create({
        phoneNumberSid,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            associated: true,
            trunkSid,
            sid: number.sid,
            phoneNumber: number.phoneNumber,
            friendlyName: number.friendlyName,
            dateCreated: number.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const removePhoneNumberFromTrunk = createTool(
    'remove_phone_number_from_trunk',
    'Remove a phone number from a SIP trunk.',
    z.object({
      trunkSid: z.string().startsWith('TK').describe('SIP Trunk SID (starts with TK)'),
      phoneNumberSid: z.string().startsWith('PN').describe('Phone Number SID (starts with PN)'),
    }),
    async ({ trunkSid, phoneNumberSid }) => {
      await client.trunking.v1.trunks(trunkSid).phoneNumbers(phoneNumberSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            trunkSid,
            phoneNumberSid,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listTrunks,
    getTrunk,
    createTrunk,
    updateTrunk,
    deleteTrunk,
    listOriginationUrls,
    createOriginationUrl,
    deleteOriginationUrl,
    listTrunkIpAccessControlLists,
    associateIpAccessControlList,
    removeIpAccessControlList,
    listTrunkCredentialLists,
    associateCredentialList,
    removeCredentialList,
    listTrunkPhoneNumbers,
    associatePhoneNumber,
    removePhoneNumberFromTrunk,
  ];
}
