# Model Bump Checklist

Run when a new Claude model ships (e.g., Opus 4.7, Sonnet 4.7). The goal is to systematically
capture improvement opportunities rather than discovering them ad hoc.

**Origin**: Informed by Cat Wu's "Product Management on the AI Exponential" — simple implementations
survive model improvements better, and workarounds should be revisited with each capability jump.

## Prerequisites

- `scripts/score-validation.sh` and `scripts/validation-trend.sh` available
- Scores baseline from previous model in `.meta/validation-reports/state/scores.jsonl`

## 1. Baseline current state

- [ ] Record current model name and date
- [ ] Run full validation suite with scoring:
  ```bash
  ./scripts/validate-provisioning.sh --score
  ./scripts/run-validation-suite.sh --score
  ```
- [ ] Count instruction file weight:
  ```bash
  wc -l CLAUDE.md .claude/rules/*.md functions/*/CLAUDE.md agents/mcp-servers/twilio/CLAUDE.md
  ```
- [ ] Count emphasis markers:
  ```bash
  grep -c 'NEVER\|ALWAYS\|MUST\|CRITICAL' CLAUDE.md .claude/rules/*.md
  ```

## 2. Test known limitation workarounds

For each emphasis-backed rule in CLAUDE.md, test whether the new model still needs it:

| Rule | Test method |
|------|-------------|
| "NEVER implement mock mode" | Run a test-gen session without the rule, check if mocks appear |
| "NO EXCEPTIONS" test policy | Run a session with calm phrasing, check if test types get skipped |
| "MUST ask permission before reimplementing" | Give a refactoring task without the MUST, check if it rewrites |
| "NEVER remove code comments" | Edit a file with comments, check if comments survive |
| "Form hypothesis first" | Give a debugging task without the instruction, check methodology |
| "NEVER silently skip steps" | Multi-step validation without the NEVER, check for step drops |

**Method**: One rule per test session. Modify CLAUDE.md to relax the rule, run a representative
task, score the output. Only remove rules where the new model consistently handles the case.

- [ ] List candidate rules (check git blame for original context)
- [ ] Test each candidate in isolation
- [ ] Record results: which rules are safe to relax, which still need emphasis

## 3. Run validation suite on new model

- [ ] Run the same validation suite as step 1
- [ ] Compare scores: `./scripts/validation-trend.sh --summary`
- [ ] Flag regressions (new model should score >= previous)
- [ ] If regressions found, investigate before proceeding

## 4. Test capability boundaries

- [ ] Try tasks that previously failed or required heavy prompting
- [ ] Test complex multi-step workflows (pipeline, team coordination)
- [ ] Document new capabilities in learnings file

## 5. Apply safe simplifications

Based on steps 2-4, make changes:

- [ ] Remove guardrails validated as unnecessary in step 2
- [ ] Consolidate duplications to single source of truth
- [ ] Compress verbose explanations without losing the rules themselves
- [ ] Update model name references if any exist
- [ ] Run validation suite again to confirm no regressions
- [ ] Commit: `"chore: model-bump audit for [model name]"`

## 6. Record results

- [ ] Log in learnings: what changed, what stayed, why
- [ ] Update `scores.jsonl` with post-change validation run
- [ ] Note the instruction weight reduction (line count before/after)
