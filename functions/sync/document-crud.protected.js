// ABOUTME: CRUD operations for Twilio Sync Documents via action-routed handler.
// ABOUTME: Protected endpoint supporting create, read, update, and delete actions.

exports.handler = async (context, event, callback) => {
  if (!context.TWILIO_SYNC_SERVICE_SID) {
    return callback(null, { success: false, error: 'TWILIO_SYNC_SERVICE_SID not configured' });
  }

  const { action, documentName, data, ttl } = event;
  const validActions = ['create', 'read', 'update', 'delete'];

  if (!action || !validActions.includes(action)) {
    return callback(null, {
      success: false,
      error: `Missing required parameter: action. Valid actions: ${validActions.join(', ')}`,
    });
  }

  if (!documentName) {
    return callback(null, { success: false, error: 'Missing required parameter: documentName' });
  }

  if ((action === 'create' || action === 'update') && !data) {
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
      const createParams = { uniqueName: documentName, data: parsedData };
      if (ttl) {
        createParams.ttl = parseInt(ttl, 10);
      }
      const doc = await syncService.documents.create(createParams);
      return callback(null, {
        success: true,
        sid: doc.sid,
        documentName: doc.uniqueName,
        data: doc.data,
      });
    }

    if (action === 'read') {
      const doc = await syncService.documents(documentName).fetch();
      return callback(null, {
        success: true,
        sid: doc.sid,
        documentName: doc.uniqueName,
        data: doc.data,
        dateUpdated: doc.dateUpdated,
      });
    }

    if (action === 'update') {
      const updateParams = { data: parsedData };
      if (ttl) {
        updateParams.ttl = parseInt(ttl, 10);
      }
      const doc = await syncService.documents(documentName).update(updateParams);
      return callback(null, {
        success: true,
        sid: doc.sid,
        documentName: doc.uniqueName,
        data: doc.data,
        dateUpdated: doc.dateUpdated,
      });
    }

    if (action === 'delete') {
      await syncService.documents(documentName).remove();
      return callback(null, { success: true, documentName });
    }
  } catch (error) {
    if (error.code === 20404) {
      return callback(null, { success: false, error: `Document '${documentName}' not found` });
    }
    if (error.code === 54302) {
      return callback(null, { success: false, error: `Document '${documentName}' already exists` });
    }
    return callback(null, { success: false, error: error.message });
  }
};
