# Sync Functions Context

This directory contains Twilio Sync API functions for real-time state synchronization across devices and services.

## What is Twilio Sync?

Twilio Sync provides real-time state synchronization primitives for building collaborative and stateful applications:
- **Documents**: Single JSON objects for simple state (like a settings object)
- **Lists**: Ordered collections with automatic indexing (like a chat history)
- **Maps**: Key-value stores for flexible lookups (like user sessions)
- **Streams**: Pub/sub messaging for ephemeral events (like typing indicators)

## API Overview

### Sync Service

All Sync operations require a Sync Service SID.

```javascript
const client = context.getTwilioClient();
const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);
```

### Documents

Single JSON objects (up to 16KB). Ideal for configuration, settings, or simple state.

```javascript
// Create document
const doc = await syncService.documents.create({
  uniqueName: 'app-config',
  data: { theme: 'dark', version: '1.0' },
  ttl: 86400  // Optional: auto-delete after 24 hours
});

// Fetch document
const doc = await syncService.documents('app-config').fetch();
console.log(doc.data);  // { theme: 'dark', version: '1.0' }

// Update document (full replace)
await syncService.documents('app-config').update({
  data: { theme: 'light', version: '1.1' }
});

// Delete document
await syncService.documents('app-config').remove();
```

### Lists

Ordered collections with automatic indexing. Ideal for message history, activity feeds.

```javascript
// Create list
const list = await syncService.syncLists.create({
  uniqueName: 'chat-messages'
});

// Add item to list
const item = await syncService.syncLists('chat-messages')
  .syncListItems.create({
    data: { sender: 'user123', text: 'Hello!' }
  });
console.log(item.index);  // Auto-assigned index

// Fetch items (paginated)
const items = await syncService.syncLists('chat-messages')
  .syncListItems.list({ limit: 20, order: 'desc' });

// Update item by index
await syncService.syncLists('chat-messages')
  .syncListItems(0).update({
    data: { sender: 'user123', text: 'Hello! (edited)' }
  });

// Delete item
await syncService.syncLists('chat-messages')
  .syncListItems(0).remove();
```

### Maps

Key-value stores for flexible lookups. Ideal for user sessions, device states.

```javascript
// Create map
const map = await syncService.syncMaps.create({
  uniqueName: 'user-sessions'
});

// Set item by key
await syncService.syncMaps('user-sessions')
  .syncMapItems.create({
    key: 'user-123',
    data: { lastSeen: new Date().toISOString(), status: 'online' }
  });

// Get item by key
const item = await syncService.syncMaps('user-sessions')
  .syncMapItems('user-123').fetch();

// Update item
await syncService.syncMaps('user-sessions')
  .syncMapItems('user-123').update({
    data: { lastSeen: new Date().toISOString(), status: 'away' }
  });

// Delete item
await syncService.syncMaps('user-sessions')
  .syncMapItems('user-123').remove();

// List all items
const items = await syncService.syncMaps('user-sessions')
  .syncMapItems.list({ limit: 100 });
```

### Streams

Pub/sub messaging for ephemeral events. Messages are not persisted.

```javascript
// Create stream
const stream = await syncService.syncStreams.create({
  uniqueName: 'typing-indicators'
});

// Publish message to stream
await syncService.syncStreams('typing-indicators')
  .streamMessages.create({
    data: { userId: 'user-123', typing: true }
  });
```

## TTL (Time-To-Live)

All Sync objects support automatic expiration:

```javascript
// Document with 1-hour TTL
await syncService.documents.create({
  uniqueName: 'temp-session',
  data: { token: 'abc123' },
  ttl: 3600  // Seconds until auto-delete
});

// List item with TTL
await syncService.syncLists('my-list')
  .syncListItems.create({
    data: { message: 'Temporary' },
    ttl: 300  // Item expires in 5 minutes
  });
```

## Webhook Events

Configure webhooks on your Sync Service to receive notifications:

| Event Type | Description |
|------------|-------------|
| `document_created` | New document created |
| `document_updated` | Document data changed |
| `document_removed` | Document deleted |
| `list_item_created` | Item added to list |
| `list_item_updated` | List item changed |
| `list_item_removed` | Item removed from list |
| `map_item_created` | Map item created |
| `map_item_updated` | Map item changed |
| `map_item_removed` | Map item removed |
| `stream_message_published` | Message published to stream |

### Webhook Parameters

| Parameter | Description |
|-----------|-------------|
| `AccountSid` | Your Twilio Account SID |
| `ServiceSid` | Sync Service SID |
| `EventType` | Event type (see above) |
| `ResourceSid` | SID of affected resource |
| `UniqueName` | Unique name if set |
| `DateCreated` | ISO timestamp |
| `Data` | JSON data (for create/update events) |

## Common Patterns

### Call State Management

Track multi-step call state across webhooks (referenced in memory-systems.md):

```javascript
// Store call state
exports.storeCallState = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

  await syncService.documents.create({
    uniqueName: `call-${event.CallSid}`,
    data: {
      stage: 'greeting',
      selections: [],
      startTime: new Date().toISOString()
    },
    ttl: 3600  // Clean up after 1 hour
  });

  return callback(null, { success: true });
};

// Retrieve and update call state
exports.getCallState = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

  const doc = await syncService.documents(`call-${event.CallSid}`).fetch();
  const callState = doc.data;

  // Update state
  await syncService.documents(`call-${event.CallSid}`).update({
    data: {
      ...callState,
      stage: 'menu',
      selections: [...callState.selections, event.Digits]
    }
  });

  return callback(null, callState);
};
```

### User Presence

Track online/offline status across devices:

```javascript
// functions/sync/presence.protected.js
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

  const { userId, status } = event;

  await syncService.syncMaps('user-presence')
    .syncMapItems.create({
      key: userId,
      data: {
        status: status,  // 'online', 'away', 'offline'
        lastSeen: new Date().toISOString(),
        device: event.device || 'unknown'
      },
      ttl: 300  // Auto-offline after 5 minutes if no heartbeat
    });

  return callback(null, { success: true });
};
```

### Activity Feed

Maintain an ordered list of events:

```javascript
// Add activity
exports.addActivity = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

  const { userId, action, details } = event;

  await syncService.syncLists('activity-feed')
    .syncListItems.create({
      data: {
        userId,
        action,
        details,
        timestamp: new Date().toISOString()
      },
      ttl: 604800  // Keep for 7 days
    });

  return callback(null, { success: true });
};

// Get recent activity
exports.getActivity = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

  const items = await syncService.syncLists('activity-feed')
    .syncListItems.list({
      limit: event.limit || 20,
      order: 'desc'
    });

  return callback(null, {
    activities: items.map(item => item.data)
  });
};
```

### Real-time Notifications

Use Streams for ephemeral events:

```javascript
// Publish typing indicator
exports.publishTyping = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

  await syncService.syncStreams('room-events')
    .streamMessages.create({
      data: {
        type: 'typing',
        userId: event.userId,
        roomId: event.roomId,
        isTyping: event.isTyping
      }
    });

  return callback(null, { success: true });
};
```

## Error Handling

### Common Error Codes

| Code | Description |
|------|-------------|
| `54001` | Sync Service not found |
| `54007` | Document not found |
| `54008` | List not found |
| `54009` | Map not found |
| `54011` | List item not found |
| `54012` | Map item not found |
| `54301` | Document data too large (>16KB) |
| `54302` | Unique name already exists |

### Error Handling Pattern

```javascript
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

  try {
    const doc = await syncService.documents(event.docName).fetch();
    return callback(null, { success: true, data: doc.data });
  } catch (error) {
    if (error.code === 54007) {
      // Document not found - create it
      const newDoc = await syncService.documents.create({
        uniqueName: event.docName,
        data: { initialized: true }
      });
      return callback(null, { success: true, data: newDoc.data, created: true });
    }
    if (error.code === 54302) {
      // Already exists (race condition) - fetch it
      const doc = await syncService.documents(event.docName).fetch();
      return callback(null, { success: true, data: doc.data });
    }
    throw error;
  }
};
```

## Testing Sync Functions

### Integration Test Pattern

```javascript
describe('Sync Operations', () => {
  const testDocName = `test-doc-${Date.now()}`;

  afterAll(async () => {
    // Cleanup
    try {
      await syncService.documents(testDocName).remove();
    } catch (e) { /* ignore */ }
  });

  it('should create and fetch document', async () => {
    const context = createTestContext();
    const event = {
      docName: testDocName,
      data: { test: true }
    };

    await createDocHandler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.success).toBe(true);
    expect(response.data.test).toBe(true);
  });
});
```

## Environment Variables

```
TWILIO_SYNC_SERVICE_SID=ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Create a Sync Service in the Twilio Console or via CLI:

```bash
twilio api:sync:v1:services:create --friendly-name "My Sync Service"
```

## Best Practices

1. **Use Unique Names**: Always set `uniqueName` for predictable access patterns
2. **Set TTLs**: Use TTL for temporary data to avoid storage buildup
3. **Handle Conflicts**: Document updates are last-write-wins; use Maps for key-based updates
4. **Limit Data Size**: Documents max 16KB; use Lists for larger datasets
5. **Use Streams for Ephemeral Data**: Don't persist data that doesn't need history
6. **Clean Up**: Delete Sync objects when no longer needed
7. **Secure Endpoints**: Use `.protected.js` for write operations

## File Naming Conventions

- `*.js` - Public endpoints (read operations)
- `*.protected.js` - Protected endpoints (write operations requiring Twilio signature)
- `*.private.js` - Private helpers (shared Sync utilities)
