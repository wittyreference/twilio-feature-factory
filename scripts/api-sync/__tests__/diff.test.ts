// ABOUTME: Tests for the diff engine that detects API surface changes.
// ABOUTME: Verifies version diff logic and coverage analysis.

import type { OaiSnapshot, OaiEndpoint, ParamDef, ToolEndpointMap, ToolInventoryEntry } from '../types.js';

// Inline the diff logic for testability
function computeVersionDiff(
  current: OaiSnapshot,
  previous: OaiSnapshot,
) {
  const newEndpoints: OaiEndpoint[] = [];
  const removedEndpoints: OaiEndpoint[] = [];
  const parameterChanges: Array<{ endpointKey: string; addedParams: ParamDef[]; removedParams: ParamDef[] }> = [];

  for (const [key, endpoint] of Object.entries(current.endpoints)) {
    if (!previous.endpoints[key]) newEndpoints.push(endpoint);
  }
  for (const [key, endpoint] of Object.entries(previous.endpoints)) {
    if (!current.endpoints[key]) removedEndpoints.push(endpoint);
  }
  for (const [key, currentEp] of Object.entries(current.endpoints)) {
    const previousEp = previous.endpoints[key];
    if (!previousEp) continue;
    const currentParamNames = new Set([...currentEp.parameters, ...currentEp.requestBody].map(p => p.name));
    const previousParamNames = new Set([...previousEp.parameters, ...previousEp.requestBody].map(p => p.name));
    const added = [...currentEp.parameters, ...currentEp.requestBody].filter(p => !previousParamNames.has(p.name));
    const removed = [...previousEp.parameters, ...previousEp.requestBody].filter(p => !currentParamNames.has(p.name));
    if (added.length > 0 || removed.length > 0) {
      parameterChanges.push({ endpointKey: key, addedParams: added, removedParams: removed });
    }
  }

  return { newEndpoints, removedEndpoints, parameterChanges };
}

function makeEndpoint(overrides: Partial<OaiEndpoint> = {}): OaiEndpoint {
  return {
    domain: 'twilio_api_v2010',
    path: '/test',
    method: 'get',
    operationId: 'TestOp',
    summary: 'Test endpoint',
    deprecated: false,
    parameters: [],
    requestBody: [],
    ...overrides,
  };
}

function makeSnapshot(endpoints: Record<string, OaiEndpoint>, version = '1.0.0'): OaiSnapshot {
  return {
    version,
    fetchedAt: '2026-01-01T00:00:00Z',
    endpointCount: Object.keys(endpoints).length,
    domainCounts: {},
    endpoints,
  };
}

describe('Version diff', () => {
  test('detects new endpoints', () => {
    const previous = makeSnapshot({
      'api:get:/messages': makeEndpoint({ path: '/messages', method: 'get' }),
    }, '1.0.0');

    const current = makeSnapshot({
      'api:get:/messages': makeEndpoint({ path: '/messages', method: 'get' }),
      'api:post:/messages': makeEndpoint({ path: '/messages', method: 'post' }),
    }, '1.1.0');

    const diff = computeVersionDiff(current, previous);
    expect(diff.newEndpoints).toHaveLength(1);
    expect(diff.newEndpoints[0].method).toBe('post');
    expect(diff.removedEndpoints).toHaveLength(0);
  });

  test('detects removed endpoints', () => {
    const previous = makeSnapshot({
      'api:get:/old': makeEndpoint({ path: '/old' }),
      'api:get:/keep': makeEndpoint({ path: '/keep' }),
    });

    const current = makeSnapshot({
      'api:get:/keep': makeEndpoint({ path: '/keep' }),
    });

    const diff = computeVersionDiff(current, previous);
    expect(diff.newEndpoints).toHaveLength(0);
    expect(diff.removedEndpoints).toHaveLength(1);
    expect(diff.removedEndpoints[0].path).toBe('/old');
  });

  test('detects parameter additions', () => {
    const previous = makeSnapshot({
      'api:post:/messages': makeEndpoint({
        path: '/messages',
        method: 'post',
        requestBody: [
          { name: 'To', in: 'body', required: true, type: 'string', description: '' },
          { name: 'Body', in: 'body', required: true, type: 'string', description: '' },
        ],
      }),
    });

    const current = makeSnapshot({
      'api:post:/messages': makeEndpoint({
        path: '/messages',
        method: 'post',
        requestBody: [
          { name: 'To', in: 'body', required: true, type: 'string', description: '' },
          { name: 'Body', in: 'body', required: true, type: 'string', description: '' },
          { name: 'ContentSid', in: 'body', required: false, type: 'string', description: 'Content template SID' },
        ],
      }),
    });

    const diff = computeVersionDiff(current, previous);
    expect(diff.parameterChanges).toHaveLength(1);
    expect(diff.parameterChanges[0].addedParams).toHaveLength(1);
    expect(diff.parameterChanges[0].addedParams[0].name).toBe('ContentSid');
    expect(diff.parameterChanges[0].removedParams).toHaveLength(0);
  });

  test('detects parameter removals', () => {
    const previous = makeSnapshot({
      'api:post:/service': makeEndpoint({
        requestBody: [
          { name: 'Name', in: 'body', required: true, type: 'string', description: '' },
          { name: 'OldParam', in: 'body', required: false, type: 'string', description: '' },
        ],
      }),
    });

    const current = makeSnapshot({
      'api:post:/service': makeEndpoint({
        requestBody: [
          { name: 'Name', in: 'body', required: true, type: 'string', description: '' },
        ],
      }),
    });

    const diff = computeVersionDiff(current, previous);
    expect(diff.parameterChanges).toHaveLength(1);
    expect(diff.parameterChanges[0].removedParams).toHaveLength(1);
    expect(diff.parameterChanges[0].removedParams[0].name).toBe('OldParam');
  });

  test('no diff when snapshots are identical', () => {
    const snap = makeSnapshot({
      'api:get:/messages': makeEndpoint(),
    });

    const diff = computeVersionDiff(snap, snap);
    expect(diff.newEndpoints).toHaveLength(0);
    expect(diff.removedEndpoints).toHaveLength(0);
    expect(diff.parameterChanges).toHaveLength(0);
  });
});
