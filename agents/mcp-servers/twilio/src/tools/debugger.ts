// ABOUTME: Twilio debugger and monitoring tools.
// ABOUTME: Provides get_debugger_logs, analyze_errors, and get_usage_records tools.

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
 * Returns all debugger and monitoring tools configured with the given Twilio context.
 */
export function debuggerTools(context: TwilioContext) {
  const { client } = context;

  const getDebuggerLogs = createTool(
    'get_debugger_logs',
    'Fetch recent debugger/alert logs from Twilio.',
    z.object({
      limit: z.number().min(1).max(100).optional().default(20).describe('Max results (1-100, default 20)'),
      logLevel: z.enum(['error', 'warning', 'notice', 'debug']).optional().describe('Filter by log level'),
      startDate: z.string().datetime().optional().describe('Filter logs after this ISO datetime'),
      endDate: z.string().datetime().optional().describe('Filter logs before this ISO datetime'),
    }),
    async ({ limit, logLevel, startDate, endDate }) => {
      const filters: {
        limit: number;
        logLevel?: string;
        startDate?: Date;
        endDate?: Date;
      } = { limit: limit || 20 };

      if (logLevel) filters.logLevel = logLevel;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      const alerts = await client.monitor.v1.alerts.list(filters);

      const formattedAlerts = alerts.map((a) => ({
        sid: a.sid,
        errorCode: a.errorCode,
        logLevel: a.logLevel,
        alertText: a.alertText,
        resourceSid: a.resourceSid,
        serviceSid: a.serviceSid,
        dateCreated: a.dateCreated,
        dateGenerated: a.dateGenerated,
        dateUpdated: a.dateUpdated,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ success: true, count: formattedAlerts.length, alerts: formattedAlerts }, null, 2),
        }],
      };
    }
  );

  const analyzeErrors = createTool(
    'analyze_errors',
    'Analyze error patterns from debugger logs.',
    z.object({
      hours: z.number().min(1).max(168).optional().default(24).describe('Hours to look back (1-168, default 24)'),
    }),
    async ({ hours }) => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (hours || 24) * 60 * 60 * 1000);

      const alerts = await client.monitor.v1.alerts.list({
        limit: 500,
        startDate,
        endDate,
      });

      // Group errors by error code
      const errorCounts: Record<string, { count: number; samples: string[] }> = {};
      for (const alert of alerts) {
        const code = alert.errorCode || 'unknown';
        if (!errorCounts[code]) {
          errorCounts[code] = { count: 0, samples: [] };
        }
        errorCounts[code].count++;
        if (errorCounts[code].samples.length < 3) {
          errorCounts[code].samples.push(alert.alertText || '');
        }
      }

      // Sort by count descending
      const sortedErrors = Object.entries(errorCounts)
        .map(([code, data]) => ({ errorCode: code, ...data }))
        .sort((a, b) => b.count - a.count);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            timeRange: { start: startDate.toISOString(), end: endDate.toISOString() },
            totalErrors: alerts.length,
            uniqueErrorCodes: sortedErrors.length,
            errorsByCode: sortedErrors,
          }, null, 2),
        }],
      };
    }
  );

  const getUsageRecords = createTool(
    'get_usage_records',
    'Retrieve usage records for billing and monitoring.',
    z.object({
      category: z.enum([
        'calls', 'sms', 'mms', 'phonenumbers', 'recordings',
        'transcriptions', 'totalprice', 'programmablevoice', 'programmablevoice-inbound',
      ]).optional().describe('Filter by usage category'),
      startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
      endDate: z.string().optional().describe('End date (YYYY-MM-DD)'),
    }),
    async ({ category, startDate, endDate }) => {
      const filters: {
        category?: string;
        startDate?: Date;
        endDate?: Date;
      } = {};

      if (category) filters.category = category;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      const records = await client.usage.records.list(filters);

      const formattedRecords = records.map((r) => ({
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
          text: JSON.stringify({ success: true, count: formattedRecords.length, records: formattedRecords }, null, 2),
        }],
      };
    }
  );

  return [getDebuggerLogs, analyzeErrors, getUsageRecords];
}
