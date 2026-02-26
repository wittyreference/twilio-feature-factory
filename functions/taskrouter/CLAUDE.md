# TaskRouter Functions Context

This directory contains Twilio TaskRouter API functions for intelligent task routing to workers and agents.

## Files

| File | Access | Description |
|------|--------|-------------|
| `contact-center-welcome.js` | Public | Welcome TwiML for inbound contact center calls; enqueues tasks |
| `assignment.protected.js` | Protected | Assignment callback handler; routes tasks to workers |

## What is TaskRouter?

TaskRouter is a skill-based routing engine that distributes tasks to the most appropriate workers based on:
- Worker skills and attributes
- Worker availability
- Task priority and requirements
- Custom routing rules (workflows)

Common use cases: contact center routing, support ticket assignment, delivery dispatch.

## Core Concepts

| Concept | Description | SID Prefix |
|---------|-------------|------------|
| **Workspace** | Container for all TaskRouter configuration | `WS` |
| **Worker** | Agent who handles tasks (human or automated) | `WK` |
| **Task Queue** | Queue holding tasks waiting for workers | `WQ` |
| **Task** | Work item to be routed and handled | `WT` |
| **Workflow** | Routing rules that assign tasks to queues | `WW` |
| **Activity** | Worker state (Available, Offline, Break, etc.) | `WA` |

## API Overview

### Getting the TaskRouter Client

```javascript
const client = context.getTwilioClient();
const workspace = client.taskrouter.v1.workspaces(context.TWILIO_TASKROUTER_WORKSPACE_SID);
```

### Workers

```javascript
// List workers
const workers = await workspace.workers.list({ limit: 20 });

// Get specific worker
const worker = await workspace.workers(workerSid).fetch();

// Create worker
const worker = await workspace.workers.create({
  friendlyName: 'Alice',
  attributes: JSON.stringify({
    skills: ['english', 'billing'],
    department: 'support',
    level: 2
  })
});

// Update worker attributes
await workspace.workers(workerSid).update({
  attributes: JSON.stringify({
    skills: ['english', 'billing', 'technical'],
    department: 'support',
    level: 3
  })
});

// Update worker activity (Available, Offline, etc.)
await workspace.workers(workerSid).update({
  activitySid: availableActivitySid
});
```

### Tasks

```javascript
// Create task
const task = await workspace.tasks.create({
  workflowSid: context.TWILIO_TASKROUTER_WORKFLOW_SID,
  attributes: JSON.stringify({
    type: 'support',
    language: 'english',
    priority: 1,
    customerId: 'cust-123',
    callSid: event.CallSid
  }),
  timeout: 3600  // Task timeout in seconds
});

// Get task
const task = await workspace.tasks(taskSid).fetch();

// Update task (change priority, attributes)
await workspace.tasks(taskSid).update({
  attributes: JSON.stringify({
    ...JSON.parse(task.attributes),
    priority: 2
  })
});

// Complete task
await workspace.tasks(taskSid).update({
  assignmentStatus: 'completed',
  reason: 'resolved'
});

// Cancel task
await workspace.tasks(taskSid).update({
  assignmentStatus: 'canceled',
  reason: 'customer_hangup'
});
```

### Task Queues

```javascript
// List queues
const queues = await workspace.taskQueues.list();

// Create queue
const queue = await workspace.taskQueues.create({
  friendlyName: 'English Support',
  targetWorkers: '"skills" HAS "english" AND "skills" HAS "support"'
});

// Get queue statistics
const stats = await workspace.taskQueues(queueSid)
  .realTimeStatistics().fetch();
console.log(stats.tasksByStatus);
```

### Activities

```javascript
// List activities
const activities = await workspace.activities.list();

// Create activity
const activity = await workspace.activities.create({
  friendlyName: 'On Break',
  available: false  // Workers in this activity won't receive tasks
});

// Common activities
// - Available (available: true)
// - Offline (available: false)
// - On Break (available: false)
// - Busy (available: false)
```

## Worker Attributes

Workers have JSON attributes defining their skills and capabilities:

```javascript
{
  "skills": ["english", "spanish", "billing", "technical"],
  "department": "support",
  "level": 2,
  "location": "US-West",
  "maxConcurrentTasks": 3
}
```

### Attribute Expressions

TaskRouter uses expressions to match workers to tasks:

| Expression | Description |
|------------|-------------|
| `"skills" HAS "english"` | Worker has skill |
| `level >= 2` | Numeric comparison |
| `department == "support"` | Exact match |
| `"skills" HAS "english" AND level >= 2` | Combined conditions |
| `"skills" IN task.required_skills` | Match against task attributes |

## Task Attributes

Tasks have JSON attributes defining their requirements:

```javascript
{
  "type": "call",
  "language": "english",
  "priority": 1,
  "required_skills": ["billing"],
  "customerId": "cust-123",
  "callSid": "CAxxxxxxxx",
  "queueTime": 0
}
```

## Workflow Configuration

Workflows define routing rules as JSON:

```javascript
{
  "task_routing": {
    "filters": [
      {
        "filter_friendly_name": "High Priority",
        "expression": "priority > 5",
        "targets": [
          {
            "queue": "WQxxxxx",  // Senior support queue
            "timeout": 60
          },
          {
            "queue": "WQyyyyy",  // Fallback queue
            "timeout": 120
          }
        ]
      },
      {
        "filter_friendly_name": "Standard",
        "expression": "1 == 1",  // Catch-all
        "targets": [
          {
            "queue": "WQzzzzz",
            "timeout": 300
          }
        ]
      }
    ],
    "default_filter": {
      "queue": "WQdefault"
    }
  }
}
```

## Assignment Callback

When a task is assigned to a worker, TaskRouter calls your assignment webhook.

### Webhook Parameters

| Parameter | Description |
|-----------|-------------|
| `AccountSid` | Twilio Account SID |
| `WorkspaceSid` | TaskRouter Workspace SID |
| `TaskSid` | Assigned task SID |
| `TaskAttributes` | Task attributes JSON |
| `TaskAge` | Seconds since task creation |
| `TaskPriority` | Task priority value |
| `WorkerSid` | Assigned worker SID |
| `WorkerName` | Worker friendly name |
| `WorkerAttributes` | Worker attributes JSON |
| `ReservationSid` | Reservation SID |

### Assignment Instructions

Respond with instructions for what action to take. **Return the object directly via `callback(null, obj)`.** Do NOT use `Twilio.Response` with `setBody(JSON.stringify())` — this double-encodes the JSON (the Functions runtime serializes the callback argument, so pre-stringifying wraps it in quotes) and produces error 40001 "Could not parse Assignment Instruction."

```javascript
// functions/taskrouter/assignment.protected.js
exports.handler = async (context, event, callback) => {
  const taskAttributes = JSON.parse(event.TaskAttributes);
  const workerAttributes = JSON.parse(event.WorkerAttributes || '{}');

  // For voice calls - bridge via conference so both legs get independent TwiML
  if (taskAttributes.type === 'call') {
    // Return object DIRECTLY — callback serializes it as JSON
    return callback(null, {
      instruction: 'conference',
      from: context.TWILIO_PHONE_NUMBER,
      to: workerAttributes.contact_uri || workerAttributes.phone,
      conference_record: 'record-from-start',
      end_conference_on_exit: true,
    });
  }

  // For other tasks - accept the reservation
  return callback(null, {
    instruction: 'accept'
  });
};
```

**WRONG — double-encodes JSON, causes error 40001:**
```javascript
// DON'T do this for assignment callbacks
const response = new Twilio.Response();
response.appendHeader('Content-Type', 'application/json');
response.setBody(JSON.stringify({ instruction: 'conference', ... }));
callback(null, response);
// Produces: "{\"instruction\":\"conference\",...}" instead of {"instruction":"conference",...}
```

Note: The `setBody(JSON.stringify())` pattern IS correct for non-TaskRouter JSON responses (e.g., API endpoints). The assignment callback is special because TaskRouter expects a raw JSON object, and `callback(null, obj)` handles the serialization automatically.
```

### Available Instructions

| Instruction | Description | Parameters |
|-------------|-------------|------------|
| `accept` | Accept the reservation | - |
| `reject` | Reject the reservation | `activity_sid` (optional) |
| `dequeue` | Connect voice call to worker (simple bridge) | `from`, `post_work_activity_sid` |
| `conference` | Bridge caller and worker via conference room | `from`, `to`, `record`, `end_conference_on_exit`, `status_callback`, `status_callback_events` |
| `call` | Initiate outbound call to worker | `url`, `from`, `to` |
| `redirect` | Redirect call to TwiML | `url` |

**Conference instruction `record` parameter**: Use the string value `'record-from-start'`, NOT the boolean `true`. Boolean values are silently ignored and no recording is created.

## Event Callbacks

Configure event webhooks to receive task and worker state changes.

### Event Types

| Event | Description |
|-------|-------------|
| `task.created` | New task created |
| `task.canceled` | Task was canceled |
| `task.completed` | Task completed |
| `task.deleted` | Task deleted |
| `task.wrapup` | Task in wrapup |
| `reservation.created` | Worker assigned to task |
| `reservation.accepted` | Worker accepted task |
| `reservation.rejected` | Worker rejected task |
| `reservation.timeout` | Reservation timed out |
| `reservation.canceled` | Reservation canceled |
| `reservation.completed` | Reservation completed |
| `worker.activity.update` | Worker changed activity |
| `worker.attributes.update` | Worker attributes changed |

## Common Patterns

### Voice Call Routing

Route inbound calls to available agents using `<Enqueue>`:

```javascript
// functions/taskrouter/enqueue-call.js
exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();

  // Enqueue creates a task AND places the caller in a hold queue
  const enqueue = twiml.enqueue({
    workflowSid: context.TWILIO_TASKROUTER_WORKFLOW_SID
  });
  enqueue.task(JSON.stringify({
    type: 'call',
    language: detectLanguage(event),
    callSid: event.CallSid,
    from: event.From,
    priority: 1
  }));

  return callback(null, twiml);
};
```

**CRITICAL: `<Enqueue>` auto-creates a TaskRouter task.** Do NOT also call `workspace.tasks.create()` — this creates duplicate tasks and the second one will never get a reservation because the worker is already busy with the first.

```javascript
// WRONG — creates TWO tasks (one from Enqueue, one from API)
await workspace.tasks.create({
  workflowSid,
  attributes: JSON.stringify({ ... })
});
twiml.enqueue({ workflowSid }).task(JSON.stringify({ ... }));

// RIGHT — use ONE approach:
// Option A: <Enqueue> for voice calls (handles hold music + task creation)
twiml.enqueue({ workflowSid }).task(JSON.stringify({ ... }));

// Option B: workspace.tasks.create() for non-voice tasks (chat, email, etc.)
await workspace.tasks.create({ workflowSid, attributes: JSON.stringify({ ... }) });
```
```

### Skills-Based Routing

Match tasks to workers with specific skills:

```javascript
// Workflow configuration
{
  "task_routing": {
    "filters": [
      {
        "filter_friendly_name": "Billing Issues",
        "expression": "type == 'billing'",
        "targets": [{
          "queue": "billing-queue",
          "expression": '"skills" HAS "billing"',
          "timeout": 120
        }]
      },
      {
        "filter_friendly_name": "Technical Support",
        "expression": "type == 'technical'",
        "targets": [{
          "queue": "technical-queue",
          "expression": '"skills" HAS "technical" AND level >= 2',
          "timeout": 180
        }]
      }
    ]
  }
}
```

### Worker Activity Management

```javascript
// functions/taskrouter/set-activity.protected.js
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const workspace = client.taskrouter.v1
    .workspaces(context.TWILIO_TASKROUTER_WORKSPACE_SID);

  const { workerSid, activity } = event;

  // Map activity names to SIDs
  const activityMap = {
    available: context.ACTIVITY_AVAILABLE_SID,
    offline: context.ACTIVITY_OFFLINE_SID,
    break: context.ACTIVITY_BREAK_SID,
    busy: context.ACTIVITY_BUSY_SID
  };

  await workspace.workers(workerSid).update({
    activitySid: activityMap[activity]
  });

  return callback(null, { success: true });
};
```

### Real-Time Dashboard Data

```javascript
// functions/taskrouter/stats.protected.js
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const workspace = client.taskrouter.v1
    .workspaces(context.TWILIO_TASKROUTER_WORKSPACE_SID);

  // Get workspace statistics
  const workspaceStats = await workspace.realTimeStatistics().fetch();

  // Get queue statistics
  const queues = await workspace.taskQueues.list();
  const queueStats = await Promise.all(
    queues.map(async (queue) => {
      const stats = await workspace.taskQueues(queue.sid)
        .realTimeStatistics().fetch();
      return {
        name: queue.friendlyName,
        sid: queue.sid,
        tasksWaiting: stats.tasksByStatus.pending || 0,
        availableWorkers: stats.totalAvailableWorkers
      };
    })
  );

  return callback(null, {
    workspace: {
      totalTasks: workspaceStats.totalTasks,
      totalWorkers: workspaceStats.totalWorkers,
      activityStatistics: workspaceStats.activityStatistics
    },
    queues: queueStats
  });
};
```

## Error Handling

### Common Error Codes

| Code | Description |
|------|-------------|
| `20001` | Invalid parameter |
| `20404` | Resource not found |
| `22207` | Task Queue not found |
| `22208` | Workflow not found |
| `22209` | Worker not found |
| `22210` | Activity not found |
| `22211` | Task not found |
| `22212` | Reservation not found |
| `22213` | Task already assigned |
| `22214` | Invalid worker activity |

### Error Handling Pattern

```javascript
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const workspace = client.taskrouter.v1
    .workspaces(context.TWILIO_TASKROUTER_WORKSPACE_SID);

  try {
    const task = await workspace.tasks.create({
      workflowSid: context.TWILIO_TASKROUTER_WORKFLOW_SID,
      attributes: JSON.stringify(event.taskAttributes)
    });

    return callback(null, { success: true, taskSid: task.sid });
  } catch (error) {
    if (error.code === 22208) {
      return callback(null, {
        success: false,
        error: 'Workflow not found. Check TWILIO_TASKROUTER_WORKFLOW_SID.'
      });
    }
    throw error;
  }
};
```

## Testing TaskRouter Functions

### Test Workflow

1. Create test workers with known attributes
2. Create tasks with matching requirements
3. Verify assignment callback receives correct data
4. Complete or cancel tasks to clean up

```javascript
describe('TaskRouter Assignment', () => {
  it('should route billing task to billing worker', async () => {
    const context = createTestContext();
    const event = {
      TaskAttributes: JSON.stringify({ type: 'billing' }),
      WorkerAttributes: JSON.stringify({ skills: ['billing'] }),
      TaskSid: 'WTtest',
      WorkerSid: 'WKtest',
      ReservationSid: 'WRtest'
    };

    await assignmentHandler(context, event, callback);

    const [, response] = callback.mock.calls[0];
    expect(response.instruction).toBe('accept');
  });
});
```

## Environment Variables

```
TWILIO_TASKROUTER_WORKSPACE_SID=WSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_TASKROUTER_WORKFLOW_SID=WWxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ACTIVITY_AVAILABLE_SID=WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ACTIVITY_OFFLINE_SID=WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ACTIVITY_BREAK_SID=WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ACTIVITY_BUSY_SID=WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AFTER_CALL_ACTIVITY_SID=WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Best Practices

1. **Use Meaningful Attributes**: Design worker and task attributes for flexible routing
2. **Set Appropriate Timeouts**: Configure reservation timeouts based on expected response times
3. **Handle Escalation**: Use workflow filters to escalate tasks to different queues
4. **Monitor Queue Health**: Track queue statistics for capacity planning
5. **Implement Fallbacks**: Always have a default queue for unmatched tasks
6. **Clean Up Tasks**: Complete or cancel tasks when done to avoid orphaned tasks
7. **Use Activities Properly**: Ensure workers set correct activity for accurate routing

## File Naming Conventions

- `*.js` - Public endpoints (for TwiML responses like enqueue)
- `*.protected.js` - Protected endpoints (assignment callbacks, worker updates)
- `*.private.js` - Private helpers (shared routing logic)
