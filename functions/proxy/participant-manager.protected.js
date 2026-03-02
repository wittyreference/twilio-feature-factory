// ABOUTME: Manages Proxy session participants for anonymous number masking.
// ABOUTME: Protected endpoint supporting add, list, and remove participant actions.

exports.handler = async (context, event, callback) => {
  if (!context.TWILIO_PROXY_SERVICE_SID) {
    return callback(null, { success: false, error: 'TWILIO_PROXY_SERVICE_SID not configured' });
  }

  const { action, sessionSid, identifier, friendlyName, participantSid } = event;
  const validActions = ['add', 'list', 'remove'];

  if (!action || !validActions.includes(action)) {
    return callback(null, {
      success: false,
      error: `Missing required parameter: action. Valid actions: ${validActions.join(', ')}`,
    });
  }

  if (!sessionSid) {
    return callback(null, { success: false, error: 'Missing required parameter: sessionSid' });
  }

  if (action === 'add' && !identifier) {
    return callback(null, { success: false, error: 'Missing required parameter: identifier' });
  }

  if (action === 'remove' && !participantSid) {
    return callback(null, { success: false, error: 'Missing required parameter: participantSid' });
  }

  const client = context.getTwilioClient();
  const session = client.proxy.v1
    .services(context.TWILIO_PROXY_SERVICE_SID)
    .sessions(sessionSid);

  try {
    if (action === 'add') {
      const addParams = { identifier };
      if (friendlyName) {
        addParams.friendlyName = friendlyName;
      }
      const participant = await session.participants.create(addParams);
      return callback(null, {
        success: true,
        participantSid: participant.sid,
        identifier: participant.identifier,
        proxyIdentifier: participant.proxyIdentifier,
        friendlyName: participant.friendlyName,
      });
    }

    if (action === 'list') {
      const participants = await session.participants.list();
      return callback(null, {
        success: true,
        participants: participants.map((p) => ({
          sid: p.sid,
          identifier: p.identifier,
          proxyIdentifier: p.proxyIdentifier,
          friendlyName: p.friendlyName,
        })),
        count: participants.length,
      });
    }

    if (action === 'remove') {
      await session.participants(participantSid).remove();
      return callback(null, { success: true, participantSid });
    }
  } catch (error) {
    if (error.code === 20404) {
      return callback(null, { success: false, error: 'Resource not found' });
    }
    return callback(null, { success: false, error: error.message });
  }
};
