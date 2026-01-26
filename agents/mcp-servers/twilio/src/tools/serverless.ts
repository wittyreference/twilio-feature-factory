// ABOUTME: Twilio Serverless tools for Functions and Assets management.
// ABOUTME: Provides list_services, list_functions, and create_build tools.

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
 * Returns all Serverless-related tools configured with the given Twilio context.
 */
export function serverlessTools(context: TwilioContext) {
  const { client } = context;

  const listServices = createTool(
    'list_services',
    'List all Serverless services in the account.',
    z.object({
      limit: z.number().min(1).max(100).default(20).describe('Maximum number of services to return'),
    }),
    async ({ limit }) => {
      const services = await client.serverless.v1.services.list({ limit });

      const result = services.map(service => ({
        sid: service.sid,
        uniqueName: service.uniqueName,
        friendlyName: service.friendlyName,
        includeCredentials: service.includeCredentials,
        uiEditable: service.uiEditable,
        domainBase: service.domainBase,
        dateCreated: service.dateCreated,
        dateUpdated: service.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            services: result,
          }, null, 2),
        }],
      };
    }
  );

  const listFunctions = createTool(
    'list_functions',
    'List all functions in a Serverless service.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum number of functions to return'),
    }),
    async ({ serviceSid, limit }) => {
      const functions = await client.serverless.v1
        .services(serviceSid)
        .functions.list({ limit });

      const result = functions.map(fn => ({
        sid: fn.sid,
        friendlyName: fn.friendlyName,
        dateCreated: fn.dateCreated,
        dateUpdated: fn.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            functions: result,
          }, null, 2),
        }],
      };
    }
  );

  const listEnvironments = createTool(
    'list_environments',
    'List all environments (deployments) for a Serverless service.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      limit: z.number().min(1).max(20).default(10).describe('Maximum number of environments to return'),
    }),
    async ({ serviceSid, limit }) => {
      const environments = await client.serverless.v1
        .services(serviceSid)
        .environments.list({ limit });

      const result = environments.map(env => ({
        sid: env.sid,
        uniqueName: env.uniqueName,
        domainSuffix: env.domainSuffix,
        domainName: env.domainName,
        buildSid: env.buildSid,
        dateCreated: env.dateCreated,
        dateUpdated: env.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            environments: result,
          }, null, 2),
        }],
      };
    }
  );

  const getBuildStatus = createTool(
    'get_build_status',
    'Get the status of a Serverless build.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      buildSid: z.string().startsWith('ZB').describe('Build SID (starts with ZB)'),
    }),
    async ({ serviceSid, buildSid }) => {
      const build = await client.serverless.v1
        .services(serviceSid)
        .builds(buildSid)
        .fetch();

      // Get build status
      const buildStatus = await client.serverless.v1
        .services(serviceSid)
        .builds(buildSid)
        .buildStatus()
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: build.sid,
            serviceSid: build.serviceSid,
            status: buildStatus.status,
            assetVersions: build.assetVersions,
            functionVersions: build.functionVersions,
            dependencies: build.dependencies,
            runtime: build.runtime,
            dateCreated: build.dateCreated,
            dateUpdated: build.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  return [listServices, listFunctions, listEnvironments, getBuildStatus];
}
