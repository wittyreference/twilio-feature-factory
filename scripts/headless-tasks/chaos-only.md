<!-- ABOUTME: Headless-adapted chaos validation: generate novel bad input, evaluate architect resilience, score 5 dimensions. -->
<!-- ABOUTME: No Twilio API calls — purely prompt-based evaluation. Safe to run in parallel with other validations. -->

You are running headless via `claude -p`. You have NO interactive terminal.

**CRITICAL CONSTRAINTS — read these first:**
- Do NOT use `AskUserQuestion` — it blocks forever in headless mode
- Do NOT use the `Skill` tool or slash commands (`/architect`, `/spec`, etc.) — they terminate the headless session prematurely
- Do NOT use `${}` parameter substitution or `$()` command substitution in Bash — the sandbox blocks them
- Do NOT make any Twilio API calls — this validation is purely prompt-based

**Your job**: Generate 4 novel chaos scenarios, evaluate how the architect agent's instructions would handle them, score resilience, and write structured results.

## Step 1: Initialize

Create a working directory and state file:
```bash
python3 -c "
import json, os
from datetime import datetime
run_id = 'chaos-' + datetime.now().strftime('%Y%m%d-%H%M%S')
print(run_id)
"
```

Read the report directory from environment:
```bash
python3 -c "import os; print(os.environ.get('REGRESSION_REPORT_DIR', '.meta/regression-reports'))"
```

## Step 2: Load Architect Context

Read the architect agent's instructions to understand what it knows and how it should respond:
- Read `.claude/commands/architect.md` (the architect's full prompt)
- Read `CLAUDE.md` (root — architectural invariants, pipeline rules)
- Read `.claude/rules/serverless-invariants.md` (domain rules)

These define the "toolchain" you're testing. Your chaos scenarios test whether these instructions adequately handle bad input.

## Step 3: Generate 4 Chaos Scenarios

Generate 4 novel developer request prompts that test the toolchain's resilience. Each scenario should feel like something a real developer would type.

Use these archetypes (mix them — use a different one for each scenario):
- **Vague Requester**: Describes outcomes, not inputs. "I want to text my users."
- **Platform Migrator**: Uses Vonage/AWS Connect terminology. "I need a flow for my campaign."
- **Copy-Paste Dev**: References deprecated APIs (Conversations, Autopilot, Programmable Chat).
- **Enterprise Architect**: Over-engineers. Wants Flex for 3-person team.
- **Weekend Hacker**: Skips error handling, wants credentials in browser JS.
- **Compliance Officer**: Frames everything in regulatory terms, asks for contradictions (record everything + PCI).
- **Non-Technical Founder**: Business language only. "We need to reach out to our customers."

Each scenario should target 1-2 chaos categories:
- C1: Vague/underspecified
- C2: Wrong product/terminology
- C3: Missing critical requirements
- C4: Conflicting requirements
- C5: Scope mismatch
- C6: Beginner misconceptions
- C7: Toolchain edge cases

For each scenario, write down:
1. The archetype and categories
2. The exact prompt text
3. What a good response looks like
4. What a bad response looks like

## Step 4: Evaluate Each Scenario

For each scenario, mentally execute the architect's instructions against the prompt. The architect agent's prompt (from Step 2) defines its behavior. Evaluate:

Would the architect, following its documented instructions:
1. Detect the problem in the request?
2. Ask clarifying questions or push back?
3. Catch the issue before it cascades to spec/dev?
4. Recover cleanly after detection?

Score each scenario on 5 dimensions:

**1. Detection** (0-5):
- 5: Explicitly names the specific issue
- 3: Makes a decision that avoids the problem without naming it
- 1: Proceeds without recognizing the issue
- 0: Toolchain would crash or produce dangerous output

**2. Response Quality** (0-5):
- 5: Asks specific clarifying question before proceeding
- 4: Pushes back with alternative approach
- 2: Silently corrects without explaining
- 1: Silently accepts the problematic input

**3. Cascade Containment** (0-5):
- 5: Caught at architect phase
- 4: Would be caught at spec
- 2: Would cascade to dev/review
- 0: Would reach deployment

**4. Recovery** (0-5):
- 5: Clean recovery — issue fixed, productive output follows
- 3: Partial — identified but suboptimal output
- 1: Stalled or stuck

**5. Invariant Coverage** (0-5):
- 5: Relevant invariant exists in CLAUDE.md/rules that prevents the issue
- 3: Partially covered by existing guidance
- 0: No guidance exists for this scenario

**Resilience Score** = average of 5 dimensions (0-5 scale)

## Step 5: Write Results

Write a structured JSON results file. Use the Write tool to create the file at the path from Step 1:

```json
{
  "runId": "chaos-YYYYMMDD-HHMMSS",
  "timestamp": "ISO timestamp",
  "scenarioCount": 4,
  "averageResilience": 0.0,
  "scenarios": [
    {
      "id": 1,
      "archetype": "vague-requester",
      "categories": ["C1"],
      "prompt": "The exact developer prompt",
      "expectedGoodBehavior": "What the architect should do",
      "expectedBadBehavior": "What would happen if it fails",
      "scores": {
        "detection": 5,
        "responseQuality": 4,
        "cascadeContainment": 5,
        "recovery": 5,
        "invariantCoverage": 3
      },
      "resilienceScore": 4.4,
      "analysis": "Brief explanation of scoring rationale"
    }
  ],
  "categoryBreakdown": {
    "C1": { "avgScore": 0.0, "count": 0 },
    "C2": { "avgScore": 0.0, "count": 0 }
  },
  "archetypeBreakdown": {
    "vague-requester": { "avgScore": 0.0, "count": 0 }
  },
  "recommendations": [
    "Actionable improvement based on findings"
  ]
}
```

Write this to `$REGRESSION_REPORT_DIR/chaos-results.json` (use the path from Step 1).

Also write to `.meta/regression-reports/chaos-results.json` as a fallback if the env var wasn't set.

## Step 6: Capture Learnings

Write a learnings file to the report directory for the documentation flywheel. This file will be consolidated by the orchestrator into `.meta/learnings.md` after all lanes complete.

Use the Write tool to create `$REGRESSION_REPORT_DIR/chaos-learnings.md` (use python3 to get the path):

```markdown
### Chaos Validation Learnings

**Discoveries:**

1. **[Finding from scenario with lowest resilience score]**: Describe what was weak
   - Specific invariant gap or missing guidance
   - Suggested improvement

2. **[Any surprising result]**: Describe what was unexpected
   - Why it matters

**Recommendations:**
- [Top 2-3 actionable items from the recommendations array]
```

Only include genuine findings — if all scores are 4.5+, just write "No significant gaps found" with the average score. Don't manufacture learnings.

## Step 7: Print Summary

Print a summary table as your final output (this is the last step):

| Scenario | Archetype | Categories | Resilience | Weakest Dimension |
|----------|-----------|------------|-----------|-------------------|
| 1 | ... | ... | X.X | ... |
| 2 | ... | ... | X.X | ... |
| 3 | ... | ... | X.X | ... |
| 4 | ... | ... | X.X | ... |

**Average Resilience**: X.X / 5.0
**Recommendations**: [list top 2-3 improvements]

## Pacing

You have up to 60 turns. Budget:
- Steps 1-2: 5 turns (setup + context loading)
- Step 3: 10 turns (scenario generation)
- Step 4: 20 turns (evaluation — 5 per scenario)
- Steps 5-7: 8 turns (results + learnings + summary)

Do NOT spend more than 5 turns on any single scenario evaluation.
