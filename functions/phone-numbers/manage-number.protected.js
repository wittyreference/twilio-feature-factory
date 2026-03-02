// ABOUTME: Manages owned Twilio phone numbers via action-routed handler.
// ABOUTME: Protected endpoint supporting list, configure, and release actions.

exports.handler = async (context, event, callback) => {
  const { action, phoneNumberSid, voiceUrl, smsUrl, statusCallback } = event;
  const validActions = ['list', 'configure', 'release'];

  if (!action || !validActions.includes(action)) {
    return callback(null, {
      success: false,
      error: `Missing required parameter: action. Valid actions: ${validActions.join(', ')}`,
    });
  }

  if ((action === 'configure' || action === 'release') && !phoneNumberSid) {
    return callback(null, { success: false, error: 'Missing required parameter: phoneNumberSid' });
  }

  const client = context.getTwilioClient();

  try {
    if (action === 'list') {
      const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
      return callback(null, {
        success: true,
        numbers: numbers.map((n) => ({
          sid: n.sid,
          phoneNumber: n.phoneNumber,
          friendlyName: n.friendlyName,
          capabilities: n.capabilities,
          voiceUrl: n.voiceUrl,
          smsUrl: n.smsUrl,
        })),
        count: numbers.length,
      });
    }

    if (action === 'configure') {
      const updateParams = {};
      if (voiceUrl) {
        updateParams.voiceUrl = voiceUrl;
      }
      if (smsUrl) {
        updateParams.smsUrl = smsUrl;
      }
      if (statusCallback) {
        updateParams.statusCallback = statusCallback;
      }
      const updated = await client.incomingPhoneNumbers(phoneNumberSid).update(updateParams);
      return callback(null, {
        success: true,
        sid: updated.sid,
        phoneNumber: updated.phoneNumber,
        voiceUrl: updated.voiceUrl,
        smsUrl: updated.smsUrl,
        statusCallback: updated.statusCallback,
      });
    }

    if (action === 'release') {
      await client.incomingPhoneNumbers(phoneNumberSid).remove();
      return callback(null, { success: true, phoneNumberSid });
    }
  } catch (error) {
    if (error.code === 20404) {
      return callback(null, { success: false, error: `Phone number '${phoneNumberSid}' not found` });
    }
    return callback(null, { success: false, error: error.message });
  }
};
