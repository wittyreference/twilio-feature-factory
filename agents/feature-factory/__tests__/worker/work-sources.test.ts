// ABOUTME: Unit tests for work source providers.
// ABOUTME: Tests debugger alert source and file-based manual queue source.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createDebuggerAlertSource,
  createFileQueueSource,
  type WorkSourceProvider,
} from '../../src/worker/work-sources.js';
import type { DiscoveredWork } from '../../src/discovery/work-discovery.js';

describe('WorkSources', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-work-sources-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('createDebuggerAlertSource', () => {
    it('should have correct name and source type', () => {
      const mockClient = createMockTwilioClient([]);
      const source = createDebuggerAlertSource(mockClient);

      expect(source.name).toBe('debugger-alerts');
      expect(source.source).toBe('debugger-alert');
      expect(source.enabled).toBe(true);
    });

    it('should convert alerts to DiscoveredWork items', async () => {
      const alerts = [
        createMockAlert({
          sid: 'NO1234567890abcdef1234567890abcd',
          errorCode: '11200',
          alertText: 'HTTP retrieval failure',
          resourceSid: 'CA1234567890abcdef1234567890abcd',
          logLevel: 'error',
          dateCreated: new Date('2026-02-18T10:00:00Z'),
        }),
      ];

      const mockClient = createMockTwilioClient(alerts);
      const source = createDebuggerAlertSource(mockClient);

      const work = await source.poll();

      expect(work).toHaveLength(1);
      expect(work[0].source).toBe('debugger-alert');
      expect(work[0].summary).toContain('11200');
      expect(work[0].resourceSids).toContain('CA1234567890abcdef1234567890abcd');
      expect(work[0].status).toBe('pending');
    });

    it('should deduplicate by alert SID', async () => {
      const alerts = [
        createMockAlert({ sid: 'NO_same_sid', errorCode: '11200' }),
      ];

      const mockClient = createMockTwilioClient(alerts);
      const source = createDebuggerAlertSource(mockClient);

      // First poll returns the alert
      const first = await source.poll();
      expect(first).toHaveLength(1);

      // Second poll with same alert should return empty
      const second = await source.poll();
      expect(second).toHaveLength(0);
    });

    it('should return empty array when no alerts', async () => {
      const mockClient = createMockTwilioClient([]);
      const source = createDebuggerAlertSource(mockClient);

      const work = await source.poll();
      expect(work).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      const mockClient = {
        monitor: {
          v1: {
            alerts: {
              list: () => Promise.reject(new Error('API error')),
            },
          },
        },
      };
      const source = createDebuggerAlertSource(mockClient as never);

      const work = await source.poll();
      expect(work).toHaveLength(0);
    });

    it('should classify error codes into priority and tier', async () => {
      const alerts = [
        // 11200 = HTTP retrieval failure (config issue, high priority)
        createMockAlert({ sid: 'NO_a', errorCode: '11200', logLevel: 'error' }),
        // 82002 = auth error (critical)
        createMockAlert({ sid: 'NO_b', errorCode: '82002', logLevel: 'error' }),
        // 30007 = carrier violation (medium, external)
        createMockAlert({ sid: 'NO_c', errorCode: '30007', logLevel: 'warning' }),
      ];

      const mockClient = createMockTwilioClient(alerts);
      const source = createDebuggerAlertSource(mockClient);

      const work = await source.poll();
      expect(work).toHaveLength(3);

      // Error codes should produce reasonable classifications
      for (const item of work) {
        expect(['critical', 'high', 'medium', 'low']).toContain(item.priority);
        expect([1, 2, 3, 4]).toContain(item.tier);
      }
    });

    it('should set suggestedWorkflow based on error code', async () => {
      const alerts = [
        createMockAlert({ sid: 'NO_fix', errorCode: '11200' }),
      ];

      const mockClient = createMockTwilioClient(alerts);
      const source = createDebuggerAlertSource(mockClient);

      const work = await source.poll();
      expect(['bug-fix', 'investigation', 'manual-review']).toContain(
        work[0].suggestedWorkflow
      );
    });
  });

  describe('createFileQueueSource', () => {
    it('should have correct name and source type', () => {
      const source = createFileQueueSource(tempDir);

      expect(source.name).toBe('file-queue');
      expect(source.source).toBe('user-request');
      expect(source.enabled).toBe(true);
    });

    it('should return empty array when no queue file exists', async () => {
      const source = createFileQueueSource(tempDir);
      const work = await source.poll();
      expect(work).toHaveLength(0);
    });

    it('should read items from manual-queue.json', async () => {
      const manualItems = [
        {
          description: 'Fix the timeout issue',
          priority: 'high',
          workflow: 'bug-fix',
        },
      ];

      writeManualQueue(tempDir, manualItems);
      const source = createFileQueueSource(tempDir);

      const work = await source.poll();
      expect(work).toHaveLength(1);
      expect(work[0].summary).toContain('Fix the timeout issue');
      expect(work[0].priority).toBe('high');
      expect(work[0].suggestedWorkflow).toBe('bug-fix');
      expect(work[0].source).toBe('user-request');
    });

    it('should mark items as consumed after reading', async () => {
      writeManualQueue(tempDir, [
        { description: 'Task 1', priority: 'medium', workflow: 'bug-fix' },
      ]);
      const source = createFileQueueSource(tempDir);

      const first = await source.poll();
      expect(first).toHaveLength(1);

      // Second poll should return nothing (item consumed)
      const second = await source.poll();
      expect(second).toHaveLength(0);
    });

    it('should handle multiple items', async () => {
      writeManualQueue(tempDir, [
        { description: 'Task 1', priority: 'low', workflow: 'refactor' },
        { description: 'Task 2', priority: 'high', workflow: 'bug-fix' },
      ]);
      const source = createFileQueueSource(tempDir);

      const work = await source.poll();
      expect(work).toHaveLength(2);
    });

    it('should handle corrupted queue file gracefully', async () => {
      const dir = path.join(tempDir, '.feature-factory');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'manual-queue.json'), 'invalid json');

      const source = createFileQueueSource(tempDir);
      const work = await source.poll();
      expect(work).toHaveLength(0);
    });

    it('should default priority to medium and workflow to bug-fix', async () => {
      writeManualQueue(tempDir, [
        { description: 'Minimal item' },
      ]);
      const source = createFileQueueSource(tempDir);

      const work = await source.poll();
      expect(work[0].priority).toBe('medium');
      expect(work[0].suggestedWorkflow).toBe('bug-fix');
    });
  });
});

// ---- Test helpers ----

interface MockAlert {
  sid: string;
  errorCode: string;
  alertText: string;
  resourceSid: string;
  logLevel: string;
  dateCreated: Date;
  dateGenerated: Date;
  dateUpdated: Date;
  serviceSid: string;
}

function createMockAlert(overrides: Partial<MockAlert> = {}): MockAlert {
  return {
    sid: `NO${Date.now().toString(36)}`,
    errorCode: '11200',
    alertText: 'HTTP retrieval failure',
    resourceSid: 'CA0000000000000000000000000000dead',
    logLevel: 'error',
    dateCreated: new Date(),
    dateGenerated: new Date(),
    dateUpdated: new Date(),
    serviceSid: '',
    ...overrides,
  };
}

function createMockTwilioClient(alerts: MockAlert[]) {
  return {
    monitor: {
      v1: {
        alerts: {
          list: () => Promise.resolve(alerts),
        },
      },
    },
  };
}

interface ManualQueueItem {
  description: string;
  priority?: string;
  workflow?: string;
}

function writeManualQueue(workingDirectory: string, items: ManualQueueItem[]): void {
  const dir = path.join(workingDirectory, '.feature-factory');
  fs.mkdirSync(dir, { recursive: true });

  const queueData = {
    items: items.map((item, i) => ({
      id: `manual-${i}`,
      ...item,
      consumed: false,
    })),
  };

  fs.writeFileSync(
    path.join(dir, 'manual-queue.json'),
    JSON.stringify(queueData, null, 2),
    'utf-8'
  );
}
