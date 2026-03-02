// ABOUTME: Manages Proxy sessions for anonymous number masking via action-routed handler.
// ABOUTME: Protected endpoint supporting create, get, and close session actions.

exports.handler = async (context, event, callback) => {
  if (!context.TWILIO_PROXY_SERVICE_SID) {
    return callback(null, { success: false, error: 'TWILIO_PROXY_SERVICE_SID not configured' });
  }

  const { action, sessionSid, uniqueName, mode, ttl } = event;
  const validActions = ['create', 'get', 'close'];

  if (!action || !validActions.includes(action)) {
    return callback(null, {
      success: false,
      error: `Missing required parameter: action. Valid actions: ${validActions.join(', ')}`,
    });
  }

  if ((action === 'get' || action === 'close') && !sessionSid) {
    return callback(null, { success: false, error: 'Missing required parameter: sessionSid' });
  }

  const client = context.getTwilioClient();
  const service = client.proxy.v1.services(context.TWILIO_PROXY_SERVICE_SID);

  try {
    if (action === 'create') {
      const createParams = { mode: mode || 'voice-and-message' };
      if (uniqueName) {
        createParams.uniqueName = uniqueName;
      }
      if (ttl) {
        createParams.ttl = parseInt(ttl, 10);
      }
      const session = await service.sessions.create(createParams);
      return callback(null, {
        success: true,
        sessionSid: session.sid,
        status: session.status,
        mode: session.mode,
        ttl: session.ttl,
        dateCreated: session.dateCreated,
      });
    }

    if (action === 'get') {
      const session = await service.sessions(sessionSid).fetch();
      return callback(null, {
        success: true,
        sessionSid: session.sid,
        status: session.status,
        mode: session.mode,
        ttl: session.ttl,
        dateCreated: session.dateCreated,
      });
    }

    if (action === 'close') {
      const session = await service.sessions(sessionSid).update({ status: 'closed' });
      return callback(null, {
        success: true,
        sessionSid: session.sid,
        status: session.status,
        dateUpdated: session.dateUpdated,
      });
    }
  } catch (error) {
    if (error.code === 20404) {
      return callback(null, { success: false, error: `Session '${sessionSid}' not found` });
    }
    return callback(null, { success: false, error: error.message });
  }
};
