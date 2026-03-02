// ABOUTME: Manages the Messaging Service sender pool via action-routed handler.
// ABOUTME: Protected endpoint supporting list, add, and remove phone number actions.

exports.handler = async (context, event, callback) => {
  if (!context.TWILIO_MESSAGING_SERVICE_SID) {
    return callback(null, { success: false, error: 'TWILIO_MESSAGING_SERVICE_SID not configured' });
  }

  const { action, phoneNumberSid } = event;
  const validActions = ['list', 'add', 'remove'];

  if (!action || !validActions.includes(action)) {
    return callback(null, {
      success: false,
      error: `Missing required parameter: action. Valid actions: ${validActions.join(', ')}`,
    });
  }

  if ((action === 'add' || action === 'remove') && !phoneNumberSid) {
    return callback(null, { success: false, error: 'Missing required parameter: phoneNumberSid' });
  }

  const client = context.getTwilioClient();
  const service = client.messaging.v1.services(context.TWILIO_MESSAGING_SERVICE_SID);

  try {
    if (action === 'list') {
      const numbers = await service.phoneNumbers.list();
      return callback(null, {
        success: true,
        phoneNumbers: numbers.map((n) => ({ sid: n.sid, phoneNumber: n.phoneNumber })),
        count: numbers.length,
      });
    }

    if (action === 'add') {
      const number = await service.phoneNumbers.create({ phoneNumberSid });
      return callback(null, {
        success: true,
        phoneNumberSid: number.sid,
        phoneNumber: number.phoneNumber,
      });
    }

    if (action === 'remove') {
      await service.phoneNumbers(phoneNumberSid).remove();
      return callback(null, { success: true, phoneNumberSid });
    }
  } catch (error) {
    if (error.code === 20404) {
      return callback(null, { success: false, error: `Phone number '${phoneNumberSid}' not found in sender pool` });
    }
    return callback(null, { success: false, error: error.message });
  }
};
