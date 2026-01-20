// ABOUTME: Twilio Sync tools for real-time state synchronization.
// ABOUTME: Provides create_document, update_document, get_document, and list_documents tools.

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
 * Returns all Sync-related tools configured with the given Twilio context.
 */
export function syncTools(context: TwilioContext) {
  const { client, syncServiceSid } = context;

  const createDocument = createTool(
    'create_document',
    'Create a new Sync document for storing state.',
    z.object({
      uniqueName: z.string().min(1).max(320).describe('Unique identifier for the document'),
      data: z.record(z.any()).describe('JSON data to store in the document'),
      ttl: z.number().min(0).optional().describe('Time-to-live in seconds (0 = no expiry)'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ uniqueName, data, ttl, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const createParams: { uniqueName: string; data: object; ttl?: number } = { uniqueName, data };
      if (ttl !== undefined) createParams.ttl = ttl;

      const document = await client.sync.v1.services(sid).documents.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: document.sid,
            uniqueName: document.uniqueName,
            data: document.data,
            dateCreated: document.dateCreated,
            dateExpires: document.dateExpires,
          }, null, 2),
        }],
      };
    }
  );

  const updateDocument = createTool(
    'update_document',
    'Update an existing Sync document.',
    z.object({
      documentSidOrName: z.string().describe('Document SID (ETxxx) or unique name'),
      data: z.record(z.any()).describe('New JSON data for the document'),
      ttl: z.number().min(0).optional().describe('New TTL in seconds'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ documentSidOrName, data, ttl, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const updateParams: { data: object; ttl?: number } = { data };
      if (ttl !== undefined) updateParams.ttl = ttl;

      const document = await client.sync.v1
        .services(sid)
        .documents(documentSidOrName)
        .update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: document.sid,
            uniqueName: document.uniqueName,
            data: document.data,
            revision: document.revision,
            dateUpdated: document.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const getDocument = createTool(
    'get_document',
    'Retrieve a Sync document by SID or unique name.',
    z.object({
      documentSidOrName: z.string().describe('Document SID (ETxxx) or unique name'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ documentSidOrName, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const document = await client.sync.v1
        .services(sid)
        .documents(documentSidOrName)
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: document.sid,
            uniqueName: document.uniqueName,
            data: document.data,
            revision: document.revision,
            dateCreated: document.dateCreated,
            dateUpdated: document.dateUpdated,
            dateExpires: document.dateExpires,
          }, null, 2),
        }],
      };
    }
  );

  const listDocuments = createTool(
    'list_documents',
    'List all Sync documents in the service.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ limit, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const documents = await client.sync.v1.services(sid).documents.list({ limit: limit || 20 });

      const formattedDocs = documents.map((d) => ({
        sid: d.sid,
        uniqueName: d.uniqueName,
        revision: d.revision,
        dateCreated: d.dateCreated,
        dateUpdated: d.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedDocs.length, documents: formattedDocs }, null, 2),
        }],
      };
    }
  );

  return [createDocument, updateDocument, getDocument, listDocuments];
}
