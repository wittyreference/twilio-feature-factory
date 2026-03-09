# Recall — Knowledge Search

Search accumulated project knowledge for a topic.

## Topic

<user_request>
$ARGUMENTS
</user_request>

## Behavior

**If no topic provided** (empty arguments): Show this usage summary and list the searchable sources below.

**If topic provided**: Search all sources below for the keyword (case-insensitive). Present results grouped by source, showing the matching section header plus 2-3 lines of context. If no matches found, scan section headers across all sources and suggest related topics.

## Search Sources (in priority order)

Determine environment first:
- If `.meta/` exists → meta-development mode (learnings at `.meta/learnings.md`, archive at `.meta/learnings-archive.md`)
- Otherwise → standard mode (learnings at `.claude/learnings.md`, archive at `.claude/learnings-archive.md`)

Search these sources using grep (case-insensitive, with `-C 3` context):

1. **Active learnings** — `{learnings-dir}/learnings.md`
   - Session discoveries, debugging insights, API quirks
   - Entries follow `## [YYYY-MM-DD] Session N — Topic` format

2. **Learnings archive** — `{learnings-dir}/learnings-archive.md`
   - Cleared/promoted learnings from older sessions

3. **Design decisions** — `DESIGN_DECISIONS.md`
   - Architectural choices with context, rationale, and alternatives
   - Entries follow `## Decision N: Title` format

4. **Operational gotchas** — `.claude/references/operational-gotchas.md`
   - Cross-cutting issues and workarounds

5. **Domain CLAUDE.md files** — `functions/*/CLAUDE.md` and `agents/*/CLAUDE.md`
   - Domain-specific patterns, gotchas, and conventions

6. **Auto-memory** — `~/.claude/projects/-Users-mcarpenter-workspaces-twilio-feature-factory/memory/MEMORY.md`
   - Cross-session persistent memory

## Output Format

For each source with matches:

```
### Source Name (path)
**Section: [matching header]**
> [2-3 lines of matching context]

**Section: [another match]**
> [context]
```

If results span more than 3 sources, add a brief summary at the top noting how many matches were found across how many sources.

## Notes

- Use grep for speed — don't read entire files unless matches are found
- Show the most relevant matches first (learnings and decisions before domain docs)
- If the topic is broad (e.g., "voice", "sync"), limit to 3 matches per source to avoid overwhelming output
