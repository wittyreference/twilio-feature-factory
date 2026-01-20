// ABOUTME: Twilio TaskRouter tools for skills-based routing.
// ABOUTME: Provides create_task, list_tasks, get_task_status, list_workers, and list_workflows tools.

import { z } from 'zod';
import type { TwilioContext } from '../index.js';

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

      if (workflowSid) createParams.workflowSid = workflowSid;
      if (timeout) createParams.timeout = timeout;
      if (priority !== undefined) createParams.priority = priority;

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

      const filters: { assignmentStatus?: string; limit: number } = { limit: limit || 20 };
      if (assignmentStatus) filters.assignmentStatus = assignmentStatus;

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

      const filters: { available?: boolean; activityName?: string; limit: number } = { limit: limit || 20 };
      if (available !== undefined) filters.available = available;
      if (activityName) filters.activityName = activityName;

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

  return [createTask, listTasks, getTaskStatus, listWorkers, listWorkflows];
}
