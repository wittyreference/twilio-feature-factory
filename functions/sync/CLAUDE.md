<!-- ABOUTME: Essential context for Twilio Sync functions — Documents, Lists, Maps, Streams. -->
<!-- ABOUTME: Covers file inventory, action-routed pattern, quick API reference, and key error codes. -->

# Sync Functions Context

This directory contains Twilio Sync API functions for real-time state synchronization across devices and services.

**For complete reference, see [REFERENCE.md](./REFERENCE.md).**

## Files

| File | Access | Description |
|------|--------|-------------|
| `document-crud.protected.js` | Protected | Create/read/update/delete Sync Documents via `action` param |
| `list-crud.protected.js` | Protected | Create Lists, add/list/update/remove List Items via `action` param |
| `map-crud.protected.js` | Protected | Create Maps, set/get/update/remove/list Map Items via `action` param |

### Action-Routed Pattern

All three functions use an `action` parameter to determine the operation:

```javascript
// POST with action=create, documentName=app-config, data={"theme":"dark"}
// POST with action=read, documentName=app-config
// POST with action=update, documentName=app-config, data={"theme":"light"}
// POST with action=delete, documentName=app-config
```

The `data` parameter must be a JSON string (form-encoded bodies arrive as strings). Each handler parses it with `JSON.parse()` and returns clear errors for invalid JSON.

### Available Actions

| Function | Actions |
|----------|---------|
| `document-crud` | `create`, `read`, `update`, `delete` |
| `list-crud` | `create`, `addItem`, `listItems`, `updateItem`, `removeItem` |
| `map-crud` | `create`, `setItem`, `getItem`, `updateItem`, `removeItem`, `listItems` |

## What is Twilio Sync?

Twilio Sync provides real-time state synchronization primitives:
- **Documents**: Single JSON objects for simple state (up to 16KB)
- **Lists**: Ordered collections with automatic indexing
- **Maps**: Key-value stores for flexible lookups
- **Streams**: Pub/sub messaging for ephemeral events

## Quick API Reference

```javascript
const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

// Documents
await syncService.documents.create({ uniqueName: 'name', data: {...}, ttl: 3600 });
await syncService.documents('name').fetch();
await syncService.documents('name').update({ data: {...} });
await syncService.documents('name').remove();

// Lists
await syncService.syncLists.create({ uniqueName: 'name' });
await syncService.syncLists('name').syncListItems.create({ data: {...} });
await syncService.syncLists('name').syncListItems.list({ limit: 20, order: 'desc' });

// Maps
await syncService.syncMaps.create({ uniqueName: 'name' });
await syncService.syncMaps('name').syncMapItems.create({ key: 'k', data: {...} });
await syncService.syncMaps('name').syncMapItems('k').fetch();
```

## Key Error Codes

| Code | Description |
|------|-------------|
| `54007` | Document not found |
| `54008` | List not found |
| `54009` | Map not found |
| `54301` | Document data too large (>16KB) |
| `54302` | Unique name already exists |

See [REFERENCE.md](./REFERENCE.md) for full error table and handling patterns.

## Core Principle: Store Truth Once

**Store truth once, then compute its consequences.**

Sync objects should hold authoritative state -- not derived or duplicated data. If a value can be computed from existing state, compute it at read time rather than storing it separately.

- Don't store `itemCount` alongside a List -- compute it from `syncListItems.list()`
- Don't duplicate a Document's fields into a Map -- reference the Document
- Don't store timestamps in two places -- pick one source and derive the other
- Use webhook events to trigger computations, not to sync redundant copies

## Environment Variables

```
TWILIO_SYNC_SERVICE_SID=ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Best Practices

1. **Use Unique Names**: Always set `uniqueName` for predictable access patterns
2. **Set TTLs**: Use TTL for temporary data to avoid storage buildup
3. **Handle Conflicts**: Document updates are last-write-wins; use Maps for key-based updates
4. **Limit Data Size**: Documents max 16KB; use Lists for larger datasets
5. **Use Streams for Ephemeral Data**: Don't persist data that doesn't need history
6. **Secure Endpoints**: Use `.protected.js` for write operations

## File Naming Conventions

- `*.js` - Public endpoints (read operations)
- `*.protected.js` - Protected endpoints (write operations requiring Twilio signature)
- `*.private.js` - Private helpers (shared Sync utilities)
