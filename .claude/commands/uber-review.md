---
description: Parallel multi-persona code review. Use for comprehensive architecture and code quality audits across the full repo with synthesized cross-cutting report.
model: opus
argument-hint: [scope-or-focus-area]
---

# Uber-Review

Launch parallel expert reviews of the codebase from multiple professional personas. Each reviewer gets the full repo and writes an independent assessment. Results are synthesized into a cross-cutting report.

## Overview

Six reviewer personas, each evaluating the codebase from their professional lens:

| Reviewer | Persona | Focus |
|----------|---------|-------|
| **Architect** | Senior architect at a CPaaS company | Architecture, claims validation, demo risks |
| **Test Engineer** | QA/test automation specialist (10yr) | Test quality, assertions, isolation, coverage gaps, enforcement |
| **Tech Writer** | Senior technical writer (15yr) | Information architecture, audience clarity, Diátaxis assessment |
| **Security** | Application security engineer | Credentials, injection surfaces, MCP auth model, webhook auth |
| **DevEx** | Developer experience engineer | Onboarding friction, error messages, time-to-first-success |
| **SRE** | Platform SRE / operations engineer | Failure modes, resource lifecycle, observability, deployment safety |
| **Skeptic** | Staff engineer (20yr), AI-tooling skeptic | Claim scrutiny, complexity budget, demo gap, cargo culting |

## Arguments

<user_request>
$ARGUMENTS
</user_request>

Parse arguments for flags:
- `--reviewers architect,test,docs,security,devex,sre,skeptic` — which reviewers to run (default: all)
- `--focus "specific area or question"` — optional focus area appended to each reviewer's prompt
- `--output-dir PATH` — override report directory (default: `.meta/review-reports/`)

## Reviewer-to-File Mapping

| Reviewer ID | Prompt File |
|-------------|-------------|
| `architect` | `.meta/senior-architect-review.md` |
| `test` | `.meta/test-developer-review.md` |
| `docs` | `.meta/docs-editor-review.md` |
| `security` | `.meta/security-auditor-review.md` |
| `devex` | `.meta/devex-engineer-review.md` |
| `sre` | `.meta/platform-sre-review.md` |
| `skeptic` | `.meta/skeptical-ic-review.md` |

## Execution

### Phase 1: Initialize

1. **Generate run ID**: `review-YYYYMMDD-HHMMSS`
2. **Parse `--reviewers`**: Default to all 7. Validate each ID exists in the mapping table above.
3. **Read prompt files**: For each selected reviewer, read the corresponding `.meta/*-review.md` file.
4. **Create output directory**: `.meta/review-reports/{run-id}/`

### Phase 2: Launch Parallel Reviews

For each selected reviewer, launch a **background Agent** (subagent_type: `general-purpose`) with these instructions:

```
You are conducting a codebase review. Read the full review prompt below, then explore the codebase thoroughly to produce the review it asks for.

REVIEW PROMPT:
{contents of the reviewer's .meta/*-review.md file}

{if --focus flag provided:}
ADDITIONAL FOCUS AREA:
The person requesting this review specifically wants you to pay attention to: {focus text}
{end if}

INSTRUCTIONS:
- Explore broadly first: read CLAUDE.md, DESIGN_DECISIONS.md, the directory structure, key source files, test files, hooks, and skills.
- Use Glob and Grep to find evidence. Don't just read top-level files — dig into implementation.
- Be specific: cite file paths and line numbers when making claims.
- Follow the output format specified in the review prompt exactly.
- Write your complete review as a single markdown document.

When done, output your full review as markdown. Start with a # heading using your reviewer persona name.
```

**All agents MUST be launched in a single message as parallel background agents.** Do not wait for one to finish before starting the next.

### Phase 3: Collect Results

As each background agent completes, write its output to:
`.meta/review-reports/{run-id}/{reviewer-id}.md`

### Phase 4: Synthesize Cross-Cutting Report

After ALL agents have completed, read all individual reports and produce a synthesis document at:
`.meta/review-reports/{run-id}/synthesis.md`

The synthesis should contain:

#### 1. Executive Summary (2-3 paragraphs)
What did the reviewers collectively find? What's the overall health of the codebase?

#### 2. Consensus Findings
Issues or praise that multiple reviewers independently identified. These carry the most weight.

| Finding | Raised By | Severity |
|---------|-----------|----------|
| ... | architect, sre, skeptic | High |

#### 3. Contradictions
Places where reviewers disagreed. Flag these for human judgment.

#### 4. Reviewer Highlights
One standout finding from each reviewer that the others missed — the unique value of their perspective.

#### 5. Priority Action Items
Merge all reviewers' recommendations into a single prioritized list. Deduplicate, resolve conflicts, order by:
1. Items flagged by 3+ reviewers
2. Items flagged as critical/blocking by any reviewer
3. Items flagged by 2 reviewers
4. Single-reviewer items ordered by severity

#### 6. Scorecard

| Dimension | Rating (1-5) | Primary Reviewer | Key Evidence |
|-----------|-------------|-----------------|--------------|
| Architecture | | Architect | |
| Test Quality | | Test Engineer | |
| Documentation | | Tech Writer | |
| Security Posture | | Security | |
| Developer Experience | | DevEx | |
| Operational Readiness | | SRE | |
| Claims Accuracy | | Skeptic | |
| **Overall** | **(avg)** | | |

### Phase 5: Summary

Print a summary to the user:
- Which reviewers ran
- Link to the synthesis report
- The scorecard table
- Top 3 consensus findings
- Any contradictions worth human attention
