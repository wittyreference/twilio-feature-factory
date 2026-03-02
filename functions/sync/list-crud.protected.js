// ABOUTME: CRUD operations for Twilio Sync Lists and List Items via action-routed handler.
// ABOUTME: Protected endpoint supporting create, addItem, listItems, updateItem, and removeItem actions.

exports.handler = async (context, event, callback) => {
  if (!context.TWILIO_SYNC_SERVICE_SID) {
    return callback(null, { success: false, error: 'TWILIO_SYNC_SERVICE_SID not configured' });
  }

  const { action, listName, data, index, ttl, limit, order } = event;
  const validActions = ['create', 'addItem', 'listItems', 'updateItem', 'removeItem'];

  if (!action || !validActions.includes(action)) {
    return callback(null, {
      success: false,
      error: `Missing required parameter: action. Valid actions: ${validActions.join(', ')}`,
    });
  }

  if (!listName) {
    return callback(null, { success: false, error: 'Missing required parameter: listName' });
  }

  if ((action === 'addItem' || action === 'updateItem') && !data) {
    return callback(null, { success: false, error: 'Missing required parameter: data' });
  }

  if ((action === 'updateItem' || action === 'removeItem') && (index === undefined || index === null || index === '')) {
    return callback(null, { success: false, error: 'Missing required parameter: index' });
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
      const createParams = { uniqueName: listName };
      if (ttl) {
        createParams.ttl = parseInt(ttl, 10);
      }
      const list = await syncService.syncLists.create(createParams);
      return callback(null, {
        success: true,
        sid: list.sid,
        listName: list.uniqueName,
      });
    }

    if (action === 'addItem') {
      const itemParams = { data: parsedData };
      if (ttl) {
        itemParams.ttl = parseInt(ttl, 10);
      }
      const item = await syncService.syncLists(listName).syncListItems.create(itemParams);
      return callback(null, {
        success: true,
        index: item.index,
        data: item.data,
      });
    }

    if (action === 'listItems') {
      const listParams = { limit: limit ? parseInt(limit, 10) : 20 };
      if (order) {
        listParams.order = order;
      }
      const items = await syncService.syncLists(listName).syncListItems.list(listParams);
      return callback(null, {
        success: true,
        items: items.map((item) => ({ index: item.index, data: item.data })),
        count: items.length,
      });
    }

    if (action === 'updateItem') {
      const parsedIndex = parseInt(index, 10);
      const item = await syncService.syncLists(listName).syncListItems(parsedIndex).update({
        data: parsedData,
      });
      return callback(null, {
        success: true,
        index: item.index,
        data: item.data,
      });
    }

    if (action === 'removeItem') {
      const parsedIndex = parseInt(index, 10);
      await syncService.syncLists(listName).syncListItems(parsedIndex).remove();
      return callback(null, {
        success: true,
        listName,
        index: parsedIndex,
      });
    }
  } catch (error) {
    if (error.code === 20404) {
      return callback(null, { success: false, error: `List '${listName}' not found` });
    }
    if (error.code === 54302) {
      return callback(null, { success: false, error: `List '${listName}' already exists` });
    }
    return callback(null, { success: false, error: error.message });
  }
};
