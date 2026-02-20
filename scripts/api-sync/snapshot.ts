// ABOUTME: Fetches and normalizes Twilio OpenAPI specs from the twilio-oai GitHub repo.
// ABOUTME: Produces a versioned snapshot of the API surface for tracked domains.

import { Octokit } from '@octokit/rest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACKED_DOMAINS, OAI_REPO, NPM_PACKAGES } from './config.js';
import type { OaiEndpoint, OaiSnapshot, ParamDef, SyncState } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = resolve(__dirname, 'snapshots');
const SYNC_STATE_PATH = resolve(__dirname, 'sync-state.json');
const CHANGELOG_PATH = resolve(__dirname, 'snapshots', 'CHANGES.md');

/**
 * Fetch the latest OAI release tag from GitHub.
 */
async function fetchLatestRelease(octokit: Octokit): Promise<{ tag: string; date: string }> {
  const { data } = await octokit.repos.getLatestRelease({
    owner: OAI_REPO.owner,
    repo: OAI_REPO.repo,
  });
  return {
    tag: data.tag_name,
    date: data.published_at || new Date().toISOString(),
  };
}

/**
 * Fetch a single spec file from the OAI repo at a given tag.
 */
async function fetchSpecFile(
  octokit: Octokit,
  tag: string,
  domain: string,
): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://raw.githubusercontent.com/${OAI_REPO.owner}/${OAI_REPO.repo}/${tag}/${OAI_REPO.specDir}/${domain}.json`;
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`  Spec not found: ${domain} (skipping)`);
        return null;
      }
      throw new Error(`HTTP ${response.status} fetching ${domain}`);
    }
    return await response.json() as Record<string, unknown>;
  } catch (err) {
    console.log(`  Error fetching ${domain}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Fetch the CHANGES.md file from the OAI repo.
 */
async function fetchChangelog(tag: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${OAI_REPO.owner}/${OAI_REPO.repo}/${tag}/CHANGES.md`;
  const response = await fetch(url);
  if (!response.ok) {
    console.log(`  Warning: Could not fetch CHANGES.md (HTTP ${response.status})`);
    return '';
  }
  return await response.text();
}

/**
 * Fetch the latest version of an npm package.
 */
async function fetchNpmVersion(packageName: string): Promise<string> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
    if (!response.ok) return 'unknown';
    const data = await response.json() as { version: string };
    return data.version;
  } catch {
    return 'unknown';
  }
}

/**
 * Extract parameters from an OpenAPI operation's parameter list.
 */
function extractParams(
  parameters: Array<Record<string, unknown>> | undefined,
): ParamDef[] {
  if (!parameters) return [];
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

/**
 * Extract request body parameters from an OpenAPI operation.
 * Twilio uses application/x-www-form-urlencoded for POST bodies.
 */
function extractRequestBody(
  requestBody: Record<string, unknown> | undefined,
): ParamDef[] {
  if (!requestBody) return [];

  const content = requestBody.content as Record<string, unknown> | undefined;
  if (!content) return [];

  // Try form-urlencoded first (Twilio's standard), then JSON
  const formContent = content['application/x-www-form-urlencoded'] as Record<string, unknown> | undefined;
  const jsonContent = content['application/json'] as Record<string, unknown> | undefined;
  const mediaType = formContent || jsonContent;
  if (!mediaType) return [];

  const schema = mediaType.schema as Record<string, unknown> | undefined;
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

/**
 * Parse an OpenAPI spec into normalized OaiEndpoint entries.
 */
function parseSpec(spec: Record<string, unknown>, domain: string): OaiEndpoint[] {
  const endpoints: OaiEndpoint[] = [];
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return endpoints;

  for (const [path, pathItem] of Object.entries(paths)) {
    // Skip non-method keys (servers, description, x-twilio, parameters)
    const methods = ['get', 'post', 'put', 'patch', 'delete'];
    for (const method of methods) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      // Merge path-level parameters with operation-level parameters
      const pathParams = pathItem.parameters as Array<Record<string, unknown>> | undefined;
      const opParams = operation.parameters as Array<Record<string, unknown>> | undefined;
      const allParams = [...(pathParams || []), ...(opParams || [])];

      endpoints.push({
        domain,
        path,
        method,
        operationId: (operation.operationId as string) || '',
        summary: (operation.summary as string) || (operation.description as string) || '',
        deprecated: (operation.deprecated as boolean) || false,
        parameters: extractParams(allParams),
        requestBody: extractRequestBody(operation.requestBody as Record<string, unknown> | undefined),
      });
    }
  }

  return endpoints;
}

/**
 * Main snapshot function.
 */
async function runSnapshot(): Promise<void> {
  const force = process.env.FORCE === 'true' || process.argv.includes('--force');
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN || undefined,
  });

  // Load current sync state
  let syncState: SyncState;
  try {
    syncState = JSON.parse(readFileSync(SYNC_STATE_PATH, 'utf-8'));
  } catch {
    syncState = {
      oai: { version: '', syncedAt: '' },
      cli: { version: '', syncedAt: '' },
      sdk: { version: '', syncedAt: '' },
    };
  }

  // Check latest OAI version
  console.log('Checking latest twilio-oai release...');
  const release = await fetchLatestRelease(octokit);
  console.log(`  Latest: ${release.tag} (published ${release.date})`);
  console.log(`  Last synced: ${syncState.oai.version || 'never'}`);

  if (!force && syncState.oai.version === release.tag) {
    console.log('No new OAI version. Use --force to regenerate.');
    process.exit(0);
  }

  // Fetch npm versions
  console.log('\nChecking npm package versions...');
  const cliVersion = await fetchNpmVersion(NPM_PACKAGES.cli);
  const sdkVersion = await fetchNpmVersion(NPM_PACKAGES.sdk);
  console.log(`  CLI: ${cliVersion} (was ${syncState.cli.version || 'unknown'})`);
  console.log(`  SDK: ${sdkVersion} (was ${syncState.sdk.version || 'unknown'})`);

  // Fetch and parse all tracked specs
  console.log(`\nFetching ${TRACKED_DOMAINS.length} spec files from tag ${release.tag}...`);
  const allEndpoints: Record<string, OaiEndpoint> = {};
  const domainCounts: Record<string, number> = {};

  for (const domain of TRACKED_DOMAINS) {
    const spec = await fetchSpecFile(octokit, release.tag, domain);
    if (!spec) continue;

    const endpoints = parseSpec(spec, domain);
    domainCounts[domain] = endpoints.length;

    for (const ep of endpoints) {
      const key = `${ep.domain}:${ep.method}:${ep.path}`;
      allEndpoints[key] = ep;
    }

    console.log(`  ${domain}: ${endpoints.length} endpoints`);
  }

  const totalEndpoints = Object.keys(allEndpoints).length;
  console.log(`\nTotal: ${totalEndpoints} endpoints across ${Object.keys(domainCounts).length} domains`);

  // Build snapshot
  const snapshot: OaiSnapshot = {
    version: release.tag,
    fetchedAt: new Date().toISOString(),
    endpointCount: totalEndpoints,
    domainCounts,
    endpoints: allEndpoints,
  };

  // Save snapshot
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  const snapshotPath = resolve(SNAPSHOTS_DIR, `${release.tag}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot saved: ${snapshotPath}`);

  // Fetch and save changelog
  console.log('Fetching CHANGES.md...');
  const changelog = await fetchChangelog(release.tag);
  if (changelog) {
    writeFileSync(CHANGELOG_PATH, changelog);
    console.log(`  Changelog saved: ${CHANGELOG_PATH}`);
  }

  // Update sync state
  const now = new Date().toISOString();
  syncState.oai = { version: release.tag, syncedAt: now };
  syncState.cli = { version: cliVersion, syncedAt: now };
  syncState.sdk = { version: sdkVersion, syncedAt: now };
  writeFileSync(SYNC_STATE_PATH, JSON.stringify(syncState, null, 2));
  console.log('Sync state updated.');
}

runSnapshot().catch((err) => {
  console.error('Snapshot failed:', err);
  process.exit(1);
});
