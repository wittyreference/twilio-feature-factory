// ABOUTME: Twilio Proxy tools for anonymous number masking.
// ABOUTME: Provides comprehensive service, session, and participant management.

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
 * Returns all Proxy-related tools configured with the given Twilio context.
 */
export function proxyTools(context: TwilioContext) {
  const { client } = context;

  const createProxyService = createTool(
    'create_proxy_service',
    'Create a new Proxy service for number masking.',
    z.object({
      uniqueName: z.string().describe('Unique name for the proxy service'),
      callbackUrl: z.string().url().optional().describe('Webhook URL for session events'),
      geoMatchLevel: z.enum(['area-code', 'overlay', 'radius', 'country']).default('country').describe('Geographic matching level'),
      numberSelectionBehavior: z.enum(['avoid-sticky', 'prefer-sticky']).default('prefer-sticky').describe('Number selection behavior'),
      defaultTtl: z.number().optional().describe('Default session TTL in seconds'),
    }),
    async ({ uniqueName, callbackUrl, geoMatchLevel, numberSelectionBehavior, defaultTtl }) => {
      const params: Record<string, unknown> = {
        uniqueName,
        geoMatchLevel,
        numberSelectionBehavior,
      };

      if (callbackUrl) params.callbackUrl = callbackUrl;
      if (defaultTtl) params.defaultTtl = defaultTtl;

      const service = await client.proxy.v1.services.create(
        params as unknown as Parameters<typeof client.proxy.v1.services.create>[0]
      );

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            uniqueName: service.uniqueName,
            geoMatchLevel: service.geoMatchLevel,
            numberSelectionBehavior: service.numberSelectionBehavior,
            defaultTtl: service.defaultTtl,
            callbackUrl: service.callbackUrl,
            dateCreated: service.dateCreated,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createProxySession = createTool(
    'create_proxy_session',
    'Create a new masked session between participants.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      uniqueName: z.string().optional().describe('Unique name for the session'),
      ttl: z.number().optional().describe('Session TTL in seconds'),
      mode: z.enum(['voice-and-message', 'voice-only', 'message-only']).default('voice-and-message').describe('Communication mode'),
      status: z.enum(['open', 'in-progress', 'closed']).optional().describe('Initial session status'),
    }),
    async ({ serviceSid, uniqueName, ttl, mode, status }) => {
      const params: Record<string, unknown> = { mode };

      if (uniqueName) params.uniqueName = uniqueName;
      if (ttl) params.ttl = ttl;
      if (status) params.status = status;

      const session = await client.proxy.v1
        .services(serviceSid)
        .sessions.create(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: session.sid,
            serviceSid: session.serviceSid,
            uniqueName: session.uniqueName,
            status: session.status,
            mode: session.mode,
            ttl: session.ttl,
            dateCreated: session.dateCreated,
            dateExpiry: session.dateExpiry,
          }, null, 2),
        }],
      };
    }
  );

  const addProxyParticipant = createTool(
    'add_proxy_participant',
    'Add a participant to a proxy session.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      sessionSid: z.string().startsWith('KC').describe('Session SID (starts with KC)'),
      identifier: z.string().describe('Participant phone number (E.164)'),
      friendlyName: z.string().optional().describe('Friendly name for the participant'),
      proxyIdentifier: z.string().optional().describe('Specific proxy number to use'),
    }),
    async ({ serviceSid, sessionSid, identifier, friendlyName, proxyIdentifier }) => {
      const params: {
        identifier: string;
        friendlyName?: string;
        proxyIdentifier?: string;
      } = { identifier };

      if (friendlyName) params.friendlyName = friendlyName;
      if (proxyIdentifier) params.proxyIdentifier = proxyIdentifier;

      const participant = await client.proxy.v1
        .services(serviceSid)
        .sessions(sessionSid)
        .participants.create(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: participant.sid,
            sessionSid: participant.sessionSid,
            serviceSid: participant.serviceSid,
            identifier: participant.identifier,
            proxyIdentifier: participant.proxyIdentifier,
            friendlyName: participant.friendlyName,
            dateCreated: participant.dateCreated,
            dateUpdated: participant.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listProxySessions = createTool(
    'list_proxy_sessions',
    'List sessions in a proxy service.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      status: z.enum(['open', 'in-progress', 'closed', 'failed', 'unknown']).optional().describe('Filter by status'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum sessions to return'),
    }),
    async ({ serviceSid, status, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) params.status = status;

      const sessions = await client.proxy.v1
        .services(serviceSid)
        .sessions.list(params);

      const result = sessions.map(s => ({
        sid: s.sid,
        uniqueName: s.uniqueName,
        status: s.status,
        mode: s.mode,
        ttl: s.ttl,
        dateCreated: s.dateCreated,
        dateExpiry: s.dateExpiry,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            sessions: result,
          }, null, 2),
        }],
      };
    }
  );

  const listProxyServices = createTool(
    'list_proxy_services',
    'List all Proxy services in the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum services to return'),
    }),
    async ({ limit }) => {
      const services = await client.proxy.v1.services.list({ limit });

      const result = services.map(s => ({
        sid: s.sid,
        uniqueName: s.uniqueName,
        geoMatchLevel: s.geoMatchLevel,
        numberSelectionBehavior: s.numberSelectionBehavior,
        defaultTtl: s.defaultTtl,
        callbackUrl: s.callbackUrl,
        dateCreated: s.dateCreated,
        dateUpdated: s.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            services: result,
          }, null, 2),
        }],
      };
    }
  );

  const getProxyService = createTool(
    'get_proxy_service',
    'Get details of a specific Proxy service.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
    }),
    async ({ serviceSid }) => {
      const service = await client.proxy.v1.services(serviceSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            uniqueName: service.uniqueName,
            geoMatchLevel: service.geoMatchLevel,
            numberSelectionBehavior: service.numberSelectionBehavior,
            defaultTtl: service.defaultTtl,
            callbackUrl: service.callbackUrl,
            outOfSessionCallbackUrl: service.outOfSessionCallbackUrl,
            interceptCallbackUrl: service.interceptCallbackUrl,
            dateCreated: service.dateCreated,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateProxyService = createTool(
    'update_proxy_service',
    'Update a Proxy service configuration.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      uniqueName: z.string().optional().describe('New unique name'),
      defaultTtl: z.number().optional().describe('New default session TTL in seconds'),
      callbackUrl: z.string().url().optional().describe('New callback URL'),
      geoMatchLevel: z.enum(['area-code', 'overlay', 'radius', 'country']).optional().describe('New geo match level'),
      numberSelectionBehavior: z.enum(['avoid-sticky', 'prefer-sticky']).optional().describe('New number selection behavior'),
    }),
    async ({ serviceSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) params[key] = value;
      });

      const service = await client.proxy.v1.services(serviceSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            uniqueName: service.uniqueName,
            defaultTtl: service.defaultTtl,
            callbackUrl: service.callbackUrl,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteProxyService = createTool(
    'delete_proxy_service',
    'Delete a Proxy service.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
    }),
    async ({ serviceSid }) => {
      await client.proxy.v1.services(serviceSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            serviceSid,
          }, null, 2),
        }],
      };
    }
  );

  const getProxySession = createTool(
    'get_proxy_session',
    'Get details of a specific Proxy session.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      sessionSid: z.string().startsWith('KC').describe('Session SID (starts with KC)'),
    }),
    async ({ serviceSid, sessionSid }) => {
      const session = await client.proxy.v1
        .services(serviceSid)
        .sessions(sessionSid)
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: session.sid,
            serviceSid: session.serviceSid,
            uniqueName: session.uniqueName,
            status: session.status,
            mode: session.mode,
            ttl: session.ttl,
            dateCreated: session.dateCreated,
            dateUpdated: session.dateUpdated,
            dateExpiry: session.dateExpiry,
            dateStarted: session.dateStarted,
            dateEnded: session.dateEnded,
          }, null, 2),
        }],
      };
    }
  );

  const updateProxySession = createTool(
    'update_proxy_session',
    'Update a Proxy session (e.g., close it).',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      sessionSid: z.string().startsWith('KC').describe('Session SID (starts with KC)'),
      status: z.enum(['closed']).optional().describe('Set to "closed" to end the session'),
      ttl: z.number().optional().describe('New TTL in seconds'),
    }),
    async ({ serviceSid, sessionSid, status, ttl }) => {
      const params: Record<string, unknown> = {};
      if (status) params.status = status;
      if (ttl) params.ttl = ttl;

      const session = await client.proxy.v1
        .services(serviceSid)
        .sessions(sessionSid)
        .update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: session.sid,
            status: session.status,
            ttl: session.ttl,
            dateUpdated: session.dateUpdated,
            dateEnded: session.dateEnded,
          }, null, 2),
        }],
      };
    }
  );

  const deleteProxySession = createTool(
    'delete_proxy_session',
    'Delete a Proxy session.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      sessionSid: z.string().startsWith('KC').describe('Session SID (starts with KC)'),
    }),
    async ({ serviceSid, sessionSid }) => {
      await client.proxy.v1
        .services(serviceSid)
        .sessions(sessionSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            serviceSid,
            sessionSid,
          }, null, 2),
        }],
      };
    }
  );

  const listParticipants = createTool(
    'list_proxy_participants',
    'List participants in a Proxy session.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      sessionSid: z.string().startsWith('KC').describe('Session SID (starts with KC)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum participants to return'),
    }),
    async ({ serviceSid, sessionSid, limit }) => {
      const participants = await client.proxy.v1
        .services(serviceSid)
        .sessions(sessionSid)
        .participants.list({ limit });

      const result = participants.map(p => ({
        sid: p.sid,
        identifier: p.identifier,
        proxyIdentifier: p.proxyIdentifier,
        friendlyName: p.friendlyName,
        dateCreated: p.dateCreated,
        dateUpdated: p.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            sessionSid,
            count: result.length,
            participants: result,
          }, null, 2),
        }],
      };
    }
  );

  const removeProxyParticipant = createTool(
    'remove_proxy_participant',
    'Remove a participant from a Proxy session.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      sessionSid: z.string().startsWith('KC').describe('Session SID (starts with KC)'),
      participantSid: z.string().startsWith('KP').describe('Participant SID (starts with KP)'),
    }),
    async ({ serviceSid, sessionSid, participantSid }) => {
      await client.proxy.v1
        .services(serviceSid)
        .sessions(sessionSid)
        .participants(participantSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            serviceSid,
            sessionSid,
            participantSid,
          }, null, 2),
        }],
      };
    }
  );

  const listInteractions = createTool(
    'list_proxy_interactions',
    'List interactions (calls/messages) in a Proxy session.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      sessionSid: z.string().startsWith('KC').describe('Session SID (starts with KC)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum interactions to return'),
    }),
    async ({ serviceSid, sessionSid, limit }) => {
      const interactions = await client.proxy.v1
        .services(serviceSid)
        .sessions(sessionSid)
        .interactions.list({ limit });

      const result = interactions.map(i => ({
        sid: i.sid,
        type: i.type,
        inboundParticipantSid: i.inboundParticipantSid,
        outboundParticipantSid: i.outboundParticipantSid,
        inboundResourceSid: i.inboundResourceSid,
        outboundResourceSid: i.outboundResourceSid,
        inboundResourceStatus: i.inboundResourceStatus,
        outboundResourceStatus: i.outboundResourceStatus,
        dateCreated: i.dateCreated,
        dateUpdated: i.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            sessionSid,
            count: result.length,
            interactions: result,
          }, null, 2),
        }],
      };
    }
  );

  const listProxyPhoneNumbers = createTool(
    'list_proxy_phone_numbers',
    'List phone numbers assigned to a Proxy service.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum numbers to return'),
    }),
    async ({ serviceSid, limit }) => {
      const phoneNumbers = await client.proxy.v1
        .services(serviceSid)
        .phoneNumbers.list({ limit });

      const result = phoneNumbers.map(pn => ({
        sid: pn.sid,
        phoneNumber: pn.phoneNumber,
        friendlyName: pn.friendlyName,
        isoCountry: pn.isoCountry,
        capabilities: pn.capabilities,
        inUse: pn.inUse,
        dateCreated: pn.dateCreated,
        dateUpdated: pn.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            phoneNumbers: result,
          }, null, 2),
        }],
      };
    }
  );

  const addProxyPhoneNumber = createTool(
    'add_proxy_phone_number',
    'Add a phone number to a Proxy service.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      phoneNumberSid: z.string().startsWith('PN').describe('Phone Number SID to add (starts with PN)'),
    }),
    async ({ serviceSid, phoneNumberSid }) => {
      const phoneNumber = await client.proxy.v1
        .services(serviceSid)
        .phoneNumbers.create({ sid: phoneNumberSid });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: phoneNumber.sid,
            serviceSid: phoneNumber.serviceSid,
            phoneNumber: phoneNumber.phoneNumber,
            friendlyName: phoneNumber.friendlyName,
            isoCountry: phoneNumber.isoCountry,
            capabilities: phoneNumber.capabilities,
            dateCreated: phoneNumber.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const removeProxyPhoneNumber = createTool(
    'remove_proxy_phone_number',
    'Remove a phone number from a Proxy service.',
    z.object({
      serviceSid: z.string().startsWith('KS').describe('Proxy Service SID (starts with KS)'),
      phoneNumberSid: z.string().startsWith('PN').describe('Phone Number SID to remove (starts with PN)'),
    }),
    async ({ serviceSid, phoneNumberSid }) => {
      await client.proxy.v1
        .services(serviceSid)
        .phoneNumbers(phoneNumberSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            serviceSid,
            phoneNumberSid,
          }, null, 2),
        }],
      };
    }
  );

  return [
    createProxyService,
    listProxyServices,
    getProxyService,
    updateProxyService,
    deleteProxyService,
    createProxySession,
    listProxySessions,
    getProxySession,
    updateProxySession,
    deleteProxySession,
    addProxyParticipant,
    listParticipants,
    removeProxyParticipant,
    listInteractions,
    listProxyPhoneNumbers,
    addProxyPhoneNumber,
    removeProxyPhoneNumber,
  ];
}
