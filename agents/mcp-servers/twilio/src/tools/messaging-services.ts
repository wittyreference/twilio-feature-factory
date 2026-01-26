// ABOUTME: Twilio Messaging Services tools for sender pools and A2P compliance.
// ABOUTME: Provides create_messaging_service, add_number_to_service, and get_a2p_status tools.

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

  return [createMessagingService, addNumberToService, getA2pStatus];
}
