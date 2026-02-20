// ABOUTME: Generates human-readable Markdown reports from the JSON drift report.
// ABOUTME: Produces weekly summaries of API changes and MCP tool coverage gaps.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DriftReport, OaiEndpoint, ParamChange, ToolParamDrift } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = resolve(__dirname, 'reports');
const PROJECT_ROOT = resolve(__dirname, '../..');
const API_CHANGES_PATH = resolve(PROJECT_ROOT, '.claude/references/twilio-api-changes.md');

/**
 * Generate a Markdown report from a DriftReport object.
 */
export function generateMarkdown(report: DriftReport): string {
  const lines: string[] = [];

  // Header
  lines.push('# Twilio API Drift Report');
  lines.push('');
  if (report.previousVersion && report.previousVersion !== 'none') {
    lines.push(`**OAI Version:** ${report.previousVersion} → ${report.oaiVersion} | **CLI:** ${report.cliVersion} | **SDK:** ${report.sdkVersion}`);
  } else {
    lines.push(`**OAI Version:** ${report.oaiVersion} (baseline) | **CLI:** ${report.cliVersion} | **SDK:** ${report.sdkVersion}`);
  }
  lines.push(`**Generated:** ${report.generatedAt.split('T')[0]} | **Domains tracked:** ${Object.keys(report.coverage.domainCoverage).length}`);
  lines.push('');

  // SDK/CLI version info
  lines.push('## SDK/CLI Versions');
  const sdkMajor = report.sdkVersion.split('.')[0];
  const pinnedMajor = report.sdkPinned.replace('^', '').split('.')[0];
  const sdkCompatible = sdkMajor === pinnedMajor;
  lines.push(`- SDK \`twilio\` pinned at \`${report.sdkPinned}\`, latest is ${report.sdkVersion} ${sdkCompatible ? '✅' : '⚠️ MAJOR VERSION MISMATCH'}`);
  lines.push(`- CLI \`twilio-cli\` latest is ${report.cliVersion}`);
  lines.push('');

  // Breaking changes
  lines.push(`## Breaking Changes (${report.breakingChanges.length})`);
  if (report.breakingChanges.length === 0) {
    lines.push('None detected.');
  } else {
    for (const bc of report.breakingChanges) {
      lines.push(`- **${bc.domain}** (${bc.version}): ${bc.description}`);
    }
  }
  lines.push('');

  // New endpoints
  lines.push(`## New Endpoints (${report.newEndpoints.length})`);
  if (report.newEndpoints.length === 0) {
    lines.push(report.previousVersion === 'none' ? 'Baseline scan — no previous version to compare.' : 'None.');
  } else {
    lines.push('| Domain | Method | Path | Summary |');
    lines.push('|--------|--------|------|---------|');
    for (const ep of report.newEndpoints) {
      lines.push(`| ${ep.domain} | ${ep.method.toUpperCase()} | \`${ep.path}\` | ${truncate(ep.summary, 60)} |`);
    }
  }
  lines.push('');

  // Removed endpoints
  lines.push(`## Removed Endpoints (${report.removedEndpoints.length})`);
  if (report.removedEndpoints.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Domain | Method | Path | Summary |');
    lines.push('|--------|--------|------|---------|');
    for (const ep of report.removedEndpoints) {
      lines.push(`| ${ep.domain} | ${ep.method.toUpperCase()} | \`${ep.path}\` | ${truncate(ep.summary, 60)} |`);
    }
  }
  lines.push('');

  // Parameter changes (version diff)
  lines.push(`## Parameter Changes Between Versions (${report.parameterChanges.length})`);
  if (report.parameterChanges.length === 0) {
    lines.push(report.previousVersion === 'none' ? 'Baseline scan — no previous version to compare.' : 'None.');
  } else {
    for (const pc of report.parameterChanges) {
      lines.push(`### ${pc.domain} ${pc.method.toUpperCase()} \`${pc.path}\``);
      for (const p of pc.addedParams) {
        lines.push(`- **Added:** \`${p.name}\` (${p.type}, ${p.required ? 'required' : 'optional'})`);
      }
      for (const p of pc.removedParams) {
        lines.push(`- **Removed:** \`${p.name}\` (${p.type})`);
      }
      lines.push('');
    }
  }
  lines.push('');

  // Coverage summary
  lines.push('## Coverage Summary');
  lines.push(`- **${report.coverage.mappedTools} MCP tools** mapped to **${report.coverage.mappedEndpoints} OAI endpoints** (of ${report.coverage.totalOaiEndpoints} total)`);
  lines.push(`- **Coverage: ${report.coverage.coveragePercent}%** of tracked OAI endpoints`);
  lines.push(`- **${report.coverage.unmappedEndpoints.length} unmapped endpoints**`);
  lines.push(`- **${report.coverage.toolsWithParamDrift.length} tools with parameter drift**`);
  lines.push('');

  // Tools with param drift (top actionable items)
  if (report.coverage.toolsWithParamDrift.length > 0) {
    lines.push(`## MCP Tool Parameter Drift (${report.coverage.toolsWithParamDrift.length})`);
    lines.push('');
    // Show top 20 most actionable
    const sorted = [...report.coverage.toolsWithParamDrift].sort(
      (a, b) => b.newParams.length - a.newParams.length
    );
    for (const drift of sorted.slice(0, 20)) {
      lines.push(`### ${drift.toolName} (\`${drift.toolFile}\`)`);
      lines.push(`Endpoint: \`${drift.endpoint}\``);
      for (const p of drift.newParams) {
        lines.push(`- **Missing:** \`${p.name}\` (${p.type}, ${p.required ? 'required' : 'optional'}) — ${truncate(p.description, 80)}`);
      }
      lines.push('');
    }
    if (sorted.length > 20) {
      lines.push(`*...and ${sorted.length - 20} more tools with parameter drift (see JSON report)*`);
      lines.push('');
    }
  }

  // Domain coverage table
  lines.push('## Coverage by Domain');
  lines.push('| Domain | Mapped | Total | Coverage |');
  lines.push('|--------|--------|-------|----------|');
  const domains = Object.entries(report.coverage.domainCoverage)
    .sort(([, a], [, b]) => b.total - a.total);
  for (const [domain, stats] of domains) {
    const bar = stats.percent >= 50 ? '🟢' : stats.percent >= 25 ? '🟡' : '🔴';
    lines.push(`| ${domain} | ${stats.mapped} | ${stats.total} | ${stats.percent}% ${bar} |`);
  }
  lines.push('');

  // Summary footer
  lines.push('---');
  lines.push(`*Generated by api-sync pipeline on ${report.generatedAt.split('T')[0]}*`);

  return lines.join('\n');
}

/**
 * Generate a compact API changes doc for subagent consumption.
 * Overwrites each run — shows current drift state, not history.
 */
export function generateChangesDoc(report: DriftReport): string {
  const lines: string[] = [];
  const date = report.generatedAt.split('T')[0];

  lines.push('# Twilio API Changes');
  lines.push('<!-- Auto-generated by api-sync pipeline. Do not edit manually. -->');
  lines.push(`<!-- Last updated: ${date} | OAI: ${report.oaiVersion} | SDK: ${report.sdkVersion} | CLI: ${report.cliVersion} -->`);
  lines.push('');

  // Current status
  const sdkMajor = report.sdkVersion.split('.')[0];
  const pinnedMajor = report.sdkPinned.replace('^', '').split('.')[0];
  const sdkOk = sdkMajor === pinnedMajor;
  lines.push('## Current Status');
  lines.push(`- SDK \`twilio\` pinned at \`${report.sdkPinned}\`, latest ${report.sdkVersion} ${sdkOk ? '✅' : '⚠️ MAJOR MISMATCH'}`);
  lines.push(`- ${report.coverage.mappedTools} MCP tools covering ${report.coverage.mappedEndpoints}/${report.coverage.totalOaiEndpoints} tracked endpoints (${report.coverage.coveragePercent}%)`);
  lines.push('');

  // Breaking changes
  lines.push('## Breaking Changes');
  if (report.breakingChanges.length === 0) {
    lines.push('None since last sync.');
  } else {
    for (const bc of report.breakingChanges) {
      lines.push(`- **${bc.domain}** (${bc.version}): ${bc.description}`);
    }
  }
  lines.push('');

  // Parameter drift — top 20 sorted by missing param count
  const driftItems = report.coverage.toolsWithParamDrift;
  if (driftItems.length > 0) {
    lines.push('## New Parameters for Existing Tools');
    lines.push('OAI parameters not yet in MCP tool Zod schemas:');
    lines.push('');
    lines.push('| Tool | File | Missing Params | Count |');
    lines.push('|------|------|----------------|-------|');
    const sorted = [...driftItems].sort((a, b) => b.newParams.length - a.newParams.length);
    for (const drift of sorted.slice(0, 20)) {
      const paramNames = drift.newParams.map(p => p.name).join(', ');
      lines.push(`| ${drift.toolName} | ${drift.toolFile} | ${truncate(paramNames, 60)} | ${drift.newParams.length} |`);
    }
    if (sorted.length > 20) {
      lines.push('');
      lines.push(`*...and ${sorted.length - 20} more tools with parameter drift*`);
    }
  } else {
    lines.push('## New Parameters for Existing Tools');
    lines.push('All MCP tools are in sync with OAI specs.');
  }
  lines.push('');

  // New endpoints in domains we already cover
  const coveredDomains = new Set(
    Object.entries(report.coverage.domainCoverage)
      .filter(([, stats]) => stats.mapped > 0)
      .map(([domain]) => domain)
  );
  const relevantNew = report.newEndpoints.filter(ep => coveredDomains.has(ep.domain));
  lines.push('## New Endpoints in Covered Domains');
  if (relevantNew.length === 0) {
    lines.push('None.');
  } else {
    lines.push('| Domain | Method | Path | Summary |');
    lines.push('|--------|--------|------|---------|');
    for (const ep of relevantNew.slice(0, 20)) {
      lines.push(`| ${ep.domain} | ${ep.method.toUpperCase()} | \`${ep.path}\` | ${truncate(ep.summary, 50)} |`);
    }
    if (relevantNew.length > 20) {
      lines.push('');
      lines.push(`*...and ${relevantNew.length - 20} more new endpoints*`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push(`*Generated by api-sync pipeline on ${date}*`);

  return lines.join('\n');
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Main report generation.
 */
function runReport(): void {
  const latestPath = resolve(REPORTS_DIR, 'latest.json');
  if (!existsSync(latestPath)) {
    console.error('No latest.json found in reports/. Run diff.ts first.');
    process.exit(1);
  }

  const report: DriftReport = JSON.parse(readFileSync(latestPath, 'utf-8'));
  const markdown = generateMarkdown(report);

  const mdPath = resolve(REPORTS_DIR, `drift-${report.oaiVersion}.md`);
  writeFileSync(mdPath, markdown);
  writeFileSync(resolve(REPORTS_DIR, 'latest.md'), markdown);
  console.log(`Markdown report saved: ${mdPath}`);

  // Generate compact API changes doc for subagent consumption
  const changesDoc = generateChangesDoc(report);
  writeFileSync(API_CHANGES_PATH, changesDoc);
  console.log(`API changes doc saved: ${API_CHANGES_PATH}`);

  // Print summary to stdout
  console.log('\n--- Summary ---');
  console.log(`OAI Version: ${report.oaiVersion}`);
  console.log(`New endpoints: ${report.summary.newCount}`);
  console.log(`Removed endpoints: ${report.summary.removedCount}`);
  console.log(`Parameter changes: ${report.summary.paramChangedCount}`);
  console.log(`Breaking changes: ${report.summary.breakingCount}`);
  console.log(`Coverage: ${report.summary.coveragePercent}%`);
}

runReport();
