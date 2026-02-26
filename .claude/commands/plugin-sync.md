# Plugin Sync

Detect and reconcile drift between factory source files and the twilio-claude-plugin distribution.

## Workflow

### 1. Run drift detection

Run the drift detection script to identify which factory files have changed since the last plugin sync:

```bash
scripts/plugin-drift-check.sh --report
```

If no drift is detected, report that and stop.

### 2. Verify plugin repo is accessible

Check that the plugin repo exists at the path specified in `.claude/plugin-sync-map.json` (`plugin_repo` field). Read the sync map to get the path. If the plugin repo is not found, report the error and stop.

### 3. Group drifted files by adaptation complexity

Read `.claude/plugin-sync-map.json` and categorize drifted files into three groups:
- **Minimal**: adaptation is `minimal` or `frontmatter` only — near-identical copies
- **Strip**: adaptation involves `strip-*` operations — mechanical removals
- **Complex**: adaptation involves `generalize-*`, `extract-*`, or `restructure` — requires judgment

Present the groups to the user so they can see the scope of work.

### 4. Process each drifted file

For each drifted file, in order from minimal to complex:

1. Read the factory source file
2. Read the current plugin target file
3. Show what changed in the factory source (use `git diff <last-sync-commit> -- <factory-path>` if a last sync commit exists)
4. Apply the documented adaptations (from the `adaptation` field in the sync map)
5. Present the proposed plugin file content for user review
6. On approval, write the updated content to the plugin target

**Adaptation reference** (from `adaptation_types` in the sync map):
- `frontmatter` — Add YAML frontmatter block with name and description
- `frontmatter-agent` — Add YAML frontmatter with name, description, and `model: opus`
- `strip-mcp` — Remove MCP tool references, replace with CLI alternatives
- `strip-factory-paths` — Remove references to `functions/`, `agents/`, `.claude/`, `.meta/` paths
- `strip-meta-mode` — Remove `_meta-mode.sh` sourcing and `CLAUDE_META_MODE` checks
- `strip-flywheel` — Remove flywheel-doc-check.sh calls and pending-actions integration
- `strip-auto-clear` — Remove auto-clear pending actions section
- `strip-compact` — Remove compact-pending marker detection
- `strip-team-refs` — Remove `/team` references and Agent Teams mentions
- `generalize-agents` — Replace factory-specific agent names with generic terms
- `generalize-role` — Rewrite from factory command to portable agent perspective
- `extract-invariants` — Extract only the Architectural Invariants section
- `simplify` — Reduce to core functionality
- `minimal` — Near-identical copy

### 5. Commit plugin changes

After all files are processed:
1. Stage the changed files in the plugin repo
2. Create a commit with message: `sync: Update from upstream factory (<count> files)`
3. Show the commit for review

### 6. Republish MCP server if stale

Check whether `agents/mcp-servers/twilio/src` has source changes since the last npm publish:

```bash
scripts/plugin-drift-check.sh --report  # Look for "MCP SERVER STALE" section
```

If the MCP server source is stale (source commits exist after the last `package.json` change):

1. Bump the patch version in `agents/mcp-servers/twilio/package.json` (e.g., 1.1.0 → 1.1.1)
2. Build: `cd agents/mcp-servers/twilio && npm run build`
3. Publish: `cd agents/mcp-servers/twilio && npm publish`
4. Commit the version bump in the factory repo: `fix: Bump MCP server to <version> for npm publish`

This is automatic — do not ask the user whether to republish. If source changed, republish. The plugin's `.mcp.json` uses `@latest` so consumers pick up the new version on next `npx` invocation.

### 7. Update sync state

After successful sync, update `.claude/plugin-sync-state.json` with:
- `last_sync_commit`: current HEAD of the factory repo
- `last_sync`: current ISO 8601 timestamp

## Arguments

$ARGUMENTS

If arguments are provided, treat them as a filter — only sync files matching the argument pattern (e.g., `/plugin-sync hooks` syncs only hook files, `/plugin-sync voice` syncs only voice-related files).
