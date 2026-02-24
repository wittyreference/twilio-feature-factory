// ABOUTME: Twilio Sync tools for real-time state synchronization.
// ABOUTME: Provides tools for Documents, Lists, and Maps (16 tools total).

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

  // ============================================
  // Sync Document Tools
  // ============================================

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
      if (ttl !== undefined) {createParams.ttl = ttl;}

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
      if (ttl !== undefined) {updateParams.ttl = ttl;}

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

  // ============================================
  // Sync List Tools
  // ============================================

  const createSyncList = createTool(
    'create_sync_list',
    'Create a new Sync List for ordered data storage.',
    z.object({
      uniqueName: z.string().min(1).max(320).optional().describe('Unique identifier for the list'),
      ttl: z.number().min(0).optional().describe('Time-to-live in seconds (0 = no expiry)'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ uniqueName, ttl, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const createParams: { uniqueName?: string; ttl?: number } = {};
      if (uniqueName !== undefined) {createParams.uniqueName = uniqueName;}
      if (ttl !== undefined) {createParams.ttl = ttl;}

      const list = await client.sync.v1.services(sid).syncLists.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: list.sid,
            uniqueName: list.uniqueName,
            dateCreated: list.dateCreated,
            dateExpires: list.dateExpires,
          }, null, 2),
        }],
      };
    }
  );

  const listSyncLists = createTool(
    'list_sync_lists',
    'List all Sync Lists in the service.',
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

      const lists = await client.sync.v1.services(sid).syncLists.list({ limit: limit || 20 });

      const formattedLists = lists.map((l) => ({
        sid: l.sid,
        uniqueName: l.uniqueName,
        dateCreated: l.dateCreated,
        dateUpdated: l.dateUpdated,
        dateExpires: l.dateExpires,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedLists.length, lists: formattedLists }, null, 2),
        }],
      };
    }
  );

  const addSyncListItem = createTool(
    'add_sync_list_item',
    'Append an entry to a Sync List.',
    z.object({
      listSidOrName: z.string().describe('List SID (ESxxx) or unique name'),
      data: z.record(z.any()).describe('JSON data for the list item'),
      ttl: z.number().min(0).optional().describe('Time-to-live in seconds for this item'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ listSidOrName, data, ttl, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const createParams: { data: object; ttl?: number } = { data };
      if (ttl !== undefined) {createParams.ttl = ttl;}

      const item = await client.sync.v1
        .services(sid)
        .syncLists(listSidOrName)
        .syncListItems.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            index: item.index,
            data: item.data,
            dateCreated: item.dateCreated,
            dateExpires: item.dateExpires,
          }, null, 2),
        }],
      };
    }
  );

  const listSyncListItems = createTool(
    'list_sync_list_items',
    'List entries in a Sync List.',
    z.object({
      listSidOrName: z.string().describe('List SID (ESxxx) or unique name'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      order: z.enum(['asc', 'desc']).optional().describe('Sort order by index'),
      from: z.number().optional().describe('Index to start reading from'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ listSidOrName, limit, order, from, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const listParams: { limit: number; order?: 'asc' | 'desc'; from?: string; bounds?: 'inclusive' } = {
        limit: limit || 20,
      };
      if (order !== undefined) {listParams.order = order;}
      if (from !== undefined) {
        listParams.from = String(from);
        listParams.bounds = 'inclusive';
      }

      const items = await client.sync.v1
        .services(sid)
        .syncLists(listSidOrName)
        .syncListItems.list(listParams);

      const formattedItems = items.map((i) => ({
        index: i.index,
        data: i.data,
        dateCreated: i.dateCreated,
        dateUpdated: i.dateUpdated,
        dateExpires: i.dateExpires,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedItems.length, items: formattedItems }, null, 2),
        }],
      };
    }
  );

  const updateSyncListItem = createTool(
    'update_sync_list_item',
    'Update a specific entry in a Sync List by index.',
    z.object({
      listSidOrName: z.string().describe('List SID (ESxxx) or unique name'),
      index: z.number().describe('The item index to update'),
      data: z.record(z.any()).describe('New JSON data for the item'),
      ttl: z.number().min(0).optional().describe('New TTL in seconds'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ listSidOrName, index, data, ttl, serviceSid }) => {
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
      if (ttl !== undefined) {updateParams.ttl = ttl;}

      const item = await client.sync.v1
        .services(sid)
        .syncLists(listSidOrName)
        .syncListItems(index)
        .update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            index: item.index,
            data: item.data,
            dateUpdated: item.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const removeSyncListItem = createTool(
    'remove_sync_list_item',
    'Delete a specific entry from a Sync List by index.',
    z.object({
      listSidOrName: z.string().describe('List SID (ESxxx) or unique name'),
      index: z.number().describe('The item index to delete'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ listSidOrName, index, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      await client.sync.v1
        .services(sid)
        .syncLists(listSidOrName)
        .syncListItems(index)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, message: `List item at index ${index} removed` }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // Sync Map Tools
  // ============================================

  const createSyncMap = createTool(
    'create_sync_map',
    'Create a new Sync Map for key-value data storage.',
    z.object({
      uniqueName: z.string().min(1).max(320).optional().describe('Unique identifier for the map'),
      ttl: z.number().min(0).optional().describe('Time-to-live in seconds (0 = no expiry)'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ uniqueName, ttl, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const createParams: { uniqueName?: string; ttl?: number } = {};
      if (uniqueName !== undefined) {createParams.uniqueName = uniqueName;}
      if (ttl !== undefined) {createParams.ttl = ttl;}

      const map = await client.sync.v1.services(sid).syncMaps.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: map.sid,
            uniqueName: map.uniqueName,
            dateCreated: map.dateCreated,
            dateExpires: map.dateExpires,
          }, null, 2),
        }],
      };
    }
  );

  const listSyncMaps = createTool(
    'list_sync_maps',
    'List all Sync Maps in the service.',
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

      const maps = await client.sync.v1.services(sid).syncMaps.list({ limit: limit || 20 });

      const formattedMaps = maps.map((m) => ({
        sid: m.sid,
        uniqueName: m.uniqueName,
        dateCreated: m.dateCreated,
        dateUpdated: m.dateUpdated,
        dateExpires: m.dateExpires,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedMaps.length, maps: formattedMaps }, null, 2),
        }],
      };
    }
  );

  const addSyncMapItem = createTool(
    'add_sync_map_item',
    'Set a key-value pair in a Sync Map.',
    z.object({
      mapSidOrName: z.string().describe('Map SID (MPxxx) or unique name'),
      key: z.string().min(1).max(320).describe('Unique key for the map item (max 320 chars)'),
      data: z.record(z.any()).describe('JSON data for the map item'),
      ttl: z.number().min(0).optional().describe('Time-to-live in seconds for this item'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ mapSidOrName, key, data, ttl, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const createParams: { key: string; data: object; ttl?: number } = { key, data };
      if (ttl !== undefined) {createParams.ttl = ttl;}

      const item = await client.sync.v1
        .services(sid)
        .syncMaps(mapSidOrName)
        .syncMapItems.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            key: item.key,
            data: item.data,
            dateCreated: item.dateCreated,
            dateExpires: item.dateExpires,
          }, null, 2),
        }],
      };
    }
  );

  const getSyncMapItem = createTool(
    'get_sync_map_item',
    'Look up a specific key-value pair in a Sync Map.',
    z.object({
      mapSidOrName: z.string().describe('Map SID (MPxxx) or unique name'),
      key: z.string().describe('The key to look up'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ mapSidOrName, key, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      const item = await client.sync.v1
        .services(sid)
        .syncMaps(mapSidOrName)
        .syncMapItems(key)
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            key: item.key,
            data: item.data,
            dateCreated: item.dateCreated,
            dateUpdated: item.dateUpdated,
            dateExpires: item.dateExpires,
          }, null, 2),
        }],
      };
    }
  );

  const updateSyncMapItem = createTool(
    'update_sync_map_item',
    'Update a specific key-value pair in a Sync Map.',
    z.object({
      mapSidOrName: z.string().describe('Map SID (MPxxx) or unique name'),
      key: z.string().describe('The key to update'),
      data: z.record(z.any()).describe('New JSON data for the map item'),
      ttl: z.number().min(0).optional().describe('New TTL in seconds'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ mapSidOrName, key, data, ttl, serviceSid }) => {
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
      if (ttl !== undefined) {updateParams.ttl = ttl;}

      const item = await client.sync.v1
        .services(sid)
        .syncMaps(mapSidOrName)
        .syncMapItems(key)
        .update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            key: item.key,
            data: item.data,
            dateUpdated: item.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const removeSyncMapItem = createTool(
    'remove_sync_map_item',
    'Delete a specific key-value pair from a Sync Map.',
    z.object({
      mapSidOrName: z.string().describe('Map SID (MPxxx) or unique name'),
      key: z.string().describe('The key to delete'),
      serviceSid: z.string().startsWith('IS').optional().describe('Sync Service SID (uses default if not provided)'),
    }),
    async ({ mapSidOrName, key, serviceSid }) => {
      const sid = serviceSid || syncServiceSid;
      if (!sid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No Sync Service SID configured' }, null, 2),
          }],
        };
      }

      await client.sync.v1
        .services(sid)
        .syncMaps(mapSidOrName)
        .syncMapItems(key)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, message: `Map item with key '${key}' removed` }, null, 2),
        }],
      };
    }
  );

  return [
    createDocument, updateDocument, getDocument, listDocuments,
    createSyncList, listSyncLists, addSyncListItem, listSyncListItems, updateSyncListItem, removeSyncListItem,
    createSyncMap, listSyncMaps, addSyncMapItem, getSyncMapItem, updateSyncMapItem, removeSyncMapItem,
  ];
}
