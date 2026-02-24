// ABOUTME: TaskRouter assignment callback that bridges callers to workers via conference.
// ABOUTME: Returns conference instruction for call-type tasks, accept for others.

exports.handler = async (context, event, callback) => {
  const taskAttributes = JSON.parse(event.TaskAttributes || '{}');
  const workerAttributes = JSON.parse(event.WorkerAttributes || '{}');

  console.log(`Assignment callback - Task: ${event.TaskSid}, Worker: ${event.WorkerName}`);
  console.log(`Task type: ${taskAttributes.type}, CallSid: ${taskAttributes.callSid}`);

  if (taskAttributes.type === 'call') {
    // Conference: add both caller and worker to a conference room
    // This allows the worker's phone webhook (e.g. ConversationRelay) to handle their leg
    return callback(null, {
      instruction: 'conference',
      from: context.TWILIO_PHONE_NUMBER,
      to: workerAttributes.contact_uri || workerAttributes.phone,
      conference_status_callback: `https://${context.DOMAIN_NAME}/callbacks/call-status`,
      conference_status_callback_event: 'start end join leave',
      conference_record: 'record-from-start',
      end_conference_on_exit: true,
    });
  }

  // For non-call tasks, just accept the reservation
  return callback(null, {
    instruction: 'accept',
  });
};
