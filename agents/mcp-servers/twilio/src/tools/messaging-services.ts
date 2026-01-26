// ABOUTME: Twilio Messaging Services tools for sender pools and A2P compliance.
// ABOUTME: Provides comprehensive service, phone number, alpha sender, and short code management.

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
 * Returns all Messaging Services-related tools configured with the given Twilio context.
 */
export function messagingServicesTools(context: TwilioContext) {
  const { client } = context;

  const createMessagingService = createTool(
    'create_messaging_service',
    'Create a new Messaging Service for sender pools and A2P compliance.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the messaging service'),
      inboundRequestUrl: z.string().url().optional().describe('Webhook URL for incoming messages'),
      inboundMethod: z.enum(['GET', 'POST']).default('POST').describe('HTTP method for inbound webhook'),
      fallbackUrl: z.string().url().optional().describe('Fallback URL if primary webhook fails'),
      statusCallback: z.string().url().optional().describe('Webhook URL for delivery status updates'),
      stickySender: z.boolean().default(true).describe('Use same sender for conversations'),
      useInboundWebhookOnNumber: z.boolean().default(false).describe('Use number-level webhooks instead'),
    }),
    async ({ friendlyName, inboundRequestUrl, inboundMethod, fallbackUrl, statusCallback, stickySender, useInboundWebhookOnNumber }) => {
      const serviceParams: {
        friendlyName: string;
        stickySender?: boolean;
        useInboundWebhookOnNumber?: boolean;
        inboundRequestUrl?: string;
        inboundMethod?: string;
        fallbackUrl?: string;
        statusCallback?: string;
      } = {
        friendlyName,
        stickySender,
        useInboundWebhookOnNumber,
      };

      if (inboundRequestUrl) {
        serviceParams.inboundRequestUrl = inboundRequestUrl;
        serviceParams.inboundMethod = inboundMethod;
      }
      if (fallbackUrl) {
        serviceParams.fallbackUrl = fallbackUrl;
      }
      if (statusCallback) {
        serviceParams.statusCallback = statusCallback;
      }

      const service = await client.messaging.v1.services.create(serviceParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            friendlyName: service.friendlyName,
            stickySender: service.stickySender,
            useInboundWebhookOnNumber: service.useInboundWebhookOnNumber,
            inboundRequestUrl: service.inboundRequestUrl,
            inboundMethod: service.inboundMethod,
            fallbackUrl: service.fallbackUrl,
            statusCallback: service.statusCallback,
            dateCreated: service.dateCreated,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const addNumberToService = createTool(
    'add_number_to_service',
    'Add a phone number to a Messaging Service sender pool.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      phoneNumberSid: z.string().startsWith('PN').describe('Phone Number SID to add (starts with PN)'),
    }),
    async ({ serviceSid, phoneNumberSid }) => {
      const phoneNumber = await client.messaging.v1
        .services(serviceSid)
        .phoneNumbers.create({ phoneNumberSid });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: phoneNumber.sid,
            serviceSid: phoneNumber.serviceSid,
            phoneNumber: phoneNumber.phoneNumber,
            countryCode: phoneNumber.countryCode,
            capabilities: phoneNumber.capabilities,
            dateCreated: phoneNumber.dateCreated,
            dateUpdated: phoneNumber.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const getA2pStatus = createTool(
    'get_a2p_status',
    'Get A2P 10DLC registration status and available use cases for a Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
    }),
    async ({ serviceSid }) => {
      // Fetch the service details
      const service = await client.messaging.v1.services(serviceSid).fetch();

      // Fetch US App-to-Person registrations if any
      let usAppToPersonUseCases: unknown[] = [];
      try {
        const useCases = await client.messaging.v1
          .services(serviceSid)
          .usAppToPerson.list({ limit: 20 });

        usAppToPersonUseCases = useCases.map(useCase => ({
          sid: useCase.sid,
          brandRegistrationSid: useCase.brandRegistrationSid,
          messagingServiceSid: useCase.messagingServiceSid,
          description: useCase.description,
          messageFlow: useCase.messageFlow,
          messageSamples: useCase.messageSamples,
          usAppToPersonUsecase: useCase.usAppToPersonUsecase,
          hasEmbeddedLinks: useCase.hasEmbeddedLinks,
          hasEmbeddedPhone: useCase.hasEmbeddedPhone,
          campaignStatus: useCase.campaignStatus,
          dateCreated: useCase.dateCreated,
          dateUpdated: useCase.dateUpdated,
        }));
      } catch {
        // No A2P registrations or not available
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid: service.sid,
            friendlyName: service.friendlyName,
            a2pRegistrations: usAppToPersonUseCases,
            a2pRegistrationCount: usAppToPersonUseCases.length,
          }, null, 2),
        }],
      };
    }
  );

  const listMessagingServices = createTool(
    'list_messaging_services',
    'List all Messaging Services in the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum services to return'),
    }),
    async ({ limit }) => {
      const services = await client.messaging.v1.services.list({ limit });

      const result = services.map(s => ({
        sid: s.sid,
        friendlyName: s.friendlyName,
        stickySender: s.stickySender,
        useInboundWebhookOnNumber: s.useInboundWebhookOnNumber,
        inboundRequestUrl: s.inboundRequestUrl,
        statusCallback: s.statusCallback,
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

  const getMessagingService = createTool(
    'get_messaging_service',
    'Get details of a specific Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
    }),
    async ({ serviceSid }) => {
      const service = await client.messaging.v1.services(serviceSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            friendlyName: service.friendlyName,
            stickySender: service.stickySender,
            mmsConverter: service.mmsConverter,
            smartEncoding: service.smartEncoding,
            fallbackToLongCode: service.fallbackToLongCode,
            areaCodeGeomatch: service.areaCodeGeomatch,
            validityPeriod: service.validityPeriod,
            synchronousValidation: service.synchronousValidation,
            useInboundWebhookOnNumber: service.useInboundWebhookOnNumber,
            inboundRequestUrl: service.inboundRequestUrl,
            inboundMethod: service.inboundMethod,
            fallbackUrl: service.fallbackUrl,
            fallbackMethod: service.fallbackMethod,
            statusCallback: service.statusCallback,
            dateCreated: service.dateCreated,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateMessagingService = createTool(
    'update_messaging_service',
    'Update a Messaging Service configuration.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      inboundRequestUrl: z.string().url().optional().describe('New inbound webhook URL'),
      inboundMethod: z.enum(['GET', 'POST']).optional().describe('HTTP method for inbound webhook'),
      fallbackUrl: z.string().url().optional().describe('New fallback URL'),
      statusCallback: z.string().url().optional().describe('New status callback URL'),
      stickySender: z.boolean().optional().describe('Enable sticky sender'),
      smartEncoding: z.boolean().optional().describe('Enable smart encoding'),
      mmsConverter: z.boolean().optional().describe('Enable MMS to SMS conversion'),
      fallbackToLongCode: z.boolean().optional().describe('Fall back to long code if short code fails'),
    }),
    async ({ serviceSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) params[key] = value;
      });

      const service = await client.messaging.v1.services(serviceSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            friendlyName: service.friendlyName,
            stickySender: service.stickySender,
            inboundRequestUrl: service.inboundRequestUrl,
            statusCallback: service.statusCallback,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteMessagingService = createTool(
    'delete_messaging_service',
    'Delete a Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
    }),
    async ({ serviceSid }) => {
      await client.messaging.v1.services(serviceSid).remove();

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

  const listPhoneNumbersInService = createTool(
    'list_phone_numbers_in_service',
    'List phone numbers in a Messaging Service sender pool.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum numbers to return'),
    }),
    async ({ serviceSid, limit }) => {
      const phoneNumbers = await client.messaging.v1
        .services(serviceSid)
        .phoneNumbers.list({ limit });

      const result = phoneNumbers.map(pn => ({
        sid: pn.sid,
        phoneNumber: pn.phoneNumber,
        countryCode: pn.countryCode,
        capabilities: pn.capabilities,
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

  const removeNumberFromService = createTool(
    'remove_number_from_service',
    'Remove a phone number from a Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      phoneNumberSid: z.string().startsWith('PN').describe('Phone Number SID to remove (starts with PN)'),
    }),
    async ({ serviceSid, phoneNumberSid }) => {
      await client.messaging.v1
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

  const listAlphaSenders = createTool(
    'list_alpha_senders',
    'List alpha sender IDs in a Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum senders to return'),
    }),
    async ({ serviceSid, limit }) => {
      const alphaSenders = await client.messaging.v1
        .services(serviceSid)
        .alphaSenders.list({ limit });

      const result = alphaSenders.map(a => ({
        sid: a.sid,
        alphaSender: a.alphaSender,
        capabilities: a.capabilities,
        dateCreated: a.dateCreated,
        dateUpdated: a.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            alphaSenders: result,
          }, null, 2),
        }],
      };
    }
  );

  const addAlphaSender = createTool(
    'add_alpha_sender',
    'Add an alpha sender ID to a Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      alphaSender: z.string().min(1).max(11).describe('Alpha sender ID (1-11 alphanumeric characters)'),
    }),
    async ({ serviceSid, alphaSender }) => {
      const sender = await client.messaging.v1
        .services(serviceSid)
        .alphaSenders.create({ alphaSender });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: sender.sid,
            serviceSid: sender.serviceSid,
            alphaSender: sender.alphaSender,
            capabilities: sender.capabilities,
            dateCreated: sender.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const removeAlphaSender = createTool(
    'remove_alpha_sender',
    'Remove an alpha sender ID from a Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      alphaSenderSid: z.string().startsWith('AI').describe('Alpha Sender SID to remove (starts with AI)'),
    }),
    async ({ serviceSid, alphaSenderSid }) => {
      await client.messaging.v1
        .services(serviceSid)
        .alphaSenders(alphaSenderSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            removed: true,
            serviceSid,
            alphaSenderSid,
          }, null, 2),
        }],
      };
    }
  );

  const listShortCodes = createTool(
    'list_short_codes',
    'List short codes in a Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum short codes to return'),
    }),
    async ({ serviceSid, limit }) => {
      const shortCodes = await client.messaging.v1
        .services(serviceSid)
        .shortCodes.list({ limit });

      const result = shortCodes.map(sc => ({
        sid: sc.sid,
        shortCode: sc.shortCode,
        countryCode: sc.countryCode,
        capabilities: sc.capabilities,
        dateCreated: sc.dateCreated,
        dateUpdated: sc.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            shortCodes: result,
          }, null, 2),
        }],
      };
    }
  );

  const addShortCode = createTool(
    'add_short_code',
    'Add a short code to a Messaging Service.',
    z.object({
      serviceSid: z.string().startsWith('MG').describe('Messaging Service SID (starts with MG)'),
      shortCodeSid: z.string().startsWith('SC').describe('Short Code SID to add (starts with SC)'),
    }),
    async ({ serviceSid, shortCodeSid }) => {
      const shortCode = await client.messaging.v1
        .services(serviceSid)
        .shortCodes.create({ shortCodeSid });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: shortCode.sid,
            serviceSid: shortCode.serviceSid,
            shortCode: shortCode.shortCode,
            countryCode: shortCode.countryCode,
            capabilities: shortCode.capabilities,
            dateCreated: shortCode.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  return [
    createMessagingService,
    listMessagingServices,
    getMessagingService,
    updateMessagingService,
    deleteMessagingService,
    addNumberToService,
    listPhoneNumbersInService,
    removeNumberFromService,
    listAlphaSenders,
    addAlphaSender,
    removeAlphaSender,
    listShortCodes,
    addShortCode,
    getA2pStatus,
  ];
}
