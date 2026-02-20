// ABOUTME: Compares OAI snapshots to detect API surface changes and analyze MCP tool coverage.
// ABOUTME: Produces a structured DriftReport with version diffs and coverage analysis.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SDK_PINNED_RANGE } from './config.js';
import { parseChangelog } from './parse-changelog.js';
import type {
  OaiSnapshot, OaiEndpoint, ParamDef, ParamChange,
  ToolEndpointMap, ToolInventoryEntry, ToolParamDrift,
  CoverageAnalysis, DriftReport, SyncState, ChangelogEntry,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, 'reports');
const SNAPSHOTS_DIR = resolve(__dirname, 'snapshots');
const SYNC_STATE_PATH = resolve(__dirname, 'sync-state.json');
const TOOL_MAP_PATH = resolve(__dirname, 'tool-endpoint-map.json');
const INVENTORY_PATH = resolve(__dirname, 'inventory.json');
const CHANGELOG_PATH = resolve(SNAPSHOTS_DIR, 'CHANGES.md');

/**
 * Find the previous snapshot version by scanning the snapshots directory.
 */
function findPreviousVersion(currentVersion: string): string | null {
  if (!existsSync(SNAPSHOTS_DIR)) return null;

  const files = readdirSync(SNAPSHOTS_DIR) as string[];
  const versions = files
    .filter((f: string) => f.endsWith('.json') && f !== 'CHANGES.md')
    .map((f: string) => f.replace('.json', ''))
    .filter((v: string) => v !== currentVersion)
    .sort()
    .reverse();

  return versions[0] || null;
}

/**
 * Compare two snapshots and produce version diff arrays.
 */
function computeVersionDiff(
  current: OaiSnapshot,
  previous: OaiSnapshot,
): { newEndpoints: OaiEndpoint[]; removedEndpoints: OaiEndpoint[]; parameterChanges: ParamChange[] } {
  const newEndpoints: OaiEndpoint[] = [];
  const removedEndpoints: OaiEndpoint[] = [];
  const parameterChanges: ParamChange[] = [];

  // Find new endpoints (in current but not previous)
  for (const [key, endpoint] of Object.entries(current.endpoints)) {
    if (!previous.endpoints[key]) {
      newEndpoints.push(endpoint);
    }
  }

  // Find removed endpoints (in previous but not current)
  for (const [key, endpoint] of Object.entries(previous.endpoints)) {
    if (!current.endpoints[key]) {
      removedEndpoints.push(endpoint);
    }
  }

  // Find parameter changes (same endpoint, different params)
  for (const [key, currentEp] of Object.entries(current.endpoints)) {
    const previousEp = previous.endpoints[key];
    if (!previousEp) continue;

    const currentParams = new Map<string, ParamDef>();
    const previousParams = new Map<string, ParamDef>();

    for (const p of [...currentEp.parameters, ...currentEp.requestBody]) {
      currentParams.set(p.name, p);
    }
    for (const p of [...previousEp.parameters, ...previousEp.requestBody]) {
      previousParams.set(p.name, p);
    }

    const addedParams: ParamDef[] = [];
    const removedParams: ParamDef[] = [];

    for (const [name, param] of currentParams) {
      if (!previousParams.has(name)) {
        addedParams.push(param);
      }
    }
    for (const [name, param] of previousParams) {
      if (!currentParams.has(name)) {
        removedParams.push(param);
      }
    }

    if (addedParams.length > 0 || removedParams.length > 0) {
      parameterChanges.push({
        endpointKey: key,
        domain: currentEp.domain,
        path: currentEp.path,
        method: currentEp.method,
        addedParams,
        removedParams,
      });
    }
  }

  return { newEndpoints, removedEndpoints, parameterChanges };
}

/**
 * Analyze MCP tool coverage against the OAI snapshot.
 */
function computeCoverage(
  snapshot: OaiSnapshot,
  toolMap: ToolEndpointMap,
  inventory: ToolInventoryEntry[],
): CoverageAnalysis {
  // Build a set of all mapped OAI endpoint keys
  const mappedEndpointKeys = new Set<string>();
  for (const mapping of Object.values(toolMap)) {
    for (const ep of mapping.endpoints) {
      mappedEndpointKeys.add(ep);
    }
  }

  // Find unmapped endpoints
  const unmappedEndpoints: OaiEndpoint[] = [];
  for (const [key, endpoint] of Object.entries(snapshot.endpoints)) {
    if (!mappedEndpointKeys.has(key)) {
      unmappedEndpoints.push(endpoint);
    }
  }

  // Compute per-tool parameter drift
  const toolsWithParamDrift: ToolParamDrift[] = [];
  const inventoryByName = new Map(inventory.map(t => [t.name, t]));

  for (const [toolName, mapping] of Object.entries(toolMap)) {
    const tool = inventoryByName.get(toolName);
    if (!tool || mapping.endpoints.length === 0) continue;

    for (const epKey of mapping.endpoints) {
      const oaiEp = snapshot.endpoints[epKey];
      if (!oaiEp) continue;

      // Get all OAI params (excluding path params, pagination, and indexed params)
      // Twilio OAI specs enumerate indexed params like Parameter1.Name through ParameterN.Name
      // which our tools handle via arrays. Filter these out.
      const indexedParamRegex = /^[A-Za-z]+\d+\./;
      const oaiParams = [
        ...oaiEp.parameters.filter(p => p.in !== 'path'),
        ...oaiEp.requestBody,
      ].filter(p =>
        !['PageSize', 'Page', 'PageToken'].includes(p.name) &&
        !indexedParamRegex.test(p.name)
      );

      const toolParamNames = new Set(tool.params.map(p => p.toLowerCase()));
      const oaiParamNames = new Set(oaiParams.map(p => p.name.toLowerCase()));

      // Params in OAI but not in tool
      const missingInTool = oaiParams.filter(p => !toolParamNames.has(p.name.toLowerCase()));
      // Params in tool but not in OAI (might be renamed or custom)
      const extraInTool = tool.params.filter(p => !oaiParamNames.has(p.toLowerCase()));

      if (missingInTool.length > 0) {
        toolsWithParamDrift.push({
          toolName,
          toolFile: `agents/mcp-servers/twilio/src/tools/${tool.file}`,
          endpoint: epKey,
          newParams: missingInTool,
          removedParams: extraInTool.map(name => ({
            name, in: 'body' as const, required: false, type: 'unknown', description: '',
          })),
          suggestedAction: `Add ${missingInTool.length} missing param(s) to ${toolName}: ${missingInTool.map(p => p.name).join(', ')}`,
        });
      }
    }
  }

  // Per-domain coverage
  const domainCoverage: Record<string, { total: number; mapped: number; percent: number }> = {};
  for (const [key, endpoint] of Object.entries(snapshot.endpoints)) {
    const domain = endpoint.domain;
    if (!domainCoverage[domain]) {
      domainCoverage[domain] = { total: 0, mapped: 0, percent: 0 };
    }
    domainCoverage[domain].total++;
    if (mappedEndpointKeys.has(key)) {
      domainCoverage[domain].mapped++;
    }
  }
  for (const dc of Object.values(domainCoverage)) {
    dc.percent = dc.total > 0 ? Math.round((dc.mapped / dc.total) * 1000) / 10 : 0;
  }

  const totalOai = snapshot.endpointCount;
  const totalMapped = mappedEndpointKeys.size;

  return {
    totalOaiEndpoints: totalOai,
    mappedEndpoints: totalMapped,
    mappedTools: Object.keys(toolMap).length,
    unmappedEndpoints,
    toolsWithParamDrift,
    coveragePercent: totalOai > 0 ? Math.round((totalMapped / totalOai) * 1000) / 10 : 0,
    domainCoverage,
  };
}

/**
 * Main diff function.
 */
async function runDiff(): Promise<void> {
  // Load sync state
  const syncState: SyncState = JSON.parse(readFileSync(SYNC_STATE_PATH, 'utf-8'));
  const currentVersion = syncState.oai.version;

  if (!currentVersion) {
    console.error('No OAI version in sync-state.json. Run snapshot.ts first.');
    process.exit(1);
  }

  // Load current snapshot
  const currentPath = resolve(SNAPSHOTS_DIR, `${currentVersion}.json`);
  if (!existsSync(currentPath)) {
    console.error(`Snapshot not found: ${currentPath}`);
    process.exit(1);
  }
  const current: OaiSnapshot = JSON.parse(readFileSync(currentPath, 'utf-8'));

  // Find and load previous snapshot
  const previousVersion = findPreviousVersion(currentVersion);
  let versionDiff = {
    newEndpoints: [] as OaiEndpoint[],
    removedEndpoints: [] as OaiEndpoint[],
    parameterChanges: [] as ParamChange[],
  };

  if (previousVersion) {
    console.log(`Comparing ${previousVersion} → ${currentVersion}...`);
    const previousPath = resolve(SNAPSHOTS_DIR, `${previousVersion}.json`);
    const previous: OaiSnapshot = JSON.parse(readFileSync(previousPath, 'utf-8'));
    versionDiff = computeVersionDiff(current, previous);
    console.log(`  New endpoints: ${versionDiff.newEndpoints.length}`);
    console.log(`  Removed endpoints: ${versionDiff.removedEndpoints.length}`);
    console.log(`  Parameter changes: ${versionDiff.parameterChanges.length}`);
  } else {
    console.log(`No previous snapshot found. Skipping version diff (first run).`);
  }

  // Parse changelog for breaking changes
  let breakingChanges: ChangelogEntry[] = [];
  if (previousVersion && existsSync(CHANGELOG_PATH)) {
    const changelog = readFileSync(CHANGELOG_PATH, 'utf-8');
    const entries = parseChangelog(changelog, previousVersion, currentVersion);
    breakingChanges = entries.filter(e => e.isBreaking);
    console.log(`  Breaking changes: ${breakingChanges.length}`);
  }

  // Coverage analysis
  let coverage: CoverageAnalysis = {
    totalOaiEndpoints: current.endpointCount,
    mappedEndpoints: 0,
    mappedTools: 0,
    unmappedEndpoints: Object.values(current.endpoints),
    toolsWithParamDrift: [],
    coveragePercent: 0,
    domainCoverage: {},
  };

  if (existsSync(TOOL_MAP_PATH) && existsSync(INVENTORY_PATH)) {
    console.log('\nRunning coverage analysis...');
    const toolMap: ToolEndpointMap = JSON.parse(readFileSync(TOOL_MAP_PATH, 'utf-8'));
    const inventory: ToolInventoryEntry[] = JSON.parse(readFileSync(INVENTORY_PATH, 'utf-8'));
    coverage = computeCoverage(current, toolMap, inventory);
    console.log(`  Coverage: ${coverage.mappedEndpoints}/${coverage.totalOaiEndpoints} endpoints (${coverage.coveragePercent}%)`);
    console.log(`  Tools with param drift: ${coverage.toolsWithParamDrift.length}`);
  } else {
    console.log('\nSkipping coverage analysis (no tool-endpoint-map.json or inventory.json).');
  }

  // Build report
  const report: DriftReport = {
    oaiVersion: currentVersion,
    previousVersion: previousVersion || 'none',
    generatedAt: new Date().toISOString(),
    cliVersion: syncState.cli.version,
    sdkVersion: syncState.sdk.version,
    sdkPinned: SDK_PINNED_RANGE,
    newEndpoints: versionDiff.newEndpoints,
    removedEndpoints: versionDiff.removedEndpoints,
    parameterChanges: versionDiff.parameterChanges,
    breakingChanges,
    coverage,
    summary: {
      totalEndpoints: current.endpointCount,
      newCount: versionDiff.newEndpoints.length,
      removedCount: versionDiff.removedEndpoints.length,
      paramChangedCount: versionDiff.parameterChanges.length,
      breakingCount: breakingChanges.length,
      coveragePercent: coverage.coveragePercent,
    },
  };

  // Write report
  mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = resolve(REPORTS_DIR, `drift-${currentVersion}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(resolve(REPORTS_DIR, 'latest.json'), JSON.stringify(report, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

// Export for testing
export { computeVersionDiff, computeCoverage, findPreviousVersion };

runDiff().catch((err) => {
  console.error('Diff failed:', err);
  process.exit(1);
});
