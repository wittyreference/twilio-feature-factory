// ABOUTME: Parses the twilio-oai CHANGES.md file to extract structured change entries.
// ABOUTME: Identifies breaking changes, new paths, removed paths between two versions.

import type { ChangelogEntry } from './types.js';

/**
 * Parse CHANGES.md content and extract entries between two versions.
 * If fromVersion is empty, returns all entries up to toVersion.
 */
export function parseChangelog(
  content: string,
  fromVersion: string,
  toVersion: string,
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const versionBlocks = splitIntoVersionBlocks(content);

  let collecting = false;
  for (const block of versionBlocks) {
    if (block.version === toVersion) {
      collecting = true;
    }
    if (collecting && block.version === fromVersion) {
      break;
    }
    if (collecting) {
      entries.push(...parseVersionBlock(block));
    }
  }

  return entries;
}

interface VersionBlock {
  version: string;
  date: string;
  content: string;
}

/**
 * Split the full CHANGES.md into individual version blocks.
 * Each block starts with a line like: [2026-02-18] Version 2.6.4
 */
function splitIntoVersionBlocks(content: string): VersionBlock[] {
  const blocks: VersionBlock[] = [];
  const versionHeaderRegex = /^\[(\d{4}-\d{2}-\d{2})\]\s+Version\s+(\S+)/gm;

  let match: RegExpExecArray | null;
  const headers: Array<{ date: string; version: string; index: number }> = [];

  while ((match = versionHeaderRegex.exec(content)) !== null) {
    headers.push({
      date: match[1],
      version: match[2],
      index: match.index,
    });
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index;
    const end = i + 1 < headers.length ? headers[i + 1].index : content.length;
    blocks.push({
      version: headers[i].version,
      date: headers[i].date,
      content: content.slice(start, end),
    });
  }

  return blocks;
}

/**
 * Parse a single version block into individual changelog entries.
 * Each domain section starts with **DomainName** on its own line.
 */
function parseVersionBlock(block: VersionBlock): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = block.content.split('\n');

  let currentDomain = '';

  for (const line of lines) {
    // Match domain headers like: **Api** or **Messaging**
    const domainMatch = line.match(/^\*\*(\w[\w\s]*?)\*\*\s*$/);
    if (domainMatch) {
      currentDomain = domainMatch[1].trim();
      continue;
    }

    // Match change entries (lines starting with "- ")
    if (currentDomain && line.match(/^\s*-\s+\S/)) {
      const description = line.replace(/^\s*-\s+/, '').trim();
      // Skip sub-items that are just path listings
      if (description.startsWith('`/')) continue;

      const isBreaking = description.includes('**(breaking change)**');

      entries.push({
        version: block.version,
        date: block.date,
        domain: currentDomain,
        description: description.replace(/\s*\*\*\(breaking change\)\*\*\s*/g, '').trim(),
        isBreaking,
      });
    }
  }

  return entries;
}
