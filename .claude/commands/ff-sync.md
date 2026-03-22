---
description: Detect drift between factory and generic distribution. Use when checking if feature-factory source diverges from the shipped generic version.
---

# Feature Factory Sync

Detect and reconcile drift between twilio-feature-factory source files and the generic feature-factory distribution.

## Workflow

### 0. Surface value audit recommendations

Check `.meta/value-assessments/assessments/` for completed assessments with `ship` or `exclude` verdicts targeting feature-factory:

```bash
for f in .meta/value-assessments/assessments/*.json; do
    [ -f "$f" ] || continue
    jq -r '.candidates[] | select((.verdict == "ship" or .verdict == "exclude") and (.target_repos | index("ff"))) | "\(.verdict): \(.file) → ff"' "$f" 2>/dev/null
done
```

For each `ship` verdict targeting `ff`:
1. Show the proposed sync map entry (from `sync_map_entry.ff`)
2. Show the arbiter's rationale
3. Ask the user to approve or skip
4. On approval, add the entry to `../feature-factory/ff-sync-map.json` under the appropriate `mappings` category

For each `exclude` verdict:
1. Show the file and reason
2. On approval, add to the `excluded` section in `ff-sync-map.json`

Skip if no assessment files exist or none target feature-factory.

### 1. Run drift detection

```bash
cd ../feature-factory && bash scripts/ff-drift-check.sh --report
```

If no drift and no coverage gaps, report that and stop.

### 2. Verify feature-factory repo is accessible

Check that `../feature-factory` exists and is a git repo. Read `ff-sync-map.json` from that repo for mappings.

### 3. Handle coverage gaps first

If `ff-drift-check.sh --coverage` reports unmapped files, categorize each as:
- **Should map**: Generic pattern useful in feature-factory → add to `ff-sync-map.json` mappings
- **Should exclude**: Twilio-specific or meta-only → add to `ff-sync-map.json` excluded list

Present the categorization to the user for approval before proceeding to drift sync.

### 4. Process drifted files

For each drifted file:

1. Read the factory source file
2. Read the current feature-factory target file
3. Apply the documented adaptations (from `adaptationRules` in `ff-sync-map.json`):
   - `strip-twilio-patterns` — Replace AC/SK/auth token patterns with config-driven `ff_credential_patterns`
   - `strip-twilio-services` — Remove Twilio service selection, voice/messaging/verify patterns
   - `strip-twilio-examples` — Replace Twilio code examples with generic equivalents
   - `strip-twilio-invariants` — Remove Architectural Invariants section (lives in twilio-overlay)
   - `use-config-reader` — Replace hardcoded paths with `ff_config`/`ff_config_array` calls
   - `generalize-paths` — Replace `functions/` with `trackedDirectories`, `__tests__/unit/` with configurable test paths
   - `generalize-patterns` — Replace Twilio patterns with generic equivalents
   - `generalize-language` — Remove Twilio/serverless/TwiML language, use generic terms
4. For files with `syncSections`: only update those sections, preserve the rest of the target file
5. Write the updated content to the feature-factory target

### 5. Commit feature-factory changes

```bash
cd ../feature-factory && git add <changed-files> && git commit -m "sync: Update from upstream twilio-feature-factory (<count> items)"
```

### 6. Update sync state

Update `ff-sync-state.json` in the feature-factory repo:
- `lastSyncCommit`: current HEAD of twilio-feature-factory
- `lastSyncTimestamp`: current ISO 8601 timestamp

Commit the state update separately.

### 7. Verify

Run `ff-drift-check.sh --report` again to confirm 0 drift and 0 coverage gaps.

## Arguments

If arguments are provided, treat them as a filter — only sync files matching the argument pattern.
