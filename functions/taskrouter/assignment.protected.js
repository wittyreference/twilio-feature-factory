// ABOUTME: TaskRouter assignment callback that dequeues voice calls to matched workers.
// ABOUTME: Returns dequeue instruction for call-type tasks, accept for others.

exports.handler = async (context, event, callback) => {
  const taskAttributes = JSON.parse(event.TaskAttributes || '{}');

  console.log(`Assignment callback - Task: ${event.TaskSid}, Worker: ${event.WorkerName}`);
  console.log(`Task type: ${taskAttributes.type}, CallSid: ${taskAttributes.callSid}`);

  if (taskAttributes.type === 'call') {
    // Dequeue: bridge the caller directly to the assigned worker
    return callback(null, {
      instruction: 'dequeue',
      from: context.TWILIO_PHONE_NUMBER,
    });
  }

  // For non-call tasks, just accept the reservation
  return callback(null, {
    instruction: 'accept',
  });
};
