---
description: Three-pass adversarial review of uncommitted-to-sync-map work. Use when checking if recent work should ship to twilio-claude-plugin or feature-factory repos.
---

# Value Audit

Detect cognitive work committed to twilio-feature-factory that is not in any sync map, then run a three-pass adversarial review to assess whether it should ship downstream.

## Prerequisites

- `.meta/` must exist (meta-development mode only)
- Both sync maps should be accessible:
  - Plugin: `.meta/sync-map.json`
  - Feature Factory: `../feature-factory/ff-sync-map.json`

## Workflow

### 1. Gather Candidates

Read `.meta/value-assessments/pending.jsonl` for unreviewed entries (lines where `reviewed` is `false`).

If `pending.jsonl` is empty or doesn't exist, fall back to a live scan:

```bash
# Get all files from recent commits (last 20 commits or since last sync, whichever is fewer)
LAST_PLUGIN_SYNC=$(jq -r '.last_sync_commit // empty' .claude/plugin-sync-state.json 2>/dev/null)
if [ -n "$LAST_PLUGIN_SYNC" ]; then
    git log --name-only --pretty=format: "$LAST_PLUGIN_SYNC"..HEAD | sort -u | grep -v '^$'
else
    git log --name-only --pretty=format: -20 | sort -u | grep -v '^$'
fi
```

Filter to syncable directories only:
- `.claude/skills/`, `.claude/commands/`, `.claude/hooks/`, `.claude/rules/`, `.claude/references/`
- `functions/*/CLAUDE.md`, `functions/*/REFERENCE.md`
- `scripts/*.sh`

Check each against both sync maps (mappings AND excluded sections). Candidates are files in syncable directories that appear in neither sync map.

If zero candidates, report "No value leakage candidates found" and stop.

### 2. Read Context for Review

For each candidate file:
1. Read the file's full content
2. Note its directory/category (skill, command, hook, rule, reference, script)

Also read (for reviewer context):
- `.meta/sync-map.json` — the `adaptation_types` section (so reviewers know what adaptations are available)
- The `excluded` sections of both sync maps (so reviewers understand what's been deliberately excluded and why)

### 3. Launch Parallel Reviewers

Launch two Opus subagents **in parallel** (single message, two Agent tool calls):

#### Agent 1: Value Advocate

```
You are reviewing committed work in twilio-feature-factory for reusable value that should ship to downstream repos (twilio-claude-plugin and/or feature-factory).

## Downstream Repos
- **twilio-claude-plugin**: Claude marketplace plugin for Twilio. Ships MCP tools, Twilio-specific skills, commands, and references. Users install this into any project for Twilio API access.
- **feature-factory**: Platform-agnostic development toolkit. Ships generic hooks, commands, skills for TDD workflow, context management, and multi-agent patterns. No Twilio-specific content.

## Available Adaptation Types
[Insert adaptation_types from sync-map.json]

## Candidate Files
[Insert each candidate file path and its full content]

## Your Task
For each candidate file, argue for why it should ship downstream. Be generous but evidence-based. Provide:

1. **Value proposition**: What specific capability or knowledge do downstream users gain?
2. **Target repo(s)**: plugin, feature-factory, or both — with reasoning
3. **Required adaptations**: Which adaptation types from the catalog would be needed?
4. **Proposed sync map entry**: The exact JSON entry to add (category, source/factory path, target/plugin path, adaptation string)
5. **Maintenance cost**: What ongoing sync burden does this add?

If a file genuinely should NOT ship (e.g., it's purely factory-internal tooling), say so — being an advocate doesn't mean being uncritical.
```

#### Agent 2: Adversarial Critic

```
You are a skeptical reviewer assessing whether work in twilio-feature-factory should ship to downstream repos. Your job is to independently identify reasons it should NOT ship, or risks if it does.

## Downstream Repos
- **twilio-claude-plugin**: Claude marketplace plugin for Twilio. Must not contain factory-internal tooling, meta-mode references, or factory-workshop paths.
- **feature-factory**: Platform-agnostic toolkit. Must not contain Twilio-specific content, hardcoded credential patterns, or factory-specific paths.

## Currently Excluded Files (deliberately not shipped)
[Insert excluded sections from both sync maps]

## Candidate Files
[Insert each candidate file path and its full content]

## Your Task
For each candidate file, independently assess these risk dimensions:

1. **Meta-mode leakage**: Does it reference `.meta/`, `CLAUDE_META_MODE`, `factory-workshop`, session state files, `.sessions/`, or other meta-only infrastructure? These MUST NOT ship.
2. **Factory coupling**: Does it depend on factory-specific files, paths, conventions, or other hooks/skills that don't exist downstream?
3. **False generalization**: Does it look generic but actually only work in the maintainer's fully-configured environment?
4. **Maintenance burden**: Would adding this to a sync map create ongoing sync cost disproportionate to its value? How often does this file change?
5. **Assertions without evidence**: Would a claim of "reusability" be based on actual downstream need, or just assumption?
6. **Completeness**: Is this file self-contained, or does it require other unmapped files to function?
7. **Pattern match with excluded**: Does this file resemble something already in the excluded list? If so, was the exclusion deliberate?

For each file, provide:
- **Risk rating**: low / medium / high
- **Specific concerns**: concrete issues, not vague warnings
- **Verdict**: should-not-ship / needs-work / acceptable-risk
```

### 4. Synthesize: Objective Arbiter

After both agents complete, synthesize their outputs in the main context.

For each candidate file, produce a structured verdict by weighing both perspectives:

- Where Advocate and Critic **agree**, note the consensus
- Where they **disagree**, weigh the evidence and explain your reasoning
- Factor in: Does this file fill a gap that downstream users have complained about? Is there prior art (similar files already shipped)?

Produce the assessment JSON for each file:

```json
{
  "file": ".claude/skills/example.md",
  "verdict": "ship",
  "target_repos": ["plugin"],
  "adaptations_needed": ["frontmatter", "strip-factory-paths"],
  "sync_map_entry": {
    "plugin": {
      "category": "skills",
      "factory": ".claude/skills/example.md",
      "plugin": "skills/example/SKILL.md",
      "adaptation": "frontmatter,strip-factory-paths"
    },
    "ff": null
  },
  "confidence": "high",
  "advocate_key_points": ["Encodes reusable pattern for X"],
  "critic_key_points": ["References functions/ path in one example"],
  "arbiter_rationale": "Value is clear, path reference is addressable via existing adaptation.",
  "risks_if_shipped": ["One more sync target to maintain"],
  "risks_if_not_shipped": ["Downstream users must independently discover this pattern"]
}
```

Verdict values:
- **ship**: Should be added to sync map(s). Assessment includes the exact entry to add.
- **exclude**: Should be added to the sync map excluded list. Not appropriate for downstream.
- **defer**: Needs modification before it could ship (e.g., remove a `.meta/` dependency first). Note what needs to change.

### 5. Write Assessment

Write the full assessment to `.meta/value-assessments/assessments/{YYYY-MM-DD-HHmmss}.json`:

```json
{
  "timestamp": "2026-03-22T...",
  "commit_range": "abc1234..def5678",
  "review_method": "hybrid_parallel",
  "candidates_reviewed": 3,
  "verdicts": {"ship": 1, "exclude": 1, "defer": 1},
  "candidates": [ ...per-file assessments... ]
}
```

Mark reviewed entries in `pending.jsonl` — rewrite the file excluding reviewed commits, or truncate if all reviewed.

### 6. Report Summary

Output a human-readable summary:

```markdown
## Value Audit Complete

**Reviewed**: N candidate file(s) from M commit(s)

| File | Verdict | Target | Confidence |
|------|---------|--------|------------|
| .claude/skills/foo.md | ship | plugin | high |
| .claude/hooks/bar.sh | exclude | — | high |
| scripts/baz.sh | defer | both | medium |

### Ship Recommendations
- `.claude/skills/foo.md` → plugin (adaptation: frontmatter,strip-factory-paths)
  - Rationale: [arbiter summary]

### Exclusion Recommendations
- `.claude/hooks/bar.sh` — [reason]

### Deferred (needs work first)
- `scripts/baz.sh` — [what needs to change]

**Next**: Run `/plugin-sync` or `/ff-sync` to apply approved recommendations.
```

## Arguments

<user_request>
$ARGUMENTS
</user_request>

If arguments are provided:
- `--dry-run`: Show candidates without running the review
- `--since <commit>`: Override the commit range for candidate discovery
- A file path: Review only that specific file
