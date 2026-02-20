// ABOUTME: Tests for CHANGES.md parsing logic.
// ABOUTME: Verifies extraction of version entries and breaking change detection.

import { parseChangelog } from '../parse-changelog.js';

const SAMPLE_CHANGELOG = `
[2026-02-18] Version 2.6.4
--------------------------
**Api**
- Remove inequality examples from Calls StartTime and EndTime filter descriptions

**Messaging**
- Add new compliance endpoint for messaging services

[2026-02-04] Version 2.6.3
--------------------------
**Api**
- Corrected the type used for phone number capabilities **(breaking change)**
- Added new parameter for machine detection

**Studio**
- Minor documentation updates

[2026-01-22] Version 2.6.2
--------------------------
**Verify**
- Added silent network auth support
`;

describe('parseChangelog', () => {
  test('extracts entries between two versions', () => {
    const entries = parseChangelog(SAMPLE_CHANGELOG, '2.6.2', '2.6.4');
    // Should include 2.6.4 and 2.6.3 entries, not 2.6.2
    expect(entries.length).toBeGreaterThan(0);
    const versions = new Set(entries.map(e => e.version));
    expect(versions.has('2.6.4')).toBe(true);
    expect(versions.has('2.6.3')).toBe(true);
    expect(versions.has('2.6.2')).toBe(false);
  });

  test('detects breaking changes', () => {
    const entries = parseChangelog(SAMPLE_CHANGELOG, '2.6.2', '2.6.4');
    const breaking = entries.filter(e => e.isBreaking);
    expect(breaking).toHaveLength(1);
    expect(breaking[0].domain).toBe('Api');
    expect(breaking[0].description).toContain('phone number capabilities');
  });

  test('extracts domain names correctly', () => {
    const entries = parseChangelog(SAMPLE_CHANGELOG, '2.6.2', '2.6.4');
    const domains = new Set(entries.map(e => e.domain));
    expect(domains.has('Api')).toBe(true);
    expect(domains.has('Messaging')).toBe(true);
    expect(domains.has('Studio')).toBe(true);
  });

  test('strips breaking change marker from description', () => {
    const entries = parseChangelog(SAMPLE_CHANGELOG, '2.6.2', '2.6.4');
    const breaking = entries.find(e => e.isBreaking);
    expect(breaking?.description).not.toContain('**(breaking change)**');
  });

  test('returns empty when no entries in range', () => {
    const entries = parseChangelog(SAMPLE_CHANGELOG, '2.6.4', '2.6.4');
    // From and to are the same — should return empty or just the to version
    expect(entries).toHaveLength(0);
  });

  test('returns all entries up to version when fromVersion is empty', () => {
    const entries = parseChangelog(SAMPLE_CHANGELOG, '', '2.6.4');
    expect(entries.length).toBeGreaterThan(0);
    // Should include entries from all versions
    const versions = new Set(entries.map(e => e.version));
    expect(versions.has('2.6.4')).toBe(true);
    expect(versions.has('2.6.3')).toBe(true);
    expect(versions.has('2.6.2')).toBe(true);
  });
});
