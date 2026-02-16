<!-- ABOUTME: Prompt file for the headless runner's test-fix task. -->
<!-- ABOUTME: Runs tests, diagnoses failures, fixes code, and commits with retry logic. -->

Run the test-fix cycle:

1. Run `npm test` to execute the full test suite.
2. If all tests pass, report success and exit.
3. If any tests fail:
   a. Analyze the failure output to identify root causes.
   b. Fix the failing code (not the tests, unless the tests are wrong).
   c. Re-run `npm test` to confirm all tests pass.
   d. If tests still fail, repeat from step 3 (max 3 attempts).
4. Run `npm run lint` to verify no linting regressions.
5. Use `/commit` to commit the fixes with a conventional commit message.

Report a summary of what was fixed and the final test/lint status.
