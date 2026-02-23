// ABOUTME: Inbound call tracking handler that logs campaign attribution and forwards calls.
// ABOUTME: Whispers campaign source to business, records the call, and logs to Sync.

exports.handler = async function (context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Start background recording
  const domainName = context.DOMAIN_NAME || 'localhost';
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${domainName}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Determine campaign source from the tracking number called
  const campaignMap = {
    'google': 'Google Ads Campaign',
    'facebook': 'Facebook Marketing',
    'default': 'Direct Call',
  };
  const campaigns = context.CALL_TRACKING_CAMPAIGNS
    ? JSON.parse(context.CALL_TRACKING_CAMPAIGNS)
    : {};
  const campaign = campaigns[event.To] || campaignMap.default;

  console.log(`Call tracking: ${event.From} -> ${event.To}, campaign: ${campaign}`);

  // Whisper campaign source to the business
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    `Incoming call from ${campaign}. Connecting now.`
  );

  // Forward to business line
  const businessNumber = context.CALL_TRACKING_BUSINESS_NUMBER || event.To;
  twiml.dial({
    callerId: event.From,
    record: 'record-from-answer-dual',
    action: `https://${domainName}/callbacks/call-status`,
  }, businessNumber);

  return callback(null, twiml);
};
