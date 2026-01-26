// ABOUTME: Twilio Studio v2 tools for flow management.
// ABOUTME: Provides list_studio_flows, trigger_flow, and get_execution_status tools.

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

  return [listStudioFlows, triggerFlow, getExecutionStatus];
}
