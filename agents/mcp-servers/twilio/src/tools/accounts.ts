// ABOUTME: Twilio Account management tools for subaccounts and usage.
// ABOUTME: Provides account CRUD, usage records, triggers, and balance queries.

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
 * Returns all Account management tools configured with the given Twilio context.
 */
export function accountsTools(context: TwilioContext) {
  const { client } = context;

  // ============ Accounts ============

  const getAccount = createTool(
    'get_account',
    'Get details of the current account or a subaccount.',
    z.object({
      accountSid: z.string().startsWith('AC').optional().describe('Account SID (defaults to current account)'),
    }),
    async ({ accountSid }) => {
      const account = accountSid
        ? await client.api.v2010.accounts(accountSid).fetch()
        : await client.api.v2010.accounts(client.accountSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: account.sid,
            friendlyName: account.friendlyName,
            status: account.status,
            type: account.type,
            ownerAccountSid: account.ownerAccountSid,
            dateCreated: account.dateCreated,
            dateUpdated: account.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const listAccounts = createTool(
    'list_accounts',
    'List subaccounts under the current account.',
    z.object({
      friendlyName: z.string().optional().describe('Filter by friendly name'),
      status: z.enum(['active', 'suspended', 'closed']).optional().describe('Filter by status'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum accounts to return'),
    }),
    async ({ friendlyName, status, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (friendlyName) {params.friendlyName = friendlyName;}
      if (status) {params.status = status;}

      const accounts = await client.api.v2010.accounts.list(params);

      const result = accounts.map(a => ({
        sid: a.sid,
        friendlyName: a.friendlyName,
        status: a.status,
        type: a.type,
        ownerAccountSid: a.ownerAccountSid,
        dateCreated: a.dateCreated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            accounts: result,
          }, null, 2),
        }],
      };
    }
  );

  const createSubaccount = createTool(
    'create_subaccount',
    'Create a new subaccount.',
    z.object({
      friendlyName: z.string().describe('Friendly name for the subaccount'),
    }),
    async ({ friendlyName }) => {
      const account = await client.api.v2010.accounts.create({ friendlyName });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: account.sid,
            friendlyName: account.friendlyName,
            status: account.status,
            type: account.type,
            authToken: account.authToken,
            dateCreated: account.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const updateAccount = createTool(
    'update_account',
    'Update an account (change name or suspend/close).',
    z.object({
      accountSid: z.string().startsWith('AC').describe('Account SID to update'),
      friendlyName: z.string().optional().describe('New friendly name'),
      status: z.enum(['active', 'suspended', 'closed']).optional().describe('New status'),
    }),
    async ({ accountSid, friendlyName, status }) => {
      const params: Record<string, unknown> = {};
      if (friendlyName) {params.friendlyName = friendlyName;}
      if (status) {params.status = status;}

      const account = await client.api.v2010.accounts(accountSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: account.sid,
            friendlyName: account.friendlyName,
            status: account.status,
            dateUpdated: account.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Usage Records ============

  const listUsageRecords = createTool(
    'list_usage_records',
    'List usage records for the account.',
    z.object({
      category: z.string().optional().describe('Filter by category (e.g., sms, calls, recordings)'),
      startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
      includeSubaccounts: z.boolean().default(false).describe('Include subaccount usage'),
      limit: z.number().min(1).max(100).default(50).describe('Maximum records to return'),
    }),
    async ({ category, startDate, endDate, includeSubaccounts, limit }) => {
      const params: Record<string, unknown> = { limit, includeSubaccounts };
      if (category) {params.category = category;}
      if (startDate) {params.startDate = new Date(startDate);}
      if (endDate) {params.endDate = new Date(endDate);}

      const records = await client.usage.records.list(params);

      const result = records.map(r => ({
        category: r.category,
        description: r.description,
        count: r.count,
        countUnit: r.countUnit,
        usage: r.usage,
        usageUnit: r.usageUnit,
        price: r.price,
        priceUnit: r.priceUnit,
        startDate: r.startDate,
        endDate: r.endDate,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            usageRecords: result,
          }, null, 2),
        }],
      };
    }
  );

  const listUsageRecordsDaily = createTool(
    'list_usage_records_daily',
    'List daily usage records for the account.',
    z.object({
      category: z.string().optional().describe('Filter by category'),
      startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
      limit: z.number().min(1).max(100).default(30).describe('Maximum records to return'),
    }),
    async ({ category, startDate, endDate, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (category) {params.category = category;}
      if (startDate) {params.startDate = new Date(startDate);}
      if (endDate) {params.endDate = new Date(endDate);}

      const records = await client.usage.records.daily.list(params);

      const result = records.map(r => ({
        category: r.category,
        description: r.description,
        count: r.count,
        usage: r.usage,
        price: r.price,
        priceUnit: r.priceUnit,
        startDate: r.startDate,
        endDate: r.endDate,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            dailyRecords: result,
          }, null, 2),
        }],
      };
    }
  );

  const listUsageRecordsMonthly = createTool(
    'list_usage_records_monthly',
    'List monthly usage records for the account.',
    z.object({
      category: z.string().optional().describe('Filter by category'),
      startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
      limit: z.number().min(1).max(100).default(12).describe('Maximum records to return'),
    }),
    async ({ category, startDate, endDate, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (category) {params.category = category;}
      if (startDate) {params.startDate = new Date(startDate);}
      if (endDate) {params.endDate = new Date(endDate);}

      const records = await client.usage.records.monthly.list(params);

      const result = records.map(r => ({
        category: r.category,
        description: r.description,
        count: r.count,
        usage: r.usage,
        price: r.price,
        priceUnit: r.priceUnit,
        startDate: r.startDate,
        endDate: r.endDate,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            monthlyRecords: result,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Usage Triggers ============

  const listUsageTriggers = createTool(
    'list_usage_triggers',
    'List usage triggers for the account.',
    z.object({
      recurring: z.enum(['daily', 'monthly', 'yearly', 'alltime']).optional().describe('Filter by recurring type'),
      triggerBy: z.enum(['count', 'usage', 'price']).optional().describe('Filter by trigger type'),
      usageCategory: z.string().optional().describe('Filter by usage category'),
      limit: z.number().min(1).max(100).default(20).describe('Maximum triggers to return'),
    }),
    async ({ recurring, triggerBy, usageCategory, limit }) => {
      const params: Record<string, unknown> = { limit };
      if (recurring) {params.recurring = recurring;}
      if (triggerBy) {params.triggerBy = triggerBy;}
      if (usageCategory) {params.usageCategory = usageCategory;}

      const triggers = await client.usage.triggers.list(params);

      const result = triggers.map(t => ({
        sid: t.sid,
        friendlyName: t.friendlyName,
        recurring: t.recurring,
        usageCategory: t.usageCategory,
        triggerBy: t.triggerBy,
        triggerValue: t.triggerValue,
        currentValue: t.currentValue,
        callbackUrl: t.callbackUrl,
        callbackMethod: t.callbackMethod,
        dateCreated: t.dateCreated,
        dateFired: t.dateFired,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            count: result.length,
            usageTriggers: result,
          }, null, 2),
        }],
      };
    }
  );

  const createUsageTrigger = createTool(
    'create_usage_trigger',
    'Create a usage trigger for alerting.',
    z.object({
      callbackUrl: z.string().url().describe('Webhook URL to call when triggered'),
      triggerValue: z.string().describe('Value that triggers the alert'),
      usageCategory: z.string().describe('Usage category to monitor'),
      callbackMethod: z.enum(['GET', 'POST']).default('POST').describe('HTTP method for callback'),
      friendlyName: z.string().optional().describe('Friendly name for the trigger'),
      recurring: z.enum(['daily', 'monthly', 'yearly', 'alltime']).optional().describe('Recurring period'),
      triggerBy: z.enum(['count', 'usage', 'price']).default('usage').describe('What triggers the alert'),
    }),
    async ({ callbackUrl, triggerValue, usageCategory, callbackMethod, friendlyName, recurring, triggerBy }) => {
      const trigger = await client.usage.triggers.create({
        callbackUrl,
        triggerValue,
        usageCategory,
        callbackMethod,
        triggerBy,
        ...(friendlyName && { friendlyName }),
        ...(recurring && { recurring }),
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trigger.sid,
            friendlyName: trigger.friendlyName,
            usageCategory: trigger.usageCategory,
            triggerBy: trigger.triggerBy,
            triggerValue: trigger.triggerValue,
            callbackUrl: trigger.callbackUrl,
            recurring: trigger.recurring,
            dateCreated: trigger.dateCreated,
          }, null, 2),
        }],
      };
    }
  );

  const getUsageTrigger = createTool(
    'get_usage_trigger',
    'Get details of a specific usage trigger.',
    z.object({
      triggerSid: z.string().startsWith('UT').describe('Usage Trigger SID (starts with UT)'),
    }),
    async ({ triggerSid }) => {
      const trigger = await client.usage.triggers(triggerSid).fetch();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trigger.sid,
            friendlyName: trigger.friendlyName,
            recurring: trigger.recurring,
            usageCategory: trigger.usageCategory,
            triggerBy: trigger.triggerBy,
            triggerValue: trigger.triggerValue,
            currentValue: trigger.currentValue,
            callbackUrl: trigger.callbackUrl,
            callbackMethod: trigger.callbackMethod,
            dateCreated: trigger.dateCreated,
            dateFired: trigger.dateFired,
          }, null, 2),
        }],
      };
    }
  );

  const updateUsageTrigger = createTool(
    'update_usage_trigger',
    'Update a usage trigger.',
    z.object({
      triggerSid: z.string().startsWith('UT').describe('Usage Trigger SID (starts with UT)'),
      callbackUrl: z.string().url().optional().describe('New callback URL'),
      callbackMethod: z.enum(['GET', 'POST']).optional().describe('New HTTP method'),
      friendlyName: z.string().optional().describe('New friendly name'),
    }),
    async ({ triggerSid, ...updates }) => {
      const params: Record<string, unknown> = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {params[key] = value;}
      });

      const trigger = await client.usage.triggers(triggerSid).update(params);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            sid: trigger.sid,
            friendlyName: trigger.friendlyName,
            callbackUrl: trigger.callbackUrl,
            callbackMethod: trigger.callbackMethod,
            dateUpdated: trigger.dateUpdated,
          }, null, 2),
        }],
      };
    }
  );

  const deleteUsageTrigger = createTool(
    'delete_usage_trigger',
    'Delete a usage trigger.',
    z.object({
      triggerSid: z.string().startsWith('UT').describe('Usage Trigger SID (starts with UT)'),
    }),
    async ({ triggerSid }) => {
      await client.usage.triggers(triggerSid).remove();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            deleted: true,
            triggerSid,
          }, null, 2),
        }],
      };
    }
  );

  // ============ Balance ============

  const getAccountBalance = createTool(
    'get_account_balance',
    'Get the current account balance.',
    z.object({}),
    async () => {
      try {
        const balance = await client.balance.fetch();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              balance: balance.balance,
              currency: balance.currency,
            }, null, 2),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: message,
            }, null, 2),
          }],
        };
      }
    }
  );

  return [
    getAccount,
    listAccounts,
    createSubaccount,
    updateAccount,
    listUsageRecords,
    listUsageRecordsDaily,
    listUsageRecordsMonthly,
    listUsageTriggers,
    createUsageTrigger,
    getUsageTrigger,
    updateUsageTrigger,
    deleteUsageTrigger,
    getAccountBalance,
  ];
}
