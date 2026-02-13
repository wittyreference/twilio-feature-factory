// ABOUTME: Event callback handler for TaskRouter task and worker events.
// ABOUTME: Logs all TaskRouter events to Sync for deep validation.

const { logToSync } = require(Runtime.getFunctions()['callbacks/helpers/sync-logger'].path);

/**
 * Handles TaskRouter event callbacks from Twilio.
 *
 * TaskRouter sends event callbacks for:
 * - task.created: New task created
 * - task.updated: Task attributes or state changed
 * - task.canceled: Task was canceled
 * - task.completed: Task was completed
 * - task.deleted: Task was deleted
 * - task.wrapup: Task entered wrapup
 * - reservation.created: Worker reservation created
 * - reservation.accepted: Worker accepted reservation
 * - reservation.rejected: Worker rejected reservation
 * - reservation.timeout: Reservation timed out
 * - reservation.canceled: Reservation canceled
 * - reservation.rescinded: Reservation rescinded
 * - reservation.completed: Reservation completed
 * - worker.activity.update: Worker activity changed
 * - worker.attributes.update: Worker attributes changed
 *
 * @see https://www.twilio.com/docs/taskrouter/api/event#event-types
 */
exports.handler = async function (context, event, callback) {
  console.log('TaskRouter event callback received:', JSON.stringify(event));

  const {
    EventType,
    TaskSid,
    TaskAttributes,
    TaskAssignmentStatus,
    TaskAge,
    TaskPriority,
    WorkerSid,
    WorkerName,
    WorkerActivityName,
    ReservationSid,
    WorkspaceSid,
    WorkflowSid,
    TaskQueueSid,
    AccountSid,
    Timestamp,
  } = event;

  // Determine the resource SID to use for logging
  // Prefer TaskSid, fall back to ReservationSid or WorkerSid
  const resourceSid = TaskSid || ReservationSid || WorkerSid;
  const resourceType = TaskSid ? 'task' : ReservationSid ? 'reservation' : 'worker';

  if (!resourceSid) {
    console.error('No identifiable resource SID in TaskRouter callback');
    return callback(null, { success: false, error: 'Missing resource SID' });
  }

  try {
    // Parse task attributes if present
    let parsedAttributes = null;
    if (TaskAttributes) {
      try {
        parsedAttributes = JSON.parse(TaskAttributes);
      } catch {
        parsedAttributes = TaskAttributes;
      }
    }

    // Log to Sync for deep validation
    await logToSync(context, resourceType, resourceSid, {
      status: EventType,
      eventType: EventType,
      taskSid: TaskSid,
      taskAttributes: parsedAttributes,
      taskAssignmentStatus: TaskAssignmentStatus,
      taskAge: TaskAge,
      taskPriority: TaskPriority,
      workerSid: WorkerSid,
      workerName: WorkerName,
      workerActivity: WorkerActivityName,
      reservationSid: ReservationSid,
      workspaceSid: WorkspaceSid,
      workflowSid: WorkflowSid,
      taskQueueSid: TaskQueueSid,
      accountSid: AccountSid,
      timestamp: Timestamp,
      rawEvent: JSON.parse(JSON.stringify(event)),
    });

    // Log for Function execution logs
    console.log(`TaskRouter ${EventType}: ${resourceType} ${resourceSid}`);

    // Return success
    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.setBody({ success: true, eventType: EventType });

    return callback(null, response);
  } catch (error) {
    console.error('Error processing TaskRouter event callback:', error.message);

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.setBody({
      success: false,
      error: error.message,
      eventType: EventType,
    });

    return callback(null, response);
  }
};
