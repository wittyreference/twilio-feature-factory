// ABOUTME: Twilio TaskRouter tools for skills-based routing.
// ABOUTME: Provides 13 tools: task CRUD, workers, workflows, task queues, activities, and reservations.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';
import type { TaskStatus } from 'twilio/lib/rest/taskrouter/v1/workspace/task.js';
import type { ReservationStatus } from 'twilio/lib/rest/taskrouter/v1/workspace/task/reservation.js';

function createTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  handler: (params: z.infer<T>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
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

  return [
    createTask, listTasks, getTaskStatus, listWorkers, listWorkflows,
    updateTask, listTaskQueues, getTaskQueue, getQueueStatistics,
    listActivities, updateWorker, listReservations, updateReservation,
  ];
}
