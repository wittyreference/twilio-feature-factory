// ABOUTME: Twilio TaskRouter tools for skills-based routing.
// ABOUTME: Provides 30 tools: workspace/task/worker/workflow/queue/activity CRUD, plus reservations.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';
import type { TaskStatus } from 'twilio/lib/rest/taskrouter/v1/workspace/task.js';
import type { ReservationStatus } from 'twilio/lib/rest/taskrouter/v1/workspace/task/reservation.js';
import type { TaskQueueTaskOrder } from 'twilio/lib/rest/taskrouter/v1/workspace/taskQueue.js';

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>
) {
  return { name, description, inputSchema: schema, handler };
}

/**
 * Returns all TaskRouter-related tools configured with the given Twilio context.
 */
export function taskrouterTools(context: TwilioContext) {
  const { client, taskrouterWorkspaceSid } = context;

  const createTask = createTool(
    'create_task',
    'Create a new task in TaskRouter.',
    z.object({
      attributes: z.record(z.any()).describe('Task attributes as JSON'),
      workflowSid: z.string().startsWith('WW').optional().describe('Workflow SID to route the task'),
      timeout: z.number().min(1).optional().describe('Task timeout in seconds'),
      priority: z.number().min(0).optional().describe('Task priority (higher = more urgent)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ attributes, workflowSid, timeout, priority, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const createParams: {
        attributes: string;
        workflowSid?: string;
        timeout?: number;
        priority?: number;
      } = { attributes: JSON.stringify(attributes) };

      if (workflowSid) {createParams.workflowSid = workflowSid;}
      if (timeout) {createParams.timeout = timeout;}
      if (priority !== undefined) {createParams.priority = priority;}

      const task = await client.taskrouter.v1.workspaces(wsSid).tasks.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: task.sid,
            attributes: JSON.parse(task.attributes),
            assignmentStatus: task.assignmentStatus,
            priority: task.priority,
            reason: task.reason,
            dateCreated: task.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const listTasks = createTool(
    'list_tasks',
    'List tasks in the TaskRouter workspace.',
    z.object({
      assignmentStatus: z.enum(['pending', 'reserved', 'assigned', 'canceled', 'completed', 'wrapping']).optional(),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ assignmentStatus, limit, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const filters: { assignmentStatus?: string[]; limit: number } = { limit: limit || 20 };
      if (assignmentStatus) {filters.assignmentStatus = [assignmentStatus];}

      const tasks = await client.taskrouter.v1.workspaces(wsSid).tasks.list(filters);

      const formattedTasks = tasks.map((t) => ({
        sid: t.sid,
        attributes: JSON.parse(t.attributes),
        assignmentStatus: t.assignmentStatus,
        priority: t.priority,
        age: t.age,
        dateCreated: t.dateCreated,
        dateUpdated: t.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedTasks.length, tasks: formattedTasks }, null, 2),
        }],
      };
    }
  );

  const getTaskStatus = createTool(
    'get_task_status',
    'Get detailed status of a specific task.',
    z.object({
      taskSid: z.string().startsWith('WT').describe('Task SID (starts with WT)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ taskSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const task = await client.taskrouter.v1.workspaces(wsSid).tasks(taskSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: task.sid,
            attributes: JSON.parse(task.attributes),
            assignmentStatus: task.assignmentStatus,
            priority: task.priority,
            reason: task.reason,
            age: task.age,
            taskQueueSid: task.taskQueueSid,
            workflowSid: task.workflowSid,
            dateCreated: task.dateCreated,
            dateUpdated: task.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listWorkers = createTool(
    'list_workers',
    'List workers in the TaskRouter workspace.',
    z.object({
      available: z.boolean().optional().describe('Filter by availability'),
      activityName: z.string().optional().describe('Filter by activity name'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ available, activityName, limit, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const filters: { available?: string; activityName?: string; limit: number } = { limit: limit || 20 };
      if (available !== undefined) {filters.available = available.toString();}
      if (activityName) {filters.activityName = activityName;}

      const workers = await client.taskrouter.v1.workspaces(wsSid).workers.list(filters);

      const formattedWorkers = workers.map((w) => ({
        sid: w.sid,
        friendlyName: w.friendlyName,
        available: w.available,
        activityName: w.activityName,
        attributes: JSON.parse(w.attributes),
        dateCreated: w.dateCreated,
        dateStatusChanged: w.dateStatusChanged,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedWorkers.length, workers: formattedWorkers }, null, 2),
        }],
      };
    }
  );

  const listWorkflows = createTool(
    'list_workflows',
    'List workflows in the TaskRouter workspace.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ limit, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const workflows = await client.taskrouter.v1.workspaces(wsSid).workflows.list({ limit: limit || 20 });

      const formattedWorkflows = workflows.map((w) => ({
        sid: w.sid,
        friendlyName: w.friendlyName,
        assignmentCallbackUrl: w.assignmentCallbackUrl,
        fallbackAssignmentCallbackUrl: w.fallbackAssignmentCallbackUrl,
        taskReservationTimeout: w.taskReservationTimeout,
        dateCreated: w.dateCreated,
        dateUpdated: w.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedWorkflows.length, workflows: formattedWorkflows }, null, 2),
        }],
      };
    }
  );

  const updateTask = createTool(
    'update_task',
    'Update a task in TaskRouter. Change priority, attributes, assignment status, or reason.',
    z.object({
      taskSid: z.string().startsWith('WT').describe('Task SID (starts with WT)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
      assignmentStatus: z.enum(['pending', 'reserved', 'assigned', 'canceled', 'completed', 'wrapping']).optional().describe('New assignment status'),
      priority: z.number().min(0).optional().describe('New priority (higher = more urgent)'),
      reason: z.string().optional().describe('Reason for status change (e.g. cancellation reason)'),
      attributes: z.record(z.any()).optional().describe('New task attributes as JSON'),
    }),
    async ({ taskSid, workspaceSid, assignmentStatus, priority, reason, attributes }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const updateParams: {
        assignmentStatus?: TaskStatus;
        priority?: number;
        reason?: string;
        attributes?: string;
      } = {};

      if (assignmentStatus) {updateParams.assignmentStatus = assignmentStatus as TaskStatus;}
      if (priority !== undefined) {updateParams.priority = priority;}
      if (reason) {updateParams.reason = reason;}
      if (attributes) {updateParams.attributes = JSON.stringify(attributes);}

      const task = await client.taskrouter.v1.workspaces(wsSid).tasks(taskSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: task.sid,
            attributes: JSON.parse(task.attributes),
            assignmentStatus: task.assignmentStatus,
            priority: task.priority,
            reason: task.reason,
            dateUpdated: task.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listTaskQueues = createTool(
    'list_task_queues',
    'List all task queues in the TaskRouter workspace.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ limit, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const queues = await client.taskrouter.v1.workspaces(wsSid).taskQueues.list({ limit: limit || 20 });

      const formattedQueues = queues.map((q) => ({
        sid: q.sid,
        friendlyName: q.friendlyName,
        targetWorkers: q.targetWorkers,
        maxReservedWorkers: q.maxReservedWorkers,
        taskOrder: q.taskOrder,
        dateCreated: q.dateCreated,
        dateUpdated: q.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedQueues.length, taskQueues: formattedQueues }, null, 2),
        }],
      };
    }
  );

  const getTaskQueue = createTool(
    'get_task_queue',
    'Get details of a specific task queue.',
    z.object({
      taskQueueSid: z.string().startsWith('WQ').describe('Task Queue SID (starts with WQ)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ taskQueueSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const queue = await client.taskrouter.v1.workspaces(wsSid).taskQueues(taskQueueSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: queue.sid,
            friendlyName: queue.friendlyName,
            targetWorkers: queue.targetWorkers,
            maxReservedWorkers: queue.maxReservedWorkers,
            taskOrder: queue.taskOrder,
            dateCreated: queue.dateCreated,
            dateUpdated: queue.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const getQueueStatistics = createTool(
    'get_queue_statistics',
    'Get real-time statistics for a task queue, including available workers, pending tasks, and average wait time.',
    z.object({
      taskQueueSid: z.string().startsWith('WQ').describe('Task Queue SID (starts with WQ)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ taskQueueSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const stats = await client.taskrouter.v1.workspaces(wsSid).taskQueues(taskQueueSid).realTimeStatistics().fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            taskQueueSid,
            totalAvailableWorkers: stats.totalAvailableWorkers,
            totalEligibleWorkers: stats.totalEligibleWorkers,
            totalTasks: stats.totalTasks,
            longestTaskWaitingAge: stats.longestTaskWaitingAge,
            longestTaskWaitingSid: stats.longestTaskWaitingSid,
            tasksByStatus: stats.tasksByStatus,
            activityStatistics: stats.activityStatistics,
          }, null, 2),
        }],
      };
    }
  );

  const listActivities = createTool(
    'list_activities',
    'List activities in the TaskRouter workspace. Activities represent worker states (e.g. Available, Offline, Break).',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ limit, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const activities = await client.taskrouter.v1.workspaces(wsSid).activities.list({ limit: limit || 20 });

      const formattedActivities = activities.map((a) => ({
        sid: a.sid,
        friendlyName: a.friendlyName,
        available: a.available,
        dateCreated: a.dateCreated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedActivities.length, activities: formattedActivities }, null, 2),
        }],
      };
    }
  );

  const updateWorker = createTool(
    'update_worker',
    'Update a worker in TaskRouter. Change activity state or attributes. Tier 2 operation — changes worker availability.',
    z.object({
      workerSid: z.string().startsWith('WK').describe('Worker SID (starts with WK)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
      activitySid: z.string().startsWith('WA').optional().describe('Activity SID to set (starts with WA)'),
      attributes: z.record(z.any()).optional().describe('New worker attributes as JSON'),
    }),
    async ({ workerSid, workspaceSid, activitySid, attributes }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const updateParams: {
        activitySid?: string;
        attributes?: string;
      } = {};

      if (activitySid) {updateParams.activitySid = activitySid;}
      if (attributes) {updateParams.attributes = JSON.stringify(attributes);}

      const worker = await client.taskrouter.v1.workspaces(wsSid).workers(workerSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: worker.sid,
            friendlyName: worker.friendlyName,
            available: worker.available,
            activityName: worker.activityName,
            activitySid: worker.activitySid,
            attributes: JSON.parse(worker.attributes),
            dateUpdated: worker.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listReservations = createTool(
    'list_reservations',
    'List reservations for a specific task in TaskRouter.',
    z.object({
      taskSid: z.string().startsWith('WT').describe('Task SID (starts with WT)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
      reservationStatus: z.enum(['pending', 'accepted', 'rejected', 'timeout', 'canceled', 'rescinded', 'wrapping', 'completed']).optional().describe('Filter by reservation status'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
    }),
    async ({ taskSid, workspaceSid, reservationStatus, limit }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const filters: { reservationStatus?: ReservationStatus; limit: number } = { limit: limit || 20 };
      if (reservationStatus) {filters.reservationStatus = reservationStatus as ReservationStatus;}

      const reservations = await client.taskrouter.v1.workspaces(wsSid).tasks(taskSid).reservations.list(filters);

      const formattedReservations = reservations.map((r) => ({
        sid: r.sid,
        taskSid: r.taskSid,
        workerSid: r.workerSid,
        workerName: r.workerName,
        reservationStatus: r.reservationStatus,
        dateCreated: r.dateCreated,
        dateUpdated: r.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedReservations.length, reservations: formattedReservations }, null, 2),
        }],
      };
    }
  );

  const updateReservation = createTool(
    'update_reservation',
    'Update a reservation in TaskRouter. Accept, reject, or provide an instruction (conference, dequeue, redirect, call). Tier 2 operation. Note: the conference instruction changes the participant\'s TwiML document, exiting any current state (queue, hold).',
    z.object({
      taskSid: z.string().startsWith('WT').describe('Task SID (starts with WT)'),
      reservationSid: z.string().startsWith('WR').describe('Reservation SID (starts with WR)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
      reservationStatus: z.enum(['accepted', 'rejected', 'canceled']).optional().describe('New reservation status'),
      instruction: z.enum(['conference', 'dequeue', 'redirect', 'call']).optional().describe('Instruction for handling the reservation'),
      dequeueFrom: z.string().optional().describe('Caller ID for dequeue instruction (E.164)'),
      dequeueTo: z.string().optional().describe('Phone number to dequeue to (E.164)'),
      conferenceStatusCallback: z.string().url().optional().describe('Status callback URL for conference instruction'),
    }),
    async ({ taskSid, reservationSid, workspaceSid, reservationStatus, instruction, dequeueFrom, dequeueTo, conferenceStatusCallback }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const updateParams: {
        reservationStatus?: ReservationStatus;
        instruction?: string;
        dequeueFrom?: string;
        dequeueTo?: string;
        conferenceStatusCallback?: string;
      } = {};

      if (reservationStatus) {updateParams.reservationStatus = reservationStatus as ReservationStatus;}
      if (instruction) {updateParams.instruction = instruction;}
      if (dequeueFrom) {updateParams.dequeueFrom = dequeueFrom;}
      if (dequeueTo) {updateParams.dequeueTo = dequeueTo;}
      if (conferenceStatusCallback) {updateParams.conferenceStatusCallback = conferenceStatusCallback;}

      const reservation = await client.taskrouter.v1.workspaces(wsSid).tasks(taskSid).reservations(reservationSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: reservation.sid,
            taskSid: reservation.taskSid,
            workerSid: reservation.workerSid,
            workerName: reservation.workerName,
            reservationStatus: reservation.reservationStatus,
            dateUpdated: reservation.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // WORKSPACE MANAGEMENT
  // ============================================

  const listWorkspaces = createTool(
    'list_workspaces',
    'List all TaskRouter workspaces in the account.',
    z.object({
      friendlyName: z.string().optional().describe('Filter by friendly name'),
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
    }),
    async ({ friendlyName, limit }) => {
      const filters: { friendlyName?: string; limit: number } = { limit: limit || 20 };
      if (friendlyName) {filters.friendlyName = friendlyName;}

      const workspaces = await client.taskrouter.v1.workspaces.list(filters);

      const formatted = workspaces.map((ws) => ({
        sid: ws.sid,
        friendlyName: ws.friendlyName,
        defaultActivityName: ws.defaultActivityName,
        timeoutActivityName: ws.timeoutActivityName,
        eventCallbackUrl: ws.eventCallbackUrl,
        dateCreated: ws.dateCreated,
        dateUpdated: ws.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formatted.length, workspaces: formatted }, null, 2),
        }],
      };
    }
  );

  const createWorkspace = createTool(
    'create_workspace',
    'Create a new TaskRouter workspace. Tier 2 operation — creates infrastructure.',
    z.object({
      friendlyName: z.string().describe('Workspace name'),
      eventCallbackUrl: z.string().url().optional().describe('URL for workspace events'),
      template: z.string().optional().describe('Template to use (e.g. "FIFO" for default queue/workflow)'),
    }),
    async ({ friendlyName, eventCallbackUrl, template }) => {
      const createParams: {
        friendlyName: string;
        eventCallbackUrl?: string;
        template?: string;
      } = { friendlyName };

      if (eventCallbackUrl) {createParams.eventCallbackUrl = eventCallbackUrl;}
      if (template) {createParams.template = template;}

      const workspace = await client.taskrouter.v1.workspaces.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: workspace.sid,
            friendlyName: workspace.friendlyName,
            defaultActivitySid: workspace.defaultActivitySid,
            defaultActivityName: workspace.defaultActivityName,
            timeoutActivitySid: workspace.timeoutActivitySid,
            timeoutActivityName: workspace.timeoutActivityName,
            dateCreated: workspace.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const getWorkspace = createTool(
    'get_workspace',
    'Get details of a specific TaskRouter workspace.',
    z.object({
      workspaceSid: z.string().startsWith('WS').describe('Workspace SID (starts with WS)'),
    }),
    async ({ workspaceSid }) => {
      const workspace = await client.taskrouter.v1.workspaces(workspaceSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: workspace.sid,
            friendlyName: workspace.friendlyName,
            defaultActivitySid: workspace.defaultActivitySid,
            defaultActivityName: workspace.defaultActivityName,
            timeoutActivitySid: workspace.timeoutActivitySid,
            timeoutActivityName: workspace.timeoutActivityName,
            eventCallbackUrl: workspace.eventCallbackUrl,
            dateCreated: workspace.dateCreated,
            dateUpdated: workspace.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateWorkspace = createTool(
    'update_workspace',
    'Update a TaskRouter workspace. Change name, callback URL, or default/timeout activities.',
    z.object({
      workspaceSid: z.string().startsWith('WS').describe('Workspace SID (starts with WS)'),
      friendlyName: z.string().optional().describe('New workspace name'),
      eventCallbackUrl: z.string().url().optional().describe('New event callback URL'),
      defaultActivitySid: z.string().startsWith('WA').optional().describe('Default activity SID for new workers'),
      timeoutActivitySid: z.string().startsWith('WA').optional().describe('Activity SID assigned on task timeout'),
    }),
    async ({ workspaceSid, friendlyName, eventCallbackUrl, defaultActivitySid, timeoutActivitySid }) => {
      const updateParams: {
        friendlyName?: string;
        eventCallbackUrl?: string;
        defaultActivitySid?: string;
        timeoutActivitySid?: string;
      } = {};

      if (friendlyName) {updateParams.friendlyName = friendlyName;}
      if (eventCallbackUrl) {updateParams.eventCallbackUrl = eventCallbackUrl;}
      if (defaultActivitySid) {updateParams.defaultActivitySid = defaultActivitySid;}
      if (timeoutActivitySid) {updateParams.timeoutActivitySid = timeoutActivitySid;}

      const workspace = await client.taskrouter.v1.workspaces(workspaceSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: workspace.sid,
            friendlyName: workspace.friendlyName,
            defaultActivitySid: workspace.defaultActivitySid,
            timeoutActivitySid: workspace.timeoutActivitySid,
            eventCallbackUrl: workspace.eventCallbackUrl,
            dateUpdated: workspace.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteWorkspace = createTool(
    'delete_workspace',
    'Delete a TaskRouter workspace. Tier 3 operation — permanently removes workspace and all child resources.',
    z.object({
      workspaceSid: z.string().startsWith('WS').describe('Workspace SID (starts with WS)'),
    }),
    async ({ workspaceSid }) => {
      await client.taskrouter.v1.workspaces(workspaceSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, deleted: workspaceSid }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // WORKER CRUD (create, get, delete — update already exists)
  // ============================================

  const createWorker = createTool(
    'create_worker',
    'Create a new worker in a TaskRouter workspace.',
    z.object({
      friendlyName: z.string().describe('Worker name'),
      attributes: z.record(z.any()).optional().describe('Worker attributes as JSON (e.g. skills, languages)'),
      activitySid: z.string().startsWith('WA').optional().describe('Initial activity SID (defaults to workspace default)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ friendlyName, attributes, activitySid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const createParams: {
        friendlyName: string;
        attributes?: string;
        activitySid?: string;
      } = { friendlyName };

      if (attributes) {createParams.attributes = JSON.stringify(attributes);}
      if (activitySid) {createParams.activitySid = activitySid;}

      const worker = await client.taskrouter.v1.workspaces(wsSid).workers.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: worker.sid,
            friendlyName: worker.friendlyName,
            available: worker.available,
            activityName: worker.activityName,
            activitySid: worker.activitySid,
            attributes: JSON.parse(worker.attributes),
            dateCreated: worker.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const getWorker = createTool(
    'get_worker',
    'Get details of a specific worker.',
    z.object({
      workerSid: z.string().startsWith('WK').describe('Worker SID (starts with WK)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ workerSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const worker = await client.taskrouter.v1.workspaces(wsSid).workers(workerSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: worker.sid,
            friendlyName: worker.friendlyName,
            available: worker.available,
            activityName: worker.activityName,
            activitySid: worker.activitySid,
            attributes: JSON.parse(worker.attributes),
            dateCreated: worker.dateCreated,
            dateUpdated: worker.dateUpdated,
            dateStatusChanged: worker.dateStatusChanged,
          }, null, 2),
        }],
      };
    }
  );

  const deleteWorker = createTool(
    'delete_worker',
    'Delete a worker from a TaskRouter workspace. Tier 3 operation.',
    z.object({
      workerSid: z.string().startsWith('WK').describe('Worker SID (starts with WK)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ workerSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      await client.taskrouter.v1.workspaces(wsSid).workers(workerSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, deleted: workerSid }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // WORKFLOW CRUD (create, get, update, delete — list already exists)
  // ============================================

  const createWorkflow = createTool(
    'create_workflow',
    'Create a new workflow in a TaskRouter workspace. Workflows define routing rules for tasks.',
    z.object({
      friendlyName: z.string().describe('Workflow name'),
      configuration: z.string().describe('Workflow configuration JSON string (task_routing filters)'),
      assignmentCallbackUrl: z.string().url().optional().describe('URL called when task is assigned to worker'),
      fallbackAssignmentCallbackUrl: z.string().url().optional().describe('Fallback URL if primary fails'),
      taskReservationTimeout: z.number().min(1).optional().describe('Seconds before reservation times out (default 120)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ friendlyName, configuration, assignmentCallbackUrl, fallbackAssignmentCallbackUrl, taskReservationTimeout, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const createParams: {
        friendlyName: string;
        configuration: string;
        assignmentCallbackUrl?: string;
        fallbackAssignmentCallbackUrl?: string;
        taskReservationTimeout?: number;
      } = { friendlyName, configuration };

      if (assignmentCallbackUrl) {createParams.assignmentCallbackUrl = assignmentCallbackUrl;}
      if (fallbackAssignmentCallbackUrl) {createParams.fallbackAssignmentCallbackUrl = fallbackAssignmentCallbackUrl;}
      if (taskReservationTimeout) {createParams.taskReservationTimeout = taskReservationTimeout;}

      const workflow = await client.taskrouter.v1.workspaces(wsSid).workflows.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: workflow.sid,
            friendlyName: workflow.friendlyName,
            assignmentCallbackUrl: workflow.assignmentCallbackUrl,
            taskReservationTimeout: workflow.taskReservationTimeout,
            dateCreated: workflow.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const getWorkflow = createTool(
    'get_workflow',
    'Get details of a specific workflow, including its routing configuration.',
    z.object({
      workflowSid: z.string().startsWith('WW').describe('Workflow SID (starts with WW)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ workflowSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const workflow = await client.taskrouter.v1.workspaces(wsSid).workflows(workflowSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: workflow.sid,
            friendlyName: workflow.friendlyName,
            configuration: workflow.configuration,
            assignmentCallbackUrl: workflow.assignmentCallbackUrl,
            fallbackAssignmentCallbackUrl: workflow.fallbackAssignmentCallbackUrl,
            taskReservationTimeout: workflow.taskReservationTimeout,
            dateCreated: workflow.dateCreated,
            dateUpdated: workflow.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const updateWorkflow = createTool(
    'update_workflow',
    'Update a workflow in TaskRouter. Change routing configuration, callbacks, or timeout.',
    z.object({
      workflowSid: z.string().startsWith('WW').describe('Workflow SID (starts with WW)'),
      friendlyName: z.string().optional().describe('New workflow name'),
      configuration: z.string().optional().describe('New workflow configuration JSON string'),
      assignmentCallbackUrl: z.string().url().optional().describe('New assignment callback URL'),
      fallbackAssignmentCallbackUrl: z.string().url().optional().describe('New fallback URL'),
      taskReservationTimeout: z.number().min(1).optional().describe('New reservation timeout in seconds'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ workflowSid, friendlyName, configuration, assignmentCallbackUrl, fallbackAssignmentCallbackUrl, taskReservationTimeout, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const updateParams: {
        friendlyName?: string;
        configuration?: string;
        assignmentCallbackUrl?: string;
        fallbackAssignmentCallbackUrl?: string;
        taskReservationTimeout?: number;
      } = {};

      if (friendlyName) {updateParams.friendlyName = friendlyName;}
      if (configuration) {updateParams.configuration = configuration;}
      if (assignmentCallbackUrl) {updateParams.assignmentCallbackUrl = assignmentCallbackUrl;}
      if (fallbackAssignmentCallbackUrl) {updateParams.fallbackAssignmentCallbackUrl = fallbackAssignmentCallbackUrl;}
      if (taskReservationTimeout) {updateParams.taskReservationTimeout = taskReservationTimeout;}

      const workflow = await client.taskrouter.v1.workspaces(wsSid).workflows(workflowSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: workflow.sid,
            friendlyName: workflow.friendlyName,
            assignmentCallbackUrl: workflow.assignmentCallbackUrl,
            taskReservationTimeout: workflow.taskReservationTimeout,
            dateUpdated: workflow.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteWorkflow = createTool(
    'delete_workflow',
    'Delete a workflow from a TaskRouter workspace. Tier 3 operation.',
    z.object({
      workflowSid: z.string().startsWith('WW').describe('Workflow SID (starts with WW)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ workflowSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      await client.taskrouter.v1.workspaces(wsSid).workflows(workflowSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, deleted: workflowSid }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // TASK QUEUE CUD (create, update, delete — list and get already exist)
  // ============================================

  const createTaskQueue = createTool(
    'create_task_queue',
    'Create a new task queue in a TaskRouter workspace.',
    z.object({
      friendlyName: z.string().describe('Queue name'),
      targetWorkers: z.string().optional().describe('Worker selection expression (e.g. "skills HAS \'support\'")'),
      maxReservedWorkers: z.number().min(1).optional().describe('Max workers to reserve simultaneously (default 1)'),
      taskOrder: z.enum(['FIFO', 'LIFO']).optional().describe('Task ordering (default FIFO)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ friendlyName, targetWorkers, maxReservedWorkers, taskOrder, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const createParams: {
        friendlyName: string;
        targetWorkers?: string;
        maxReservedWorkers?: number;
        taskOrder?: TaskQueueTaskOrder;
      } = { friendlyName };

      if (targetWorkers) {createParams.targetWorkers = targetWorkers;}
      if (maxReservedWorkers) {createParams.maxReservedWorkers = maxReservedWorkers;}
      if (taskOrder) {createParams.taskOrder = taskOrder as TaskQueueTaskOrder;}

      const queue = await client.taskrouter.v1.workspaces(wsSid).taskQueues.create(createParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: queue.sid,
            friendlyName: queue.friendlyName,
            targetWorkers: queue.targetWorkers,
            maxReservedWorkers: queue.maxReservedWorkers,
            taskOrder: queue.taskOrder,
            dateCreated: queue.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateTaskQueue = createTool(
    'update_task_queue',
    'Update a task queue in TaskRouter. Change name, target workers expression, or task ordering.',
    z.object({
      taskQueueSid: z.string().startsWith('WQ').describe('Task Queue SID (starts with WQ)'),
      friendlyName: z.string().optional().describe('New queue name'),
      targetWorkers: z.string().optional().describe('New worker selection expression'),
      maxReservedWorkers: z.number().min(1).optional().describe('New max reserved workers'),
      taskOrder: z.enum(['FIFO', 'LIFO']).optional().describe('New task ordering'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ taskQueueSid, friendlyName, targetWorkers, maxReservedWorkers, taskOrder, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const updateParams: {
        friendlyName?: string;
        targetWorkers?: string;
        maxReservedWorkers?: number;
        taskOrder?: TaskQueueTaskOrder;
      } = {};

      if (friendlyName) {updateParams.friendlyName = friendlyName;}
      if (targetWorkers) {updateParams.targetWorkers = targetWorkers;}
      if (maxReservedWorkers) {updateParams.maxReservedWorkers = maxReservedWorkers;}
      if (taskOrder) {updateParams.taskOrder = taskOrder as TaskQueueTaskOrder;}

      const queue = await client.taskrouter.v1.workspaces(wsSid).taskQueues(taskQueueSid).update(updateParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: queue.sid,
            friendlyName: queue.friendlyName,
            targetWorkers: queue.targetWorkers,
            maxReservedWorkers: queue.maxReservedWorkers,
            taskOrder: queue.taskOrder,
            dateUpdated: queue.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteTaskQueue = createTool(
    'delete_task_queue',
    'Delete a task queue from a TaskRouter workspace. Tier 3 operation.',
    z.object({
      taskQueueSid: z.string().startsWith('WQ').describe('Task Queue SID (starts with WQ)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ taskQueueSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      await client.taskrouter.v1.workspaces(wsSid).taskQueues(taskQueueSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, deleted: taskQueueSid }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // ACTIVITY CREATE (list already exists)
  // ============================================

  const createActivity = createTool(
    'create_activity',
    'Create a new activity in a TaskRouter workspace. Activities represent worker states (e.g. Break, Training).',
    z.object({
      friendlyName: z.string().describe('Activity name (e.g. "Break", "Training", "Lunch")'),
      available: z.boolean().describe('Whether workers in this activity are available for task assignment'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ friendlyName, available, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      const activity = await client.taskrouter.v1.workspaces(wsSid).activities.create({
        friendlyName,
        available,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: activity.sid,
            friendlyName: activity.friendlyName,
            available: activity.available,
            dateCreated: activity.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  // ============================================
  // TASK DELETE (create, list, get, update already exist)
  // ============================================

  const deleteTask = createTool(
    'delete_task',
    'Delete a task from a TaskRouter workspace. Tier 3 operation.',
    z.object({
      taskSid: z.string().startsWith('WT').describe('Task SID (starts with WT)'),
      workspaceSid: z.string().startsWith('WS').optional().describe('Workspace SID (uses default if not provided)'),
    }),
    async ({ taskSid, workspaceSid }) => {
      const wsSid = workspaceSid || taskrouterWorkspaceSid;
      if (!wsSid) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: 'No TaskRouter Workspace SID configured' }, null, 2),
          }],
          isError: true,
        };
      }

      await client.taskrouter.v1.workspaces(wsSid).tasks(taskSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, deleted: taskSid }, null, 2),
        }],
      };
    }
  );

  return [
    // Workspace management
    listWorkspaces, createWorkspace, getWorkspace, updateWorkspace, deleteWorkspace,
    // Task CRUD
    createTask, listTasks, getTaskStatus, updateTask, deleteTask,
    // Worker CRUD
    createWorker, listWorkers, getWorker, updateWorker, deleteWorker,
    // Workflow CRUD
    createWorkflow, listWorkflows, getWorkflow, updateWorkflow, deleteWorkflow,
    // Task Queue CRUD
    createTaskQueue, listTaskQueues, getTaskQueue, updateTaskQueue, deleteTaskQueue,
    getQueueStatistics,
    // Activity management
    createActivity, listActivities,
    // Reservation management
    listReservations, updateReservation,
  ];
}
