// ABOUTME: Twilio Voice configuration tools for dialing permissions and BYOC.
// ABOUTME: Provides comprehensive dialing permissions, BYOC trunks, and connection policy management.

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
 * Returns all Voice Configuration-related tools configured with the given Twilio context.
 */
export function voiceConfigTools(context: TwilioContext) {
  const { client } = context;

  const getDialingPermissions = createTool(
    'get_dialing_permissions',
    'Get dialing permissions for a specific country.',
    z.object({
      isoCode: z.string().length(2).describe('ISO 3166-1 alpha-2 country code (e.g., US, GB)'),
    }),
    async ({ isoCode }) => {
      const country = await client.voice.v1
        .dialingPermissions
        .countries(isoCode.toUpperCase())
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            isoCode: country.isoCode,
            name: country.name,
            continent: country.continent,
            countryCodes: country.countryCodes,
            lowRiskNumbersEnabled: country.lowRiskNumbersEnabled,
            highRiskSpecialNumbersEnabled: country.highRiskSpecialNumbersEnabled,
            highRiskTollfraudNumbersEnabled: country.highRiskTollfraudNumbersEnabled,
          }, null, 2),
        }],
      };
    }
  );

  const listDialingPermissionsCountries = createTool(
    'list_dialing_permissions_countries',
    'List countries with their dialing permission settings.',
    z.object({
      isoCode: z.string().optional().describe('Filter by ISO country code'),
      continent: z.string().optional().describe('Filter by continent'),
      lowRiskNumbersEnabled: z.boolean().optional().describe('Filter by low risk enabled'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum countries to return'),
    }),
    async ({ isoCode, continent, lowRiskNumbersEnabled, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (isoCode) params.isoCode = isoCode;
      if (continent) params.continent = continent;
      if (lowRiskNumbersEnabled !== undefined) params.lowRiskNumbersEnabled = lowRiskNumbersEnabled;

      const countries = await client.voice.v1.dialingPermissions.countries.list(params);

      const result = countries.map(c => ({
        isoCode: c.isoCode,
        name: c.name,
        continent: c.continent,
        lowRiskNumbersEnabled: c.lowRiskNumbersEnabled,
        highRiskSpecialNumbersEnabled: c.highRiskSpecialNumbersEnabled,
        highRiskTollfraudNumbersEnabled: c.highRiskTollfraudNumbersEnabled,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            countries: result,
          }, null, 2),
        }],
      };
    }
  );

  const listByocTrunks = createTool(
    'list_byoc_trunks',
    'List BYOC (Bring Your Own Carrier) trunks.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum trunks to return'),
    }),
    async ({ limit }) => {
      const trunks = await client.voice.v1.byocTrunks.list({ limit });

      const result = trunks.map(t => ({
        sid: t.sid,
        friendlyName: t.friendlyName,
        voiceUrl: t.voiceUrl,
        voiceMethod: t.voiceMethod,
        voiceFallbackUrl: t.voiceFallbackUrl,
        statusCallbackUrl: t.statusCallbackUrl,
        cnamLookupEnabled: t.cnamLookupEnabled,
        connectionPolicySid: t.connectionPolicySid,
        fromDomainSid: t.fromDomainSid,
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

  const createByocTrunk = createTool(
    'create_byoc_trunk',
    'Create a BYOC trunk for external SIP connectivity.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the trunk'),
      voiceUrl: z.string().url().describe('URL for voice webhook'),
      voiceMethod: z.enum(['GET', 'POST']).default('POST').describe('HTTP method for voice webhook'),
      voiceFallbackUrl: z.string().url().optional().describe('Fallback URL for voice webhook'),
      statusCallbackUrl: z.string().url().optional().describe('URL for status callbacks'),
      cnamLookupEnabled: z.boolean().default(false).describe('Enable CNAM lookup'),
      connectionPolicySid: z.string().startsWith('NY').optional().describe('Connection Policy SID'),
    }),
    async ({ friendlyName, voiceUrl, voiceMethod, voiceFallbackUrl, statusCallbackUrl, cnamLookupEnabled, connectionPolicySid }) => {
      const params: Record<string, unknown> = {
        friendlyName,
        voiceUrl,
        voiceMethod,
        cnamLookupEnabled,
      };

      if (voiceFallbackUrl) params.voiceFallbackUrl = voiceFallbackUrl;
      if (statusCallbackUrl) params.statusCallbackUrl = statusCallbackUrl;
      if (connectionPolicySid) params.connectionPolicySid = connectionPolicySid;

      const trunk = await client.voice.v1.byocTrunks.create(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trunk.sid,
            friendlyName: trunk.friendlyName,
            voiceUrl: trunk.voiceUrl,
            voiceMethod: trunk.voiceMethod,
            voiceFallbackUrl: trunk.voiceFallbackUrl,
            statusCallbackUrl: trunk.statusCallbackUrl,
            cnamLookupEnabled: trunk.cnamLookupEnabled,
            connectionPolicySid: trunk.connectionPolicySid,
            dateCreated: trunk.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const getByocTrunk = createTool(
    'get_byoc_trunk',
    'Get details of a specific BYOC trunk.',
    z.object({
      trunkSid: z.string().startsWith('BY').describe('BYOC Trunk SID (starts with BY)'),
    }),
    async ({ trunkSid }) => {
      const trunk = await client.voice.v1.byocTrunks(trunkSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trunk.sid,
            friendlyName: trunk.friendlyName,
            voiceUrl: trunk.voiceUrl,
            voiceMethod: trunk.voiceMethod,
            voiceFallbackUrl: trunk.voiceFallbackUrl,
            voiceFallbackMethod: trunk.voiceFallbackMethod,
            statusCallbackUrl: trunk.statusCallbackUrl,
            statusCallbackMethod: trunk.statusCallbackMethod,
            cnamLookupEnabled: trunk.cnamLookupEnabled,
            connectionPolicySid: trunk.connectionPolicySid,
            fromDomainSid: trunk.fromDomainSid,
            dateCreated: trunk.dateCreated,
            dateUpdated: trunk.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateByocTrunk = createTool(
    'update_byoc_trunk',
    'Update a BYOC trunk configuration.',
    z.object({
      trunkSid: z.string().startsWith('BY').describe('BYOC Trunk SID (starts with BY)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      voiceUrl: z.string().url().optional().describe('New voice webhook URL'),
      voiceMethod: z.enum(['GET', 'POST']).optional().describe('New HTTP method for voice webhook'),
      voiceFallbackUrl: z.string().url().optional().describe('New fallback URL'),
      statusCallbackUrl: z.string().url().optional().describe('New status callback URL'),
      cnamLookupEnabled: z.boolean().optional().describe('Enable/disable CNAM lookup'),
      connectionPolicySid: z.string().startsWith('NY').optional().describe('New Connection Policy SID'),
    }),
    async ({ trunkSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) params[key] = value;
      });

      const trunk = await client.voice.v1.byocTrunks(trunkSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trunk.sid,
            friendlyName: trunk.friendlyName,
            voiceUrl: trunk.voiceUrl,
            voiceMethod: trunk.voiceMethod,
            cnamLookupEnabled: trunk.cnamLookupEnabled,
            connectionPolicySid: trunk.connectionPolicySid,
            dateUpdated: trunk.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteByocTrunk = createTool(
    'delete_byoc_trunk',
    'Delete a BYOC trunk.',
    z.object({
      trunkSid: z.string().startsWith('BY').describe('BYOC Trunk SID (starts with BY)'),
    }),
    async ({ trunkSid }) => {
      await client.voice.v1.byocTrunks(trunkSid).remove();

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

  const listConnectionPolicies = createTool(
    'list_connection_policies',
    'List connection policies for BYOC trunks.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum policies to return'),
    }),
    async ({ limit }) => {
      const policies = await client.voice.v1.connectionPolicies.list({ limit });

      const result = policies.map(p => ({
        sid: p.sid,
        friendlyName: p.friendlyName,
        dateCreated: p.dateCreated,
        dateUpdated: p.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            connectionPolicies: result,
          }, null, 2),
        }],
      };
    }
  );

  const createConnectionPolicy = createTool(
    'create_connection_policy',
    'Create a connection policy for BYOC trunks.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the policy'),
    }),
    async ({ friendlyName }) => {
      const policy = await client.voice.v1.connectionPolicies.create({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: policy.sid,
            friendlyName: policy.friendlyName,
            dateCreated: policy.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const getConnectionPolicy = createTool(
    'get_connection_policy',
    'Get details of a specific connection policy.',
    z.object({
      policySid: z.string().startsWith('NY').describe('Connection Policy SID (starts with NY)'),
    }),
    async ({ policySid }) => {
      const policy = await client.voice.v1.connectionPolicies(policySid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: policy.sid,
            friendlyName: policy.friendlyName,
            dateCreated: policy.dateCreated,
            dateUpdated: policy.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteConnectionPolicy = createTool(
    'delete_connection_policy',
    'Delete a connection policy.',
    z.object({
      policySid: z.string().startsWith('NY').describe('Connection Policy SID (starts with NY)'),
    }),
    async ({ policySid }) => {
      await client.voice.v1.connectionPolicies(policySid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            policySid,
          }, null, 2),
        }],
      };
    }
  );

  const listConnectionPolicyTargets = createTool(
    'list_connection_policy_targets',
    'List targets for a connection policy.',
    z.object({
      policySid: z.string().startsWith('NY').describe('Connection Policy SID (starts with NY)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum targets to return'),
    }),
    async ({ policySid, limit }) => {
      const targets = await client.voice.v1
        .connectionPolicies(policySid)
        .targets.list({ limit });

      const result = targets.map(t => ({
        sid: t.sid,
        friendlyName: t.friendlyName,
        target: t.target,
        priority: t.priority,
        weight: t.weight,
        enabled: t.enabled,
        dateCreated: t.dateCreated,
        dateUpdated: t.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            policySid,
            count: result.length,
            targets: result,
          }, null, 2),
        }],
      };
    }
  );

  const createConnectionPolicyTarget = createTool(
    'create_connection_policy_target',
    'Add a target to a connection policy.',
    z.object({
      policySid: z.string().startsWith('NY').describe('Connection Policy SID (starts with NY)'),
      target: z.string().describe('Target SIP URI (e.g., sip:user@example.com)'),
      friendlyName: z.string().optional().describe('Friendly name for the target'),
      priority: z.number().min(0).max(65535).default(10).describe('Target priority (lower = higher priority)'),
      weight: z.number().min(1).max(65535).default(10).describe('Target weight for load balancing'),
      enabled: z.boolean().default(true).describe('Whether target is enabled'),
    }),
    async ({ policySid, target, friendlyName, priority, weight, enabled }) => {
      const targetResult = await client.voice.v1
        .connectionPolicies(policySid)
        .targets.create({
          target,
          priority,
          weight,
          enabled,
          ...(friendlyName && { friendlyName }),
        });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: targetResult.sid,
            friendlyName: targetResult.friendlyName,
            target: targetResult.target,
            priority: targetResult.priority,
            weight: targetResult.weight,
            enabled: targetResult.enabled,
            dateCreated: targetResult.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteConnectionPolicyTarget = createTool(
    'delete_connection_policy_target',
    'Remove a target from a connection policy.',
    z.object({
      policySid: z.string().startsWith('NY').describe('Connection Policy SID (starts with NY)'),
      targetSid: z.string().startsWith('NE').describe('Target SID (starts with NE)'),
    }),
    async ({ policySid, targetSid }) => {
      await client.voice.v1
        .connectionPolicies(policySid)
        .targets(targetSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            policySid,
            targetSid,
          }, null, 2),
        }],
      };
    }
  );

  return [
    getDialingPermissions,
    listDialingPermissionsCountries,
    listByocTrunks,
    getByocTrunk,
    createByocTrunk,
    updateByocTrunk,
    deleteByocTrunk,
    listConnectionPolicies,
    createConnectionPolicy,
    getConnectionPolicy,
    deleteConnectionPolicy,
    listConnectionPolicyTargets,
    createConnectionPolicyTarget,
    deleteConnectionPolicyTarget,
  ];
}
