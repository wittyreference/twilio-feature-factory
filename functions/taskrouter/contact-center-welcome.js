// ABOUTME: Welcome handler for inbound contact center calls with TaskRouter enqueue.
// ABOUTME: Greets caller, starts background recording, and enqueues via TaskRouter workflow.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Start background recording with absolute callback URL
  const start = twiml.start();
  start.recording({
    recordingStatusCallback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
    recordingStatusCallbackEvent: 'completed',
  });

  // Welcome message
  twiml.say(
    { voice: 'Polly.Amy', language: 'en-GB' },
    'Thank you for calling our support centre. ' +
    'Your call is important to us. ' +
    'Please hold while we connect you to the next available agent.'
  );

  // Enqueue via TaskRouter
  const enqueue = twiml.enqueue({
    workflowSid: context.TWILIO_TASKROUTER_WORKFLOW_SID,
    waitUrl: '',
  });
  enqueue.task({}, JSON.stringify({
    type: 'call',
    language: 'english',
    callSid: event.CallSid,
    from: event.From,
    priority: 1,
  }));

  return callback(null, twiml);
};
