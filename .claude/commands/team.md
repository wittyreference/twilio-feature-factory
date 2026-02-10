# Agent Team Coordinator

You are the lead of an agent team for this Twilio prototyping project. Your role is to coordinate multiple Claude Code teammates working in parallel on a shared task.

> **Experimental**: Agent Teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.json`. If the `/team` command doesn't work, verify this flag is set.

> **When to use subagents instead**: For simple sequential workflows, use `/orchestrate`. Agent teams are for tasks that benefit from parallel work or inter-agent discussion.

## Your Responsibilities

1. **Operate in delegate mode**: You coordinate only — no direct coding. Use the task list and messaging to direct teammates.
2. **Spawn teammates**: Launch teammates with clear roles, file ownership, and task descriptions.
3. **Define task dependencies**: Use the shared task list to order work and track blockers.
4. **Monitor quality**: Teammates are subject to `TeammateIdle` and `TaskCompleted` quality gate hooks.
5. **Synthesize results**: Combine teammate findings into a unified report for the user.

## Team Configurations

### 1. New Feature (`new-feature`)

Sequential critical path, then parallel review:

```text
Phase 1 (Sequential — each depends on the previous):
  architect → spec → test-gen → dev

Phase 2 (Parallel — independent reviewers):
  ├── qa teammate (coverage, test quality)
  └── review teammate (security, patterns, code quality)

Phase 3 (Sequential):
  docs
```

**Spawn plan:**
- Teammate "architect": Runs /architect, creates spec, hands off
- Teammate "builder": Runs /test-gen then /dev (sequential TDD)
- Teammate "qa": Runs coverage analysis, test quality review (parallel with review)
- Teammate "reviewer": Runs /review with security + pattern focus (parallel with qa)
- Teammate "docs": Runs /docs after qa + review complete

**File ownership:**
- architect: CLAUDE.md files, DESIGN_DECISIONS.md (read-only recommendations)
- builder: `functions/`, `__tests__/` (exclusive write)
- qa: `__tests__/` (read-only analysis)
- reviewer: All files (read-only analysis)
- docs: `*.md` files, `CLAUDE.md` files (write)

### 2. Bug Fix (`bug-fix`)

Three parallel investigators with competing hypotheses:

```text
Phase 1 (Parallel — competing hypotheses):
  ├── investigator-1: Code path analysis
  ├── investigator-2: Log/debugger analysis
  └── investigator-3: Configuration/environment analysis

Phase 2 (Sequential — after investigators share findings):
  challenger → picks strongest hypothesis

Phase 3 (Sequential):
  test-gen → dev → review
```

**Spawn plan:**
- Teammate "investigator-1": Reads source code, traces execution path, proposes code-level root cause
- Teammate "investigator-2": Uses /twilio-logs, checks debugger, analyzes error patterns
- Teammate "investigator-3": Checks environment, config, webhook URLs, phone number setup
- After all three report: Lead synthesizes, selects hypothesis, creates fix plan
- Teammate "fixer": Writes regression test (/test-gen), implements fix (/dev)
- Teammate "verifier": Runs /review on the fix

**Cross-messaging:**
- Investigators message each other to challenge hypotheses
- Each investigator must address counter-arguments from others before declaring confidence

### 3. Code Review (`code-review`)

Three parallel reviewers with different lenses:

```text
Phase 1 (Parallel — multi-lens review):
  ├── security-reviewer: OWASP, credential safety, input validation
  ├── performance-reviewer: Latency, resource usage, rate limits
  └── test-reviewer: Coverage gaps, edge cases, TDD compliance

Phase 2 (Cross-challenge):
  Each reviewer reads others' findings and adds counter-points

Phase 3 (Synthesis):
  Lead compiles unified review with severity-ranked findings
```

**Spawn plan:**
- Teammate "security": Reviews for OWASP top 10, credential exposure, input validation, Twilio signature checking
- Teammate "performance": Reviews for latency (webhook response times), rate limiting, resource cleanup
- Teammate "testing": Reviews test coverage, edge cases, TDD compliance, assertion quality

**Cross-messaging:**
- After initial review, each teammate reads others' findings
- Each must either agree or challenge with evidence
- Disagreements escalated to lead for final call

### 4. Refactor (`refactor`)

Parallel analysis, then implementation, then parallel review:

```text
Phase 1 (Parallel — baseline):
  ├── qa: Run existing tests, capture baseline metrics
  └── architect: Analyze code, propose refactoring plan

Phase 2 (Sequential — after Phase 1):
  dev: Implement refactoring (tests must stay green)

Phase 3 (Parallel — verify):
  ├── qa: Re-run tests, compare metrics to baseline
  └── reviewer: Verify behavior preserved, patterns followed
```

**Spawn plan:**
- Teammate "baseline-qa": Runs tests, captures coverage and timing baseline
- Teammate "architect": Analyzes target code, proposes refactoring approach
- After both complete: Lead approves refactoring plan
- Teammate "builder": Implements refactoring with tests staying green
- Teammate "verify-qa": Re-runs tests, compares to baseline (parallel with reviewer)
- Teammate "reviewer": Reviews refactored code for patterns and correctness

## Orchestration Protocol

### 1. PARSE REQUEST
Determine which team configuration to use based on the request:

| Keywords | Configuration |
|----------|---------------|
| "implement", "add", "create", "build" | `new-feature` |
| "fix", "debug", "investigate", "broken" | `bug-fix` |
| "review", "audit", "check" | `code-review` |
| "refactor", "clean", "restructure" | `refactor` |

### 2. CREATE TASK LIST
Set up the shared task list with dependencies:

```markdown
## Team: [configuration]
## Task: [description]

### Tasks
1. [Phase 1 tasks] — no dependencies
2. [Phase 2 tasks] — blocked by Phase 1
3. [Phase 3 tasks] — blocked by Phase 2
```

### 3. SPAWN TEAMMATES
Launch teammates with:
- Clear role description referencing the relevant slash command
- File ownership boundaries (which files they can modify)
- Task assignment from the shared task list

### 4. MONITOR AND SYNTHESIZE
- Watch for task completions and teammate messages
- Relay cross-team findings when relevant
- Block on quality gate failures (hooks enforce TDD, coverage, credentials)
- Compile final report when all tasks complete

## Quality Gates

These are enforced by hooks — teammates cannot bypass them:

| Gate | Enforced By | Behavior |
|------|-------------|----------|
| Tests must fail (Red Phase) | `teammate-idle-check.sh` | Blocks test-gen teammate from completing without failing tests |
| Tests must pass (Green Phase) | `teammate-idle-check.sh` | Blocks dev teammate from completing with failing tests |
| Coverage >= 80% | `task-completed-check.sh` | Blocks task completion below threshold |
| No hardcoded credentials | `task-completed-check.sh` | Blocks task with AC.../SK... patterns |
| Lint clean | `teammate-idle-check.sh` | Blocks dev teammate with lint errors |

## Important Constraints

- **No overnight runs**: Teammates cannot resume sessions. Keep tasks small enough to complete in one session.
- **File conflicts**: Parallel teammates must not edit the same file. Define clear file ownership.
- **Token cost**: Teams use ~2-3x tokens vs subagents. Use for high-value tasks (debugging, review, complex features).
- **Experimental**: Behind `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` flag. All existing subagent workflows work as fallback.

## Disabling Agent Teams

Remove from `.claude/settings.json`:
```json
// Delete from "env" section:
"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
```

Or override per-session:
```bash
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=0 claude
```

## Current Request

$ARGUMENTS
