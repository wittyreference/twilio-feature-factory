// ABOUTME: Twilio Serverless tools for Functions and Assets management.
// ABOUTME: Provides comprehensive service, function, build, asset, and variable management.

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

  const getService = createTool(
    'get_service',
    'Get details of a specific Serverless service.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
    }),
    async ({ serviceSid }) => {
      const service = await client.serverless.v1.services(serviceSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: service.sid,
            uniqueName: service.uniqueName,
            friendlyName: service.friendlyName,
            includeCredentials: service.includeCredentials,
            uiEditable: service.uiEditable,
            domainBase: service.domainBase,
            dateCreated: service.dateCreated,
            dateUpdated: service.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listBuilds = createTool(
    'list_builds',
    'List builds for a Serverless service.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      limit: z.number().min(1).max(50).default(20).describe('Maximum builds to return'),
    }),
    async ({ serviceSid, limit }) => {
      const builds = await client.serverless.v1
        .services(serviceSid)
        .builds.list({ limit });

      const result = builds.map(b => ({
        sid: b.sid,
        status: b.status,
        runtime: b.runtime,
        dateCreated: b.dateCreated,
        dateUpdated: b.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            builds: result,
          }, null, 2),
        }],
      };
    }
  );

  const getFunction = createTool(
    'get_function',
    'Get details of a specific function.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      functionSid: z.string().startsWith('ZH').describe('Function SID (starts with ZH)'),
    }),
    async ({ serviceSid, functionSid }) => {
      const fn = await client.serverless.v1
        .services(serviceSid)
        .functions(functionSid)
        .fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: fn.sid,
            friendlyName: fn.friendlyName,
            dateCreated: fn.dateCreated,
            dateUpdated: fn.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listFunctionVersions = createTool(
    'list_function_versions',
    'List versions of a function.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      functionSid: z.string().startsWith('ZH').describe('Function SID (starts with ZH)'),
      limit: z.number().min(1).max(50).default(20).describe('Maximum versions to return'),
    }),
    async ({ serviceSid, functionSid, limit }) => {
      const versions = await client.serverless.v1
        .services(serviceSid)
        .functions(functionSid)
        .functionVersions.list({ limit });

      const result = versions.map(v => ({
        sid: v.sid,
        path: v.path,
        visibility: v.visibility,
        dateCreated: v.dateCreated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            functionSid,
            count: result.length,
            versions: result,
          }, null, 2),
        }],
      };
    }
  );

  const listAssets = createTool(
    'list_assets',
    'List assets in a Serverless service.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum assets to return'),
    }),
    async ({ serviceSid, limit }) => {
      const assets = await client.serverless.v1
        .services(serviceSid)
        .assets.list({ limit });

      const result = assets.map(a => ({
        sid: a.sid,
        friendlyName: a.friendlyName,
        dateCreated: a.dateCreated,
        dateUpdated: a.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            count: result.length,
            assets: result,
          }, null, 2),
        }],
      };
    }
  );

  const listAssetVersions = createTool(
    'list_asset_versions',
    'List versions of an asset.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      assetSid: z.string().startsWith('ZH').describe('Asset SID (starts with ZH)'),
      limit: z.number().min(1).max(50).default(20).describe('Maximum versions to return'),
    }),
    async ({ serviceSid, assetSid, limit }) => {
      const versions = await client.serverless.v1
        .services(serviceSid)
        .assets(assetSid)
        .assetVersions.list({ limit });

      const result = versions.map(v => ({
        sid: v.sid,
        path: v.path,
        visibility: v.visibility,
        dateCreated: v.dateCreated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            assetSid,
            count: result.length,
            versions: result,
          }, null, 2),
        }],
      };
    }
  );

  const listVariables = createTool(
    'list_variables',
    'List environment variables for an environment.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      environmentSid: z.string().startsWith('ZE').describe('Environment SID (starts with ZE)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum variables to return'),
    }),
    async ({ serviceSid, environmentSid, limit }) => {
      const variables = await client.serverless.v1
        .services(serviceSid)
        .environments(environmentSid)
        .variables.list({ limit });

      const result = variables.map(v => ({
        sid: v.sid,
        key: v.key,
        value: v.value,
        dateCreated: v.dateCreated,
        dateUpdated: v.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            environmentSid,
            count: result.length,
            variables: result,
          }, null, 2),
        }],
      };
    }
  );

  const createVariable = createTool(
    'create_variable',
    'Create an environment variable.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      environmentSid: z.string().startsWith('ZE').describe('Environment SID (starts with ZE)'),
      key: z.string().describe('Variable name'),
      value: z.string().describe('Variable value'),
    }),
    async ({ serviceSid, environmentSid, key, value }) => {
      const variable = await client.serverless.v1
        .services(serviceSid)
        .environments(environmentSid)
        .variables.create({ key, value });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: variable.sid,
            key: variable.key,
            value: variable.value,
            dateCreated: variable.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateVariable = createTool(
    'update_variable',
    'Update an environment variable.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      environmentSid: z.string().startsWith('ZE').describe('Environment SID (starts with ZE)'),
      variableSid: z.string().startsWith('ZV').describe('Variable SID (starts with ZV)'),
      key: z.string().optional().describe('New variable name'),
      value: z.string().optional().describe('New variable value'),
    }),
    async ({ serviceSid, environmentSid, variableSid, key, value }) => {
      const params: Record<string, string> = {};
      if (key) {params.key = key;}
      if (value) {params.value = value;}

      const variable = await client.serverless.v1
        .services(serviceSid)
        .environments(environmentSid)
        .variables(variableSid)
        .update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: variable.sid,
            key: variable.key,
            value: variable.value,
            dateUpdated: variable.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteVariable = createTool(
    'delete_variable',
    'Delete an environment variable.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      environmentSid: z.string().startsWith('ZE').describe('Environment SID (starts with ZE)'),
      variableSid: z.string().startsWith('ZV').describe('Variable SID (starts with ZV)'),
    }),
    async ({ serviceSid, environmentSid, variableSid }) => {
      await client.serverless.v1
        .services(serviceSid)
        .environments(environmentSid)
        .variables(variableSid)
        .remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            serviceSid,
            environmentSid,
            variableSid,
          }, null, 2),
        }],
      };
    }
  );

  const listLogs = createTool(
    'list_logs',
    'List deployment logs for an environment.',
    z.object({
      serviceSid: z.string().startsWith('ZS').describe('Serverless Service SID (starts with ZS)'),
      environmentSid: z.string().startsWith('ZE').describe('Environment SID (starts with ZE)'),
      functionSid: z.string().startsWith('ZH').optional().describe('Filter by Function SID'),
      startDate: z.string().optional().describe('Filter logs from this date (ISO 8601)'),
      endDate: z.string().optional().describe('Filter logs until this date (ISO 8601)'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum logs to return'),
    }),
    async ({ serviceSid, environmentSid, functionSid, startDate, endDate, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (functionSid) {params.functionSid = functionSid;}
      if (startDate) {params.startDate = new Date(startDate);}
      if (endDate) {params.endDate = new Date(endDate);}

      const logs = await client.serverless.v1
        .services(serviceSid)
        .environments(environmentSid)
        .logs.list(params);

      const result = logs.map(log => ({
        sid: log.sid,
        level: log.level,
        message: log.message,
        functionSid: log.functionSid,
        requestSid: log.requestSid,
        dateCreated: log.dateCreated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            serviceSid,
            environmentSid,
            count: result.length,
            logs: result,
          }, null, 2),
        }],
      };
    }
  );

  return [
    listServices,
    getService,
    listFunctions,
    getFunction,
    listFunctionVersions,
    listEnvironments,
    listBuilds,
    getBuildStatus,
    listAssets,
    listAssetVersions,
    listVariables,
    createVariable,
    updateVariable,
    deleteVariable,
    listLogs,
  ];
}
