// ABOUTME: Twilio Studio v2 tools for flow management.
// ABOUTME: Provides comprehensive flow and execution management tools.

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
 * Returns all Studio-related tools configured with the given Twilio context.
 */
export function studioTools(context: TwilioContext) {
  const { client } = context;

  const listStudioFlows = createTool(
    'list_studio_flows',
    'List all Studio flows in the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum number of flows to return'),
    }),
    async ({ limit }) => {
      const flows = await client.studio.v2.flows.list({ limit });

      const result = flows.map(flow => ({
        sid: flow.sid,
        friendlyName: flow.friendlyName,
        status: flow.status,
        revision: flow.revision,
        dateCreated: flow.dateCreated,
        dateUpdated: flow.dateUpdated,
        webhookUrl: flow.webhookUrl,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            flows: result,
          }, null, 2),
        }],
      };
    }
  );

  const triggerFlow = createTool(
    'trigger_flow',
    'Trigger a Studio flow execution via the REST API.',
    z.object({
      flowSid: z.string().startsWith('FW').describe('Studio Flow SID (starts with FW)'),
      to: z.string().describe('Phone number or contact to run the flow for (E.164)'),
      from: z.string().optional().describe('From phone number (E.164). Uses default if not provided'),
      parameters: z.record(z.string()).optional().describe('Optional parameters to pass to the flow'),
    }),
    async ({ flowSid, to, from, parameters }) => {
      const fromNumber = from || context.defaultFromNumber;

      const executionParams: {
        to: string;
        from: string;
        parameters?: object;
      } = {
        to,
        from: fromNumber,
      };

      if (parameters) {
        executionParams.parameters = parameters;
      }

      const execution = await client.studio.v2
        .flows(flowSid)
        .executions.create(executionParams);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: execution.sid,
            flowSid: execution.flowSid,
            status: execution.status,
            contactChannelAddress: execution.contactChannelAddress,
            dateCreated: execution.dateCreated,
            dateUpdated: execution.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const getExecutionStatus = createTool(
    'get_execution_status',
    'Get the status and details of a Studio flow execution.',
    z.object({
      flowSid: z.string().startsWith('FW').describe('Studio Flow SID (starts with FW)'),
      executionSid: z.string().startsWith('FN').describe('Execution SID (starts with FN)'),
      includeSteps: z.boolean().default(false).describe('Whether to include execution step details'),
    }),
    async ({ flowSid, executionSid, includeSteps }) => {
      const execution = await client.studio.v2
        .flows(flowSid)
        .executions(executionSid)
        .fetch();

      const result: Record<string, unknown> = {
        success: true,
        sid: execution.sid,
        flowSid: execution.flowSid,
        status: execution.status,
        contactChannelAddress: execution.contactChannelAddress,
        context: execution.context,
        dateCreated: execution.dateCreated,
        dateUpdated: execution.dateUpdated,
      };

      if (includeSteps) {
        const steps = await client.studio.v2
          .flows(flowSid)
          .executions(executionSid)
          .steps.list({ limit: 50 });

        result.steps = steps.map(step => ({
          sid: step.sid,
          name: step.name,
          transitionedFrom: step.transitionedFrom,
          transitionedTo: step.transitionedTo,
          dateCreated: step.dateCreated,
          dateUpdated: step.dateUpdated,
        }));
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  const getFlow = createTool(
    'get_flow',
    'Get details of a specific Studio flow.',
    z.object({
      flowSid: z.string().startsWith('FW').describe('Studio Flow SID (starts with FW)'),
    }),
    async ({ flowSid }) => {
      const flow = await client.studio.v2.flows(flowSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: flow.sid,
            friendlyName: flow.friendlyName,
            status: flow.status,
            revision: flow.revision,
            commitMessage: flow.commitMessage,
            valid: flow.valid,
            errors: flow.errors,
            webhookUrl: flow.webhookUrl,
            dateCreated: flow.dateCreated,
            dateUpdated: flow.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listExecutions = createTool(
    'list_executions',
    'List executions for a Studio flow.',
    z.object({
      flowSid: z.string().startsWith('FW').describe('Studio Flow SID (starts with FW)'),
      status: z.enum(['active', 'ended']).optional().describe('Filter by execution status'),
      dateCreatedFrom: z.string().optional().describe('Filter by creation date (ISO 8601)'),
      dateCreatedTo: z.string().optional().describe('Filter by creation date (ISO 8601)'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum executions to return'),
    }),
    async ({ flowSid, status, dateCreatedFrom, dateCreatedTo, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (status) params.status = status;
      if (dateCreatedFrom) params.dateCreatedFrom = new Date(dateCreatedFrom);
      if (dateCreatedTo) params.dateCreatedTo = new Date(dateCreatedTo);

      const executions = await client.studio.v2
        .flows(flowSid)
        .executions.list(params);

      const result = executions.map(e => ({
        sid: e.sid,
        status: e.status,
        contactChannelAddress: e.contactChannelAddress,
        dateCreated: e.dateCreated,
        dateUpdated: e.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            flowSid,
            count: result.length,
            executions: result,
          }, null, 2),
        }],
      };
    }
  );

  const deleteExecution = createTool(
    'delete_execution',
    'Delete a Studio flow execution.',
    z.object({
      flowSid: z.string().startsWith('FW').describe('Studio Flow SID (starts with FW)'),
      executionSid: z.string().startsWith('FN').describe('Execution SID (starts with FN)'),
    }),
    async ({ flowSid, executionSid }) => {
      await client.studio.v2
        .flows(flowSid)
        .executions(executionSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            flowSid,
            executionSid,
          }, null, 2),
        }],
      };
    }
  );

  const getExecutionContext = createTool(
    'get_execution_context',
    'Get the context (variables and data) of a Studio execution.',
    z.object({
      flowSid: z.string().startsWith('FW').describe('Studio Flow SID (starts with FW)'),
      executionSid: z.string().startsWith('FN').describe('Execution SID (starts with FN)'),
    }),
    async ({ flowSid, executionSid }) => {
      const context = await client.studio.v2
        .flows(flowSid)
        .executions(executionSid)
        .executionContext()
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            flowSid,
            executionSid,
            context: context.context,
          }, null, 2),
        }],
      };
    }
  );

  const listExecutionSteps = createTool(
    'list_execution_steps',
    'List all steps in a Studio execution.',
    z.object({
      flowSid: z.string().startsWith('FW').describe('Studio Flow SID (starts with FW)'),
      executionSid: z.string().startsWith('FN').describe('Execution SID (starts with FN)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum steps to return'),
    }),
    async ({ flowSid, executionSid, limit }) => {
      const steps = await client.studio.v2
        .flows(flowSid)
        .executions(executionSid)
        .steps.list({ limit });

      const result = steps.map(step => ({
        sid: step.sid,
        name: step.name,
        transitionedFrom: step.transitionedFrom,
        transitionedTo: step.transitionedTo,
        dateCreated: step.dateCreated,
        dateUpdated: step.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            flowSid,
            executionSid,
            count: result.length,
            steps: result,
          }, null, 2),
        }],
      };
    }
  );

  const getStepContext = createTool(
    'get_step_context',
    'Get the context (input/output) of a specific execution step.',
    z.object({
      flowSid: z.string().startsWith('FW').describe('Studio Flow SID (starts with FW)'),
      executionSid: z.string().startsWith('FN').describe('Execution SID (starts with FN)'),
      stepSid: z.string().startsWith('FT').describe('Step SID (starts with FT)'),
    }),
    async ({ flowSid, executionSid, stepSid }) => {
      const stepContext = await client.studio.v2
        .flows(flowSid)
        .executions(executionSid)
        .steps(stepSid)
        .stepContext()
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            flowSid,
            executionSid,
            stepSid,
            context: stepContext.context,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listStudioFlows,
    getFlow,
    triggerFlow,
    listExecutions,
    getExecutionStatus,
    deleteExecution,
    getExecutionContext,
    listExecutionSteps,
    getStepContext,
  ];
}
