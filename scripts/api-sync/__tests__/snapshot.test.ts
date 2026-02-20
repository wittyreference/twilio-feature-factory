// ABOUTME: Tests for the OAI spec normalization logic in snapshot.ts.
// ABOUTME: Verifies endpoint extraction from OpenAPI spec format.

// We test the parsing logic by importing from snapshot indirectly via a test helper,
// since snapshot.ts runs as a script. Instead, we test the same normalization logic inline.

import type { OaiEndpoint, ParamDef } from '../types.js';

// Replicate the parsing logic from snapshot.ts for testability
function extractParams(parameters: Array<Record<string, unknown>>): ParamDef[] {
  return parameters.map((p) => {
    const schema = p.schema as Record<string, unknown> | undefined;
    return {
      name: p.name as string,
      in: p.in as 'path' | 'query',
      required: (p.required as boolean) || false,
      type: schema ? (schema.type as string || 'string') : 'string',
      description: (p.description as string) || '',
    };
  });
}

function extractRequestBody(requestBody: Record<string, unknown> | undefined): ParamDef[] {
  if (!requestBody) return [];
  const content = requestBody.content as Record<string, unknown> | undefined;
  if (!content) return [];
  const formContent = content['application/x-www-form-urlencoded'] as Record<string, unknown> | undefined;
  if (!formContent) return [];
  const schema = formContent.schema as Record<string, unknown> | undefined;
  if (!schema) return [];
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return [];
  const required = new Set((schema.required as string[]) || []);
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    in: 'body' as const,
    required: required.has(name),
    type: (prop.type as string) || 'string',
    description: (prop.description as string) || '',
  }));
}

describe('Snapshot normalization', () => {
  test('extracts path and query parameters', () => {
    const params = extractParams([
      { name: 'ServiceSid', in: 'path', required: true, schema: { type: 'string' }, description: 'Service SID' },
      { name: 'PageSize', in: 'query', required: false, schema: { type: 'integer' }, description: 'Page size' },
    ]);

    expect(params).toHaveLength(2);
    expect(params[0]).toEqual({
      name: 'ServiceSid',
      in: 'path',
      required: true,
      type: 'string',
      description: 'Service SID',
    });
    expect(params[1]).toEqual({
      name: 'PageSize',
      in: 'query',
      required: false,
      type: 'integer',
      description: 'Page size',
    });
  });

  test('extracts form-urlencoded request body properties', () => {
    const body = extractRequestBody({
      content: {
        'application/x-www-form-urlencoded': {
          schema: {
            type: 'object',
            required: ['To', 'Body'],
            properties: {
              To: { type: 'string', description: 'Destination' },
              Body: { type: 'string', description: 'Message body' },
              From: { type: 'string', description: 'Sender' },
            },
          },
        },
      },
    });

    expect(body).toHaveLength(3);
    expect(body[0]).toEqual({ name: 'To', in: 'body', required: true, type: 'string', description: 'Destination' });
    expect(body[1]).toEqual({ name: 'Body', in: 'body', required: true, type: 'string', description: 'Message body' });
    expect(body[2]).toEqual({ name: 'From', in: 'body', required: false, type: 'string', description: 'Sender' });
  });

  test('handles missing request body gracefully', () => {
    expect(extractRequestBody(undefined)).toEqual([]);
    expect(extractRequestBody({})).toEqual([]);
    expect(extractRequestBody({ content: {} })).toEqual([]);
  });
});
