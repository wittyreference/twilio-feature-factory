// ABOUTME: Sends SMS/MMS via Twilio Messaging Service with optional scheduling and status callbacks.
// ABOUTME: Protected endpoint using messagingServiceSid for sender pool selection.

exports.handler = async (context, event, callback) => {
  if (!context.TWILIO_MESSAGING_SERVICE_SID) {
    return callback(null, { success: false, error: 'TWILIO_MESSAGING_SERVICE_SID not configured' });
  }

  const { to, body, mediaUrl, scheduleAt, statusCallback } = event;

  if (!to) {
    return callback(null, { success: false, error: 'Missing required parameter: to' });
  }

  if (!body) {
    return callback(null, { success: false, error: 'Missing required parameter: body' });
  }

  if (scheduleAt) {
    const scheduledTime = new Date(scheduleAt);
    const maxTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    if (scheduledTime > maxTime) {
      return callback(null, {
        success: false,
        error: 'Messages can only be scheduled up to 7 days in advance',
      });
    }
  }

  const client = context.getTwilioClient();

  const messageParams = {
    to,
    messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
    body,
  };

  if (mediaUrl) {
    messageParams.mediaUrl = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
  }

  if (scheduleAt) {
    messageParams.scheduleType = 'fixed';
    messageParams.sendAt = scheduleAt;
  }

  if (statusCallback) {
    messageParams.statusCallback = statusCallback;
  }

  try {
    const message = await client.messages.create(messageParams);
    return callback(null, {
      success: true,
      messageSid: message.sid,
      status: message.status,
    });
  } catch (error) {
    if (error.code === 21610) {
      return callback(null, { success: false, error: 'Recipient has opted out of messages' });
    }
    if (error.code === 21611) {
      return callback(null, { success: false, error: 'No phone numbers in sender pool' });
    }
    if (error.code === 21617) {
      return callback(null, { success: false, error: 'Messaging Service not found' });
    }
    return callback(null, { success: false, error: error.message });
  }
};
