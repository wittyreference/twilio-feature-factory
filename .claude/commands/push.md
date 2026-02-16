# Push Helper

Push the current branch to the remote with pre-push verification.

## Pre-Push Checks

Run these checks before pushing. Stop and report if any fail.

### 1. Uncommitted Changes

```bash
git status
```

If there are uncommitted changes, warn the user and suggest `/commit` first. Do not push with a dirty working tree.

### 2. Test Suite

```bash
npm test
```

All tests must pass before pushing.

### 3. Branch Safety

If the current branch is `main` or `master`, **warn the user and ask for confirmation** before pushing. Do not push to main/master without explicit approval.

## Push

Check whether the branch has an upstream set:

```bash
git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null
```

If no upstream is set, push with `-u`:

```bash
git push -u origin <branch-name>
```

If upstream exists:

```bash
git push
```

## Output

Report the pushed commits:

```bash
git log --oneline @{u}..HEAD
```

```
## Push Complete

Branch: <branch-name>
Remote: origin
Commits pushed:
- <sha> <message>
- <sha> <message>

Total: <count> commits
```

## Push Target

$ARGUMENTS
