// ABOUTME: CRUD operations for Twilio Sync Maps and Map Items via action-routed handler.
// ABOUTME: Protected endpoint supporting create, setItem, getItem, updateItem, removeItem, and listItems actions.

exports.handler = async (context, event, callback) => {
  if (!context.TWILIO_SYNC_SERVICE_SID) {
    return callback(null, { success: false, error: 'TWILIO_SYNC_SERVICE_SID not configured' });
  }

  const { action, mapName, key, data, ttl, limit } = event;
  const validActions = ['create', 'setItem', 'getItem', 'updateItem', 'removeItem', 'listItems'];

  if (!action || !validActions.includes(action)) {
    return callback(null, {
      success: false,
      error: `Missing required parameter: action. Valid actions: ${validActions.join(', ')}`,
    });
  }

  if (!mapName) {
    return callback(null, { success: false, error: 'Missing required parameter: mapName' });
  }

  if (['setItem', 'getItem', 'updateItem', 'removeItem'].includes(action) && !key) {
    return callback(null, { success: false, error: 'Missing required parameter: key' });
  }

  if ((action === 'setItem' || action === 'updateItem') && !data) {
    return callback(null, { success: false, error: 'Missing required parameter: data' });
  }

  let parsedData;
  if (data) {
    try {
      parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (_parseError) {
      return callback(null, { success: false, error: 'Invalid JSON in data parameter' });
    }
  }

  const client = context.getTwilioClient();
  const syncService = client.sync.v1.services(context.TWILIO_SYNC_SERVICE_SID);

  try {
    if (action === 'create') {
      const createParams = { uniqueName: mapName };
      if (ttl) {
        createParams.ttl = parseInt(ttl, 10);
      }
      const map = await syncService.syncMaps.create(createParams);
      return callback(null, {
        success: true,
        sid: map.sid,
        mapName: map.uniqueName,
      });
    }

    if (action === 'setItem') {
      const itemParams = { key, data: parsedData };
      if (ttl) {
        itemParams.ttl = parseInt(ttl, 10);
      }
      const item = await syncService.syncMaps(mapName).syncMapItems.create(itemParams);
      return callback(null, {
        success: true,
        key: item.key,
        data: item.data,
      });
    }

    if (action === 'getItem') {
      const item = await syncService.syncMaps(mapName).syncMapItems(key).fetch();
      return callback(null, {
        success: true,
        key: item.key,
        data: item.data,
        dateUpdated: item.dateUpdated,
      });
    }

    if (action === 'updateItem') {
      const item = await syncService.syncMaps(mapName).syncMapItems(key).update({
        data: parsedData,
      });
      return callback(null, {
        success: true,
        key: item.key,
        data: item.data,
        dateUpdated: item.dateUpdated,
      });
    }

    if (action === 'removeItem') {
      await syncService.syncMaps(mapName).syncMapItems(key).remove();
      return callback(null, {
        success: true,
        mapName,
        key,
      });
    }

    if (action === 'listItems') {
      const listParams = { limit: limit ? parseInt(limit, 10) : 20 };
      const items = await syncService.syncMaps(mapName).syncMapItems.list(listParams);
      return callback(null, {
        success: true,
        items: items.map((item) => ({ key: item.key, data: item.data })),
        count: items.length,
      });
    }
  } catch (error) {
    if (error.code === 20404) {
      return callback(null, { success: false, error: `Map '${mapName}' not found` });
    }
    if (error.code === 54302) {
      return callback(null, { success: false, error: `Map '${mapName}' already exists` });
    }
    return callback(null, { success: false, error: error.message });
  }
};
