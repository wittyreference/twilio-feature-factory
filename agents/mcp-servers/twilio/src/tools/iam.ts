// ABOUTME: Twilio IAM tools for API key management.
// ABOUTME: Provides API key CRUD operations for programmatic access.

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
 * Returns all IAM-related tools configured with the given Twilio context.
 */
export function iamTools(context: TwilioContext) {
  const { client } = context;

  // ============ API Keys ============

  const listApiKeys = createTool(
    'list_api_keys',
    'List API keys for the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum keys to return'),
    }),
    async ({ limit }) => {
      const keys = await client.keys.list({ limit });

      const result = keys.map(k => ({
        sid: k.sid,
        friendlyName: k.friendlyName,
        dateCreated: k.dateCreated,
        dateUpdated: k.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            apiKeys: result,
          }, null, 2),
        }],
      };
    }
  );

  const getApiKey = createTool(
    'get_api_key',
    'Get details of a specific API key.',
    z.object({
      keySid: z.string().startsWith('SK').describe('API Key SID (starts with SK)'),
    }),
    async ({ keySid }) => {
      const key = await client.keys(keySid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: key.sid,
            friendlyName: key.friendlyName,
            dateCreated: key.dateCreated,
            dateUpdated: key.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const createApiKey = createTool(
    'create_api_key',
    'Create a new API key. IMPORTANT: The secret is only shown once at creation.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the API key'),
    }),
    async ({ friendlyName }) => {
      const key = await client.newKeys.create({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: key.sid,
            friendlyName: key.friendlyName,
            secret: key.secret,
            dateCreated: key.dateCreated,
            warning: 'SAVE THE SECRET NOW - it cannot be retrieved later!',
          }, null, 2),
        }],
      };
    }
  );

  const updateApiKey = createTool(
    'update_api_key',
    'Update an API key friendly name.',
    z.object({
      keySid: z.string().startsWith('SK').describe('API Key SID (starts with SK)'),
      friendlyName: z.string().describe('New friendly name'),
    }),
    async ({ keySid, friendlyName }) => {
      const key = await client.keys(keySid).update({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: key.sid,
            friendlyName: key.friendlyName,
            dateUpdated: key.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteApiKey = createTool(
    'delete_api_key',
    'Delete an API key. This action is irreversible.',
    z.object({
      keySid: z.string().startsWith('SK').describe('API Key SID (starts with SK)'),
    }),
    async ({ keySid }) => {
      await client.keys(keySid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            keySid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Signing Keys (for Access Tokens) ============

  const listSigningKeys = createTool(
    'list_signing_keys',
    'List signing keys for generating Access Tokens.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum keys to return'),
    }),
    async ({ limit }) => {
      const keys = await client.signingKeys.list({ limit });

      const result = keys.map(k => ({
        sid: k.sid,
        friendlyName: k.friendlyName,
        dateCreated: k.dateCreated,
        dateUpdated: k.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            signingKeys: result,
          }, null, 2),
        }],
      };
    }
  );

  const createSigningKey = createTool(
    'create_signing_key',
    'Create a new signing key for Access Tokens. IMPORTANT: The secret is only shown once.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the signing key'),
    }),
    async ({ friendlyName }) => {
      const key = await client.newSigningKeys.create({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: key.sid,
            friendlyName: key.friendlyName,
            secret: key.secret,
            dateCreated: key.dateCreated,
            warning: 'SAVE THE SECRET NOW - it cannot be retrieved later!',
          }, null, 2),
        }],
      };
    }
  );

  const deleteSigningKey = createTool(
    'delete_signing_key',
    'Delete a signing key.',
    z.object({
      keySid: z.string().startsWith('SK').describe('Signing Key SID (starts with SK)'),
    }),
    async ({ keySid }) => {
      await client.signingKeys(keySid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            keySid,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listApiKeys,
    getApiKey,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    listSigningKeys,
    createSigningKey,
    deleteSigningKey,
  ];
}
