// ABOUTME: Twilio Notify tools for push notification services.
// ABOUTME: Provides service, binding, and notification management.

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
 * Returns all Notify-related tools configured with the given Twilio context.
 */
export function notifyTools(context: TwilioContext) {
  const { client } = context;

  // ============ Notify Services ============

  const listNotifyServices = createTool(
    'list_notify_services',
    'List Notify services in the account.',
    z.object({
      friendlyName: z.string().optional().describe('Filter by friendly name'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum services to return'),
    }),
    async ({ friendlyName, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (friendlyName) {params.friendlyName = friendlyName;}

      const services = await client.notify.v1.services.list(params);

      const result = services.map(s => ({
        sid: s.sid,
        friendlyName: s.friendlyName,
        apnCredentialSid: s.apnCredentialSid,
        gcmCredentialSid: s.gcmCredentialSid,
        fcmCredentialSid: s.fcmCredentialSid,
        messagingServiceSid: s.messagingServiceSid,
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

  const getNotifyService = createTool(
    'get_notify_service',
    'Get details of a specific Notify service.',
    z.object({
      serviceSid: z.string().startsWith('IS').describe('Notify Service SID (starts with IS)'),
    }),
    async ({ serviceSid }) => {
      const service = await client.notify.v1.services(serviceSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            friendlyName: service.friendlyName,
            apnCredentialSid: service.apnCredentialSid,
            gcmCredentialSid: service.gcmCredentialSid,
            fcmCredentialSid: service.fcmCredentialSid,
            messagingServiceSid: service.messagingServiceSid,
            facebookMessengerPageId: service.facebookMessengerPageId,
            defaultApnNotificationProtocolVersion: service.defaultApnNotificationProtocolVersion,
            defaultGcmNotificationProtocolVersion: service.defaultGcmNotificationProtocolVersion,
            defaultFcmNotificationProtocolVersion: service.defaultFcmNotificationProtocolVersion,
            logEnabled: service.logEnabled,
            dateCreated: service.dateCreated,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createNotifyService = createTool(
    'create_notify_service',
    'Create a new Notify service.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the service'),
      apnCredentialSid: z.string().startsWith('CR').optional().describe('APN Credential SID for iOS'),
      fcmCredentialSid: z.string().startsWith('CR').optional().describe('FCM Credential SID for Android'),
      messagingServiceSid: z.string().startsWith('MG').optional().describe('Messaging Service for SMS fallback'),
      logEnabled: z.boolean().default(false).describe('Enable logging'),
    }),
    async ({ friendlyName, apnCredentialSid, fcmCredentialSid, messagingServiceSid, logEnabled }) => {
      const service = await client.notify.v1.services.create({
        friendlyName,
        logEnabled,
        ...(apnCredentialSid && { apnCredentialSid }),
        ...(fcmCredentialSid && { fcmCredentialSid }),
        ...(messagingServiceSid && { messagingServiceSid }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            friendlyName: service.friendlyName,
            apnCredentialSid: service.apnCredentialSid,
            fcmCredentialSid: service.fcmCredentialSid,
            messagingServiceSid: service.messagingServiceSid,
            logEnabled: service.logEnabled,
            dateCreated: service.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateNotifyService = createTool(
    'update_notify_service',
    'Update a Notify service.',
    z.object({
      serviceSid: z.string().startsWith('IS').describe('Notify Service SID (starts with IS)'),
      friendlyName: z.string().optional().describe('New friendly name'),
      apnCredentialSid: z.string().startsWith('CR').optional().describe('New APN Credential SID'),
      fcmCredentialSid: z.string().startsWith('CR').optional().describe('New FCM Credential SID'),
      messagingServiceSid: z.string().startsWith('MG').optional().describe('New Messaging Service SID'),
      logEnabled: z.boolean().optional().describe('Enable/disable logging'),
    }),
    async ({ serviceSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {params[key] = value;}
      });

      const service = await client.notify.v1.services(serviceSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            friendlyName: service.friendlyName,
            logEnabled: service.logEnabled,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteNotifyService = createTool(
    'delete_notify_service',
    'Delete a Notify service.',
    z.object({
      serviceSid: z.string().startsWith('IS').describe('Notify Service SID (starts with IS)'),
    }),
    async ({ serviceSid }) => {
      await client.notify.v1.services(serviceSid).remove();

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

  // ============ Bindings ============

  const listBindings = createTool(
    'list_notify_bindings',
    'List bindings (device registrations) for a Notify service.',
    z.object({
      serviceSid: z.string().startsWith('IS').describe('Notify Service SID (starts with IS)'),
      identity: z.string().optional().describe('Filter by user identity'),
      bindingType: z.enum(['apn', 'gcm', 'fcm', 'sms', 'facebook-messenger', 'alexa']).optional().describe('Filter by binding type'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum bindings to return'),
    }),
    async ({ serviceSid, identity, bindingType, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (identity) {params.identity = identity;}
      if (bindingType) {params.bindingType = bindingType;}

      const bindings = await client.notify.v1.services(serviceSid).bindings.list(params);

      const result = bindings.map(b => ({
        sid: b.sid,
        identity: b.identity,
        bindingType: b.bindingType,
        address: b.address,
        tags: b.tags,
        notificationProtocolVersion: b.notificationProtocolVersion,
        dateCreated: b.dateCreated,
        dateUpdated: b.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            bindings: result,
          }, null, 2),
        }],
      };
    }
  );

  const getBinding = createTool(
    'get_notify_binding',
    'Get details of a specific binding.',
    z.object({
      serviceSid: z.string().startsWith('IS').describe('Notify Service SID (starts with IS)'),
      bindingSid: z.string().startsWith('BS').describe('Binding SID (starts with BS)'),
    }),
    async ({ serviceSid, bindingSid }) => {
      const binding = await client.notify.v1.services(serviceSid).bindings(bindingSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: binding.sid,
            identity: binding.identity,
            bindingType: binding.bindingType,
            address: binding.address,
            tags: binding.tags,
            notificationProtocolVersion: binding.notificationProtocolVersion,
            credentialSid: binding.credentialSid,
            dateCreated: binding.dateCreated,
            dateUpdated: binding.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createBinding = createTool(
    'create_notify_binding',
    'Create a device binding for push notifications.',
    z.object({
      serviceSid: z.string().startsWith('IS').describe('Notify Service SID (starts with IS)'),
      identity: z.string().describe('User identity (e.g., user ID, username)'),
      bindingType: z.enum(['apn', 'gcm', 'fcm', 'sms', 'facebook-messenger', 'alexa']).describe('Type of binding'),
      address: z.string().describe('Device token, phone number, or messenger ID'),
      tags: z.array(z.string()).optional().describe('Tags for segmented notifications'),
      credentialSid: z.string().startsWith('CR').optional().describe('Credential SID for this binding'),
    }),
    async ({ serviceSid, identity, bindingType, address, tags, credentialSid }) => {
      const binding = await client.notify.v1.services(serviceSid).bindings.create({
        identity,
        bindingType,
        address,
        ...(tags && { tag: tags }),
        ...(credentialSid && { credentialSid }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: binding.sid,
            identity: binding.identity,
            bindingType: binding.bindingType,
            address: binding.address,
            tags: binding.tags,
            dateCreated: binding.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteBinding = createTool(
    'delete_notify_binding',
    'Delete a device binding.',
    z.object({
      serviceSid: z.string().startsWith('IS').describe('Notify Service SID (starts with IS)'),
      bindingSid: z.string().startsWith('BS').describe('Binding SID (starts with BS)'),
    }),
    async ({ serviceSid, bindingSid }) => {
      await client.notify.v1.services(serviceSid).bindings(bindingSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            serviceSid,
            bindingSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Notifications ============

  const sendNotification = createTool(
    'send_notification',
    'Send a push notification via a Notify service.',
    z.object({
      serviceSid: z.string().startsWith('IS').describe('Notify Service SID (starts with IS)'),
      identity: z.array(z.string()).optional().describe('User identities to notify'),
      tag: z.array(z.string()).optional().describe('Tags to filter recipients'),
      body: z.string().describe('Notification message body'),
      title: z.string().optional().describe('Notification title'),
      sound: z.string().optional().describe('Sound file to play'),
      data: z.record(z.unknown()).optional().describe('Custom data payload'),
      priority: z.enum(['high', 'low']).optional().describe('Notification priority'),
      ttl: z.number().optional().describe('Time-to-live in seconds'),
    }),
    async ({ serviceSid, identity, tag, body, title, sound, data, priority, ttl }) => {
      const notification = await client.notify.v1.services(serviceSid).notifications.create({
        body,
        ...(identity && { identity }),
        ...(tag && { tag }),
        ...(title && { title }),
        ...(sound && { sound }),
        ...(data && { data }),
        ...(priority && { priority }),
        ...(ttl && { ttl }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: notification.sid,
            body: notification.body,
            priority: notification.priority,
            ttl: notification.ttl,
            identities: notification.identities,
            tags: notification.tags,
            dateCreated: notification.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listNotifyServices,
    getNotifyService,
    createNotifyService,
    updateNotifyService,
    deleteNotifyService,
    listBindings,
    getBinding,
    createBinding,
    deleteBinding,
    sendNotification,
  ];
}
