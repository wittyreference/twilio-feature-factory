// ABOUTME: Work source providers for the autonomous worker.
// ABOUTME: Debugger alert poller and file-based manual queue source.

import * as fs from 'fs';
import * as path from 'path';
import type {
  DiscoveredWork,
  WorkSource,
  WorkPriority,
  SuggestedWorkflow,
  AutomationTier,
} from '../discovery/work-discovery.js';

const QUEUE_DIR = '.feature-factory';
const MANUAL_QUEUE_FILE = 'manual-queue.json';

/**
 * A work source provider that can be polled for new work items.
 */
export interface WorkSourceProvider {
  /** Human-readable name of this source */
  name: string;
  /** The WorkSource type produced by this provider */
  source: WorkSource;
  /** Whether this source is currently enabled */
  enabled: boolean;
  /** Poll for new work items. Returns only items not previously returned. */
  poll(): Promise<DiscoveredWork[]>;
}

/**
 * Twilio alert structure from monitor.v1.alerts.list().
 */
interface TwilioAlert {
  sid: string;
  errorCode: string;
  alertText: string;
  resourceSid: string;
  logLevel: string;
  dateCreated: Date;
  serviceSid?: string;
}

/**
 * Minimal Twilio client interface for debugger alerts.
 */
interface TwilioMonitorClient {
  monitor: {
    v1: {
      alerts: {
        list: (filters?: Record<string, unknown>) => Promise<TwilioAlert[]>;
      };
    };
  };
}

/**
 * Manual queue file item format.
 */
interface ManualQueueFileItem {
  id: string;
  description: string;
  priority?: string;
  workflow?: string;
  consumed: boolean;
}

/**
 * Manual queue file format.
 */
interface ManualQueueFile {
  items: ManualQueueFileItem[];
}

/**
 * Error code ranges for classification.
 * Based on Twilio error code documentation.
 */
function classifyErrorCode(errorCode: string): {
  priority: WorkPriority;
  tier: AutomationTier;
  workflow: SuggestedWorkflow;
  category: string;
} {
  const code = parseInt(errorCode, 10);

  // 11xxx: HTTP/webhook errors (config issues, usually auto-fixable)
  if (code >= 11000 && code < 12000) {
    return {
      priority: 'high',
      tier: 2 as AutomationTier,
      workflow: 'bug-fix',
      category: 'webhook',
    };
  }

  // 12xxx: TwiML processing errors (code issues)
  if (code >= 12000 && code < 13000) {
    return {
      priority: 'high',
      tier: 2 as AutomationTier,
      workflow: 'bug-fix',
      category: 'twiml',
    };
  }

  // 21xxx: API request errors (usually config or usage issues)
  if (code >= 21000 && code < 22000) {
    return {
      priority: 'medium',
      tier: 3 as AutomationTier,
      workflow: 'investigation',
      category: 'api',
    };
  }

  // 30xxx: Messaging errors (carrier issues, often external)
  if (code >= 30000 && code < 31000) {
    return {
      priority: 'medium',
      tier: 4 as AutomationTier,
      workflow: 'manual-review',
      category: 'messaging',
    };
  }

  // 82xxx: Authentication/authorization errors
  if (code >= 82000 && code < 83000) {
    return {
      priority: 'critical',
      tier: 1 as AutomationTier,
      workflow: 'bug-fix',
      category: 'auth',
    };
  }

  // Default: unknown error code range
  return {
    priority: 'medium',
    tier: 3 as AutomationTier,
    workflow: 'investigation',
    category: 'unknown',
  };
}

/**
 * Creates a work source that polls Twilio debugger alerts.
 * Wraps client.monitor.v1.alerts.list() and converts alerts to DiscoveredWork.
 * Deduplicates by alert SID across poll cycles.
 */
export function createDebuggerAlertSource(
  client: TwilioMonitorClient,
  options: { limit?: number } = {}
): WorkSourceProvider {
  const seenSids = new Set<string>();
  const limit = options.limit ?? 20;

  return {
    name: 'debugger-alerts',
    source: 'debugger-alert',
    enabled: true,

    async poll(): Promise<DiscoveredWork[]> {
      try {
        const alerts = await client.monitor.v1.alerts.list({
          limit,
          logLevel: 'error',
        });

        const newAlerts = alerts.filter(a => !seenSids.has(a.sid));
        for (const alert of newAlerts) {
          seenSids.add(alert.sid);
        }

        return newAlerts.map(alert => alertToWork(alert));
      } catch {
        // API errors are non-fatal — return empty and try again next cycle
        return [];
      }
    },
  };
}

/**
 * Convert a Twilio alert to a DiscoveredWork item.
 */
function alertToWork(alert: TwilioAlert): DiscoveredWork {
  const classification = classifyErrorCode(alert.errorCode);

  return {
    id: `alert-${alert.sid}-${Date.now()}`,
    discoveredAt: new Date(alert.dateCreated),
    source: 'debugger-alert',
    priority: classification.priority,
    tier: classification.tier,
    suggestedWorkflow: classification.workflow,
    summary: `Error ${alert.errorCode}: ${alert.alertText}`,
    description: [
      `**Error Code**: ${alert.errorCode}`,
      `**Alert**: ${alert.alertText}`,
      `**Category**: ${classification.category}`,
      `**Resource**: ${alert.resourceSid}`,
      `**Level**: ${alert.logLevel}`,
      `**Created**: ${alert.dateCreated}`,
    ].join('\n'),
    resourceSids: alert.resourceSid ? [alert.resourceSid] : [],
    tags: [classification.category, `error-${alert.errorCode}`],
    status: 'pending',
  };
}

/**
 * Creates a work source that reads from a manual queue file.
 * Users can add items to .feature-factory/manual-queue.json.
 * Items are marked consumed after reading so they're not returned again.
 */
export function createFileQueueSource(workingDirectory: string): WorkSourceProvider {
  return {
    name: 'file-queue',
    source: 'user-request',
    enabled: true,

    async poll(): Promise<DiscoveredWork[]> {
      const filePath = path.join(workingDirectory, QUEUE_DIR, MANUAL_QUEUE_FILE);

      if (!fs.existsSync(filePath)) {
        return [];
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data: ManualQueueFile = JSON.parse(content);

        if (!data.items || !Array.isArray(data.items)) {
          return [];
        }

        const unconsumed = data.items.filter(item => !item.consumed);
        if (unconsumed.length === 0) {
          return [];
        }

        // Mark items as consumed and save back
        for (const item of unconsumed) {
          item.consumed = true;
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

        // Convert to DiscoveredWork
        return unconsumed.map(item => manualItemToWork(item));
      } catch {
        return [];
      }
    },
  };
}

/**
 * Convert a manual queue item to a DiscoveredWork item.
 */
function manualItemToWork(item: ManualQueueFileItem): DiscoveredWork {
  const priority = (item.priority as WorkPriority) || 'medium';
  const workflow = (item.workflow as SuggestedWorkflow) || 'bug-fix';

  // User requests are tier 2 by default (trusted source, auto-executable)
  const tier: AutomationTier = workflow === 'manual-review' ? 4 : 2;

  return {
    id: `manual-${item.id}-${Date.now()}`,
    discoveredAt: new Date(),
    source: 'user-request',
    priority,
    tier,
    suggestedWorkflow: workflow,
    summary: item.description,
    description: `User-requested work: ${item.description}`,
    tags: ['manual', workflow],
    status: 'pending',
  };
}
