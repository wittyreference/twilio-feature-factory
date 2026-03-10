<!-- ABOUTME: Essential context for TaskRouter skill-based routing functions. -->
<!-- ABOUTME: Covers file inventory, core concepts, assignment gotchas, and error codes. -->

# TaskRouter Functions Context

For full API code samples, workflow configuration, and common patterns, see [REFERENCE.md](./REFERENCE.md).

## Files

| File | Access | Description |
|------|--------|-------------|
| `contact-center-welcome.js` | Public | Welcome TwiML for inbound contact center calls; enqueues tasks |
| `assignment.protected.js` | Protected | Assignment callback handler; routes tasks to workers |

## What is TaskRouter?

Skill-based routing engine that distributes tasks to workers based on skills, availability, priority, and custom routing rules (workflows). Use cases: contact center routing, support ticket assignment, delivery dispatch.

## Core Concepts

| Concept | Description | SID Prefix |
|---------|-------------|------------|
| **Workspace** | Container for all TaskRouter configuration | `WS` |
| **Worker** | Agent who handles tasks | `WK` |
| **Task Queue** | Queue holding tasks waiting for workers | `WQ` |
| **Task** | Work item to be routed | `WT` |
| **Workflow** | Routing rules (filters → queues) | `WW` |
| **Activity** | Worker state (Available, Offline, Break) | `WA` |

## Attribute Expressions

| Expression | Description |
|------------|-------------|
| `"skills" HAS "english"` | Worker has skill |
| `level >= 2` | Numeric comparison |
| `department == "support"` | Exact match |
| `"skills" HAS "english" AND level >= 2` | Combined |
| `"skills" IN task.required_skills` | Match against task attributes |

## Assignment Callback

Return the instruction object directly via `callback(null, obj)`. Do NOT use `Twilio.Response` with `setBody(JSON.stringify())` — this double-encodes JSON and produces error 40001.

| Instruction | Description |
|-------------|-------------|
| `accept` | Accept the reservation |
| `reject` | Reject (optional: `activity_sid`) |
| `dequeue` | Bridge voice call to worker |
| `conference` | Bridge via conference room |
| `call` | Initiate outbound call to worker |
| `redirect` | Redirect call to TwiML |

**Conference `record` parameter**: Use string `'record-from-start'`, NOT boolean `true`. Booleans are silently ignored.

## Error Codes

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

## Environment Variables

```
TWILIO_TASKROUTER_WORKSPACE_SID=WSxxxxxxxx
TWILIO_TASKROUTER_WORKFLOW_SID=WWxxxxxxxx
ACTIVITY_AVAILABLE_SID=WAxxxxxxxx
ACTIVITY_OFFLINE_SID=WAxxxxxxxx
ACTIVITY_BREAK_SID=WAxxxxxxxx
ACTIVITY_BUSY_SID=WAxxxxxxxx
AFTER_CALL_ACTIVITY_SID=WAxxxxxxxx
```

## Best Practices

1. Design worker/task attributes for flexible routing
2. Set appropriate reservation timeouts
3. Use workflow filters for escalation
4. Always have a default queue for unmatched tasks
5. Complete or cancel tasks when done — avoid orphaned tasks

## Gotchas

### `<Enqueue>` Auto-Creates Tasks

`<Enqueue>` creates a TaskRouter task AND places the caller in hold. Do NOT also call `workspace.tasks.create()` — this creates duplicate tasks. Use `<Enqueue>` for voice, `tasks.create()` for non-voice (chat, email).

### `HAS` Expression May Silently Fail

Queue `targetWorkers` expressions can fail to match workers without error — tasks just sit until timeout. Check `totalEligibleWorkers` in queue stats. For single-queue setups, use `1==1` (match all).

### Conference `record` Takes a String

`conference_record: 'record-from-start'` (string), NOT `true` (boolean). Booleans are silently ignored.

## File Naming

- `*.js` — Public (TwiML responses like enqueue)
- `*.protected.js` — Protected (assignment callbacks, worker updates)
- `*.private.js` — Private (shared routing logic)
