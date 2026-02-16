<!-- ABOUTME: Prompt file for the headless runner's validate task. -->
<!-- ABOUTME: Runs preflight, tests, and lint with step-by-step status reporting. -->

Run the following validation steps in order. Report status for every step.

1. Run `/preflight` to verify environment (CLI profile, env vars, auth).
2. Run `npm test --bail` to execute the full test suite, stopping at first failure.
3. Run `npm run lint` to check for linting errors.

At the end, provide a summary table:

| Step | Status | Notes |
|------|--------|-------|
| Preflight | PASS/FAIL | ... |
| Tests | PASS/FAIL | ... |
| Lint | PASS/FAIL | ... |

If any step fails, report the failure details but continue with remaining steps.
