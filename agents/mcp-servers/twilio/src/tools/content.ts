// ABOUTME: Twilio Content API tools for message templates.
// ABOUTME: Provides comprehensive template management and approval workflow tools.

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
 * Returns all Content-related tools configured with the given Twilio context.
 */
export function contentTools(context: TwilioContext) {
  const { client } = context;

  const createContentTemplate = createTool(
    'create_content_template',
    'Create a content template for structured messaging (WhatsApp, SMS).',
    z.object({
      friendlyName: z.string().describe('Friendly name for the template'),
      contentType: z.enum([
        'twilio/text',
        'twilio/media',
        'twilio/quick-reply',
        'twilio/call-to-action',
        'twilio/card',
        'twilio/list-picker',
      ]).describe('Type of content template'),
      body: z.string().optional().describe('Message body text (for text type)'),
      variables: z.record(z.string()).optional().describe('Template variables (key: description)'),
    }),
    async ({ friendlyName, contentType, body, variables }) => {
      // Build types object based on contentType
      const types: Record<string, unknown> = {};

      if (contentType === 'twilio/text') {
        types['twilio/text'] = { body: body || '' };
      } else if (contentType === 'twilio/media') {
        types['twilio/media'] = { body: body || '' };
      } else if (contentType === 'twilio/quick-reply') {
        types['twilio/quick-reply'] = { body: body || '', actions: [] };
      } else if (contentType === 'twilio/call-to-action') {
        types['twilio/call-to-action'] = { body: body || '', actions: [] };
      } else if (contentType === 'twilio/card') {
        types['twilio/card'] = { title: friendlyName, body: body || '' };
      } else if (contentType === 'twilio/list-picker') {
        types['twilio/list-picker'] = { body: body || '', items: [] };
      }

      const contentParams = {
        friendlyName,
        language: 'en',
        types,
        variables: variables || {},
      };

      const content = await client.content.v1.contents.create(contentParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: content.sid,
            friendlyName: content.friendlyName,
            types: content.types,
            variables: content.variables,
            dateCreated: content.dateCreated,
            dateUpdated: content.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listContentTemplates = createTool(
    'list_content_templates',
    'List content templates in the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum templates to return'),
    }),
    async ({ limit }) => {
      const contents = await client.content.v1.contents.list({ limit });

      const result = contents.map(c => ({
        sid: c.sid,
        friendlyName: c.friendlyName,
        types: c.types,
        variables: c.variables,
        dateCreated: c.dateCreated,
        dateUpdated: c.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            templates: result,
          }, null, 2),
        }],
      };
    }
  );

  const getContentTemplate = createTool(
    'get_content_template',
    'Get details of a specific content template.',
    z.object({
      contentSid: z.string().startsWith('HX').describe('Content SID (starts with HX)'),
    }),
    async ({ contentSid }) => {
      const content = await client.content.v1.contents(contentSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: content.sid,
            friendlyName: content.friendlyName,
            types: content.types,
            variables: content.variables,
            dateCreated: content.dateCreated,
            dateUpdated: content.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteContentTemplate = createTool(
    'delete_content_template',
    'Delete a content template.',
    z.object({
      contentSid: z.string().startsWith('HX').describe('Content SID (starts with HX)'),
    }),
    async ({ contentSid }) => {
      await client.content.v1.contents(contentSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            contentSid,
          }, null, 2),
        }],
      };
    }
  );

  return [
    createContentTemplate,
    listContentTemplates,
    getContentTemplate,
    deleteContentTemplate,
  ];
}
