# Commit Helper

Stage and commit changes with pre-commit validation and conventional commit messages.

## Pre-Commit Checks

Run these checks before staging. Stop and report if any fail.

### 1. TypeScript Compilation (if applicable)

If any modified files are TypeScript or under `agents/mcp-servers/twilio/`:

```bash
cd agents/mcp-servers/twilio && npx tsc --noEmit
```

### 2. Test Suite

```bash
npm test --bail
```

### 3. ABOUTME Comments

For any **new** files (untracked), verify they start with a 2-line ABOUTME comment:

```
// ABOUTME: [What this file does]
// ABOUTME: [Key behaviors or context]
```

Flag any missing ones — do not commit without them.

## Staging

Prefer staging specific files over `git add -A`:

```bash
git add <file1> <file2> ...
```

Review the diff of what will be committed:

```bash
git diff --cached
```

Do NOT stage files that likely contain secrets (`.env`, `credentials.json`, etc.).

## Commit Message

Generate a conventional commit message from the staged diff.

### Format

Use HEREDOC format. NEVER use `--no-verify`.

```bash
git commit -m "$(cat <<'EOF'
<type>: <description in imperative mood>

- Detail 1
- Detail 2

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### Types

| Type | When |
|------|------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `refactor` | Code restructuring without behavior change |
| `docs` | Documentation only |

## Post-Commit

### 1. Todo Check

Determine the todo file path:
- If `.meta/` directory exists: `.meta/todo.md`
- Otherwise: `todo.md`

If the committed work completes a todo item, check it off.

### 2. Pending Actions

Determine the pending actions path:
- If `.meta/` directory exists: `.meta/pending-actions.md`
- Otherwise: `.claude/pending-actions.md`

If the file has entries, mention any doc update suggestions related to the committed files.

## Output

```
## Commit Complete

SHA: <short sha>
Message: <commit message first line>
Files: <count> files changed

Post-commit:
- Todo: <updated / no changes>
- Pending actions: <suggestions found / none>
```

## What to Commit

$ARGUMENTS
