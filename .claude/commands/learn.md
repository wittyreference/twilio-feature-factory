# Learning Exercises

Interactive learning exercises for building comprehension of autonomous work.

## What This Is

When autonomous sessions (headless, `/orchestrate`, `/team`) produce code, you see clean artifacts but miss the decision-making process. These exercises use the **generation effect** — actively engaging with code produces deeper understanding than passive review.

## How It Works

1. Claude poses a question about code produced by autonomous work, then **STOPS**
2. You respond with your thinking
3. Claude provides feedback connecting your response to the actual code
4. If your understanding has a gap, Claude says so directly, then explores it

## Rules

- **Max 2 exercises per session** — after 2 completed, stop offering
- **Decline = suppress** — if you say "skip" or decline, no more exercises this session
- **Pause for input** — after posing a question, STOP. No hints, no examples, no leading. Wait for the user's response.

## Arguments

$ARGUMENTS

## Behavior Based on Arguments

### No arguments (empty)

1. Read `.meta/learning/exercises.md` for pending exercises
2. Read `.meta/learning/exercise-state.json` for session state
3. If `exercises_declined` is true, say "Exercises suppressed for this session. Use `/learn review` for retrieval practice on past topics."
4. If `exercises_completed` >= 2, say "Session cap reached (2/2). Use `/learn review` for retrieval practice."
5. If no pending exercises, say "No exercises pending. Autonomous work generates exercises — check after your next headless run or `/orchestrate`."
6. Otherwise, show the list of pending exercises (title + file path) and ask which one to work on
7. When the user picks one, present the exercise question and STOP. Wait for their response.
8. After their response, provide feedback:
   - Read the actual file referenced in the exercise
   - Compare their prediction/understanding to what the code actually does
   - If they were wrong, say so directly, explain the gap, explore why
   - If they were right, confirm and optionally add deeper context
9. After feedback, move the exercise to `.meta/learning/completed.md` with the user's response and your feedback
10. Update `exercise-state.json`: increment `exercises_completed`, add topic to `topics_covered`

### `list`

Show all pending exercises from `.meta/learning/exercises.md` without starting one. Include:
- Exercise type (Prediction, Generation, Trace, Debug)
- File path
- When it was generated
- Source session

### `skip`

Mark exercises as declined for this session:
1. Update `.meta/learning/exercise-state.json`: set `exercises_declined` to true
2. Confirm: "Exercises suppressed for this session."

### `review`

Retrieval practice on previously completed topics:
1. Read `.meta/learning/completed.md`
2. Pick a topic from `topics_covered` in `exercise-state.json` (prefer older topics for spacing effect)
3. Ask a recall question about that topic — NOT the same question as the original exercise, but related
4. STOP and wait for the user's response
5. Provide feedback

### `generate`

Force regeneration of exercises from the session log:
1. Run the exercise generation logic (read `.meta/learning/session-log.jsonl`, generate stubs)
2. Clear `session-log.jsonl` after processing
3. Report how many exercises were generated

## Important

- Exercises only exist in `.meta/` (meta-development mode). If `.meta/` doesn't exist, say so.
- The exercise question is the point of engagement. Never dilute it with hints or partial answers before the user responds.
- Be direct in feedback. If the user's understanding is wrong, say so. Genuine correction is more valuable than false validation.
