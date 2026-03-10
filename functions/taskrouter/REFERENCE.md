<!-- ABOUTME: Complete TaskRouter API reference, workflow configuration, and common patterns. -->
<!-- ABOUTME: Companion to CLAUDE.md — contains full code samples and implementation guides. -->

# TaskRouter Reference

For essential patterns, gotchas, and quick reference, see [CLAUDE.md](./CLAUDE.md).

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
  timeout: 3600
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

// Common activities: Available (true), Offline (false), On Break (false), Busy (false)
```

## Worker & Task Attribute Examples

### Worker Attributes
```javascript
{
  "skills": ["english", "spanish", "billing", "technical"],
  "department": "support",
  "level": 2,
  "location": "US-West",
  "maxConcurrentTasks": 3
}
```

### Task Attributes
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
          { "queue": "WQxxxxx", "timeout": 60 },
          { "queue": "WQyyyyy", "timeout": 120 }
        ]
      },
      {
        "filter_friendly_name": "Standard",
        "expression": "1 == 1",
        "targets": [
          { "queue": "WQzzzzz", "timeout": 300 }
        ]
      }
    ],
    "default_filter": {
      "queue": "WQdefault"
    }
  }
}
```

## Assignment Callback Details

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

### Full Assignment Handler Example

```javascript
exports.handler = async (context, event, callback) => {
  const taskAttributes = JSON.parse(event.TaskAttributes);
  const workerAttributes = JSON.parse(event.WorkerAttributes || '{}');

  if (taskAttributes.type === 'call') {
    return callback(null, {
      instruction: 'conference',
      from: context.TWILIO_PHONE_NUMBER,
      to: workerAttributes.contact_uri || workerAttributes.phone,
      conference_record: 'record-from-start',
      end_conference_on_exit: true,
    });
  }

  return callback(null, { instruction: 'accept' });
};
```

## Event Callbacks

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

### Voice Call Routing with Enqueue

```javascript
exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
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

### Skills-Based Routing Workflow

```javascript
{
  "task_routing": {
    "filters": [
      {
        "filter_friendly_name": "Billing Issues",
        "expression": "type == 'billing'",
        "targets": [{
          "queue": "billing-queue",
          "expression": "\"skills\" HAS \"billing\"",
          "timeout": 120
        }]
      },
      {
        "filter_friendly_name": "Technical Support",
        "expression": "type == 'technical'",
        "targets": [{
          "queue": "technical-queue",
          "expression": "\"skills\" HAS \"technical\" AND level >= 2",
          "timeout": 180
        }]
      }
    ]
  }
}
```

### Worker Activity Management

```javascript
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const workspace = client.taskrouter.v1
    .workspaces(context.TWILIO_TASKROUTER_WORKSPACE_SID);

  const { workerSid, activity } = event;
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
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const workspace = client.taskrouter.v1
    .workspaces(context.TWILIO_TASKROUTER_WORKSPACE_SID);

  const workspaceStats = await workspace.realTimeStatistics().fetch();

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
