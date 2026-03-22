---
description: Parallel multi-persona code review. Use for comprehensive architecture and code quality audits across the full repo with synthesized cross-cutting report.
model: opus
argument-hint: [scope-or-focus-area]
---

# Uber-Review

Launch parallel expert reviews of the codebase from multiple professional personas. Each reviewer gets the full repo and writes an independent assessment. A second pass of critical reviewers challenges each initial review for unstated assumptions and unsupported assertions. A third pass of arbiter reviewers produces the definitive assessment per domain. Final synthesis is sourced from arbiter reviews. Total: 30 reviews per run.

## Overview

Ten reviewer personas across three passes (30 total reviews):

| Reviewer | Persona | Focus |
|----------|---------|-------|
| **Architect** | Senior architect at a CPaaS company | Architecture, claims validation, demo risks |
| **Test Engineer** | QA/test automation specialist (10yr) | Test quality, assertions, isolation, coverage gaps, enforcement |
| **Tech Writer** | Senior technical writer (15yr) | Information architecture, audience clarity, Diátaxis assessment |
| **Security** | Application security engineer | Credentials, injection surfaces, MCP auth model, webhook auth |
| **DevEx** | Developer experience engineer | Onboarding friction, error messages, time-to-first-success |
| **SRE** | Platform SRE / operations engineer | Failure modes, resource lifecycle, observability, deployment safety |
| **Skeptic** | Staff engineer (20yr), AI-tooling skeptic | Claim scrutiny, complexity budget, demo gap, cargo culting |
| **Anthropic** | Anthropic Claude Code power-user / internal dev | Platform best practices, CLAUDE.md architecture, hooks ROI, what Anthropic should provide natively |
| **Context** | Context engineering specialist | Context window budget, layer conflicts, attention decay, compaction resilience, redundancy tax |
| **Prompt** | Prompt engineer / instruction auditor | Ambiguous instructions, contradictions across layers, dead instructions, tone conflicts, hierarchy gaps |

Each persona is reviewed in three passes:
1. **Initial** — independent codebase review against the persona's prompt
2. **Critical** — peer expert challenges the initial review for rigor, assumptions, and blind spots
3. **Arbiter** — very senior domain expert produces the definitive assessment from both inputs

## Arguments

<user_request>
$ARGUMENTS
</user_request>

Parse arguments for flags:
- `--reviewers architect,test,docs,security,devex,sre,skeptic,anthropic,context,prompt` — which reviewers to run (default: all)
- `--focus "specific area or question"` — optional focus area appended to each reviewer's prompt
- `--output-dir PATH` — override report directory (default: `.meta/review-reports/`)
- `--phases initial,critical,arbiter` — which phases to run (default: all three). Use `--phases initial` for backward-compatible 10-review behavior.
- `--resume {run-id}` — resume a previous run, skipping phases whose outputs already exist. Reads existing review files from `.meta/review-reports/{run-id}/`.

## Reviewer-to-File Mapping

| Reviewer ID | Prompt File |
|-------------|-------------|
| `architect` | `.meta/reviewers/senior-architect-review.md` |
| `test` | `.meta/reviewers/test-developer-review.md` |
| `docs` | `.meta/reviewers/docs-editor-review.md` |
| `security` | `.meta/reviewers/security-auditor-review.md` |
| `devex` | `.meta/reviewers/devex-engineer-review.md` |
| `sre` | `.meta/reviewers/platform-sre-review.md` |
| `skeptic` | `.meta/reviewers/skeptical-ic-review.md` |
| `anthropic` | `.meta/reviewers/anthropic-developer-review.md` |
| `context` | `.meta/reviewers/context-engineer-review.md` |
| `prompt` | `.meta/reviewers/prompt-engineer-review.md` |

## Domain Description Mapping

Used to inject domain context into critical and arbiter reviewer prompts:

| Reviewer ID | Domain Description |
|-------------|-------------------|
| `architect` | system architecture, API design, and platform engineering |
| `test` | test automation, QA methodology, and coverage analysis |
| `docs` | technical writing, information architecture, and documentation systems |
| `security` | application security, credential management, and threat modeling |
| `devex` | developer experience, onboarding, and tooling ergonomics |
| `sre` | site reliability, operations, deployment, and failure modes |
| `skeptic` | engineering judgment, proportionality analysis, and claim scrutiny |
| `anthropic` | Claude Code platform internals, CLAUDE.md best practices, and AI developer tooling |
| `context` | context window management, attention mechanics, and prompt engineering for LLMs |
| `prompt` | instruction design, prompt clarity, and multi-layer prompt architecture |

## Execution

### Phase 1: Initialize

1. **Generate run ID**: `YYYY-MM-DD-HHMMSS` (e.g., `2026-03-20-143052`)
2. **Parse `--reviewers`**: Default to all 10. Validate each ID exists in the mapping table above.
3. **Parse `--phases`**: Default to `initial,critical,arbiter`. Validate each phase name.
4. **Parse `--resume`**: If provided, validate the run directory exists. Read existing review files for phases that will consume them. Use the resumed run's directory instead of creating a new one.
5. **Read prompt files**: For each selected reviewer, read the corresponding `.meta/*-review.md` file.
6. **Create output directory**: `.meta/review-reports/{run-id}/` (skip if `--resume` and directory exists).

### Phase 2: Launch Parallel Initial Reviews

Skip if `--phases` does not include `initial`. Skip if `--resume` and all initial review files already exist.

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

### Phase 3: Collect Initial Results

As each background agent completes, write its output to:
`.meta/review-reports/{run-id}/{reviewer-id}.md`

Wait for ALL initial review agents to complete before proceeding.

### Phase 4: Launch Parallel Critical Reviews

Skip if `--phases` does not include `critical`.

**Prerequisite**: All initial review files must exist (from Phase 3 or `--resume`).

For each selected reviewer, read the initial review output from `{reviewer-id}.md`. Launch a **background Agent** (subagent_type: `general-purpose`) with these instructions:

```
You are a critical reviewer — a senior expert in {domain_description} conducting a peer review of a codebase review. Your job is NOT to re-review the codebase from scratch. Your job is to evaluate the quality, completeness, and accuracy of the initial review. You should verify claims by spot-checking the codebase, but your primary focus is the review document itself.

THE ORIGINAL ASSIGNMENT:
The initial reviewer was given this prompt:

<original_prompt>
{contents of the reviewer's .meta/*-review.md file}
</original_prompt>

THE INITIAL REVIEW:
Here is what they produced:

<initial_review>
{contents of {reviewer-id}.md from Phase 3}
</initial_review>

{if --focus flag provided:}
ADDITIONAL FOCUS AREA:
The person requesting this review specifically wants you to pay attention to: {focus text}
{end if}

YOUR ASSESSMENT:
Evaluate the initial review across these dimensions:

1. Unstated Assumptions
What does the initial reviewer take for granted without verifying? What assumptions underlie their conclusions? Flag any "X is true because Y" where Y was asserted but not demonstrated.

2. Unsupported Assertions
Which findings cite specific evidence (file paths, line numbers, concrete examples) and which are stated without support? A claim like "the test coverage is strong" without citing actual coverage numbers or examining test quality is unsupported.

3. Blind Spots
What did the original prompt ask for that the reviewer didn't address, or addressed superficially? What areas of the codebase relevant to this domain were not examined? What questions should the reviewer have asked but didn't?

4. Methodological Concerns
Did the reviewer explore broadly enough before forming conclusions? Did they rely too heavily on top-level files vs. digging into implementation? Is there evidence of confirmation bias (only looking for evidence that supports their initial take)?

5. Areas of Agreement
Where is the initial review well-supported and thorough? These confirmations are valuable — they add confidence to the findings. Note what the reviewer got right and why.

6. Adjusted Findings
For each major finding in the initial review, provide your assessment:
- Confirmed: Evidence supports the finding. Brief note on why.
- Strengthened: Finding is correct but understated — the reality is more significant.
- Weakened: Finding is directionally correct but overstated or missing nuance.
- Challenged: Finding may be incorrect. Present counter-evidence.

7. Missed Findings
Anything significant that the initial reviewer should have caught given their prompt and domain expertise, but didn't.

INSTRUCTIONS:
- You have full codebase read access. Use Glob and Grep to spot-check claims from the initial review.
- Be specific: cite file paths and line numbers when verifying or challenging claims.
- Your primary input is the review document above, not a fresh codebase exploration.
- Be fair. Confirming well-supported findings is just as valuable as challenging weak ones.

OUTPUT FORMAT:
Start with: # Critical Review: {Reviewer Persona Name}

End with a summary table:

| Initial Finding | Critical Assessment | Confidence |
|----------------|-------------------|------------|
| [finding from initial review] | Confirmed / Strengthened / Weakened / Challenged | High / Medium / Low |
```

**All 10 critical agents MUST be launched in a single message as parallel background agents.**

### Phase 5: Collect Critical Results

As each background agent completes, write its output to:
`.meta/review-reports/{run-id}/{reviewer-id}-critical.md`

Wait for ALL critical review agents to complete before proceeding.

### Phase 6: Launch Parallel Arbiter Reviews

Skip if `--phases` does not include `arbiter`.

**Prerequisite**: All initial AND critical review files must exist.

For each selected reviewer, read both the initial review (`{reviewer-id}.md`) and the critical review (`{reviewer-id}-critical.md`). Launch a **background Agent** (subagent_type: `general-purpose`) with these instructions:

```
You are an arbiter — a very senior, tenured, and widely respected expert in {domain_description}. You have decades of experience, you've seen patterns repeat across organizations, and your judgment is trusted precisely because you weigh evidence carefully and resist both novelty bias and excessive conservatism.

You've been asked to produce the definitive assessment for the {reviewer_persona} domain. Two other experts have already reviewed: an initial reviewer who examined the codebase, and a critical reviewer who evaluated the initial review. Your job is to synthesize their work into a final, authoritative assessment.

THE ORIGINAL ASSIGNMENT:

<original_prompt>
{contents of the reviewer's .meta/*-review.md file}
</original_prompt>

THE INITIAL REVIEW:

<initial_review>
{contents of {reviewer-id}.md}
</initial_review>

THE CRITICAL REVIEW:

<critical_review>
{contents of {reviewer-id}-critical.md}
</critical_review>

{if --focus flag provided:}
ADDITIONAL FOCUS AREA:
The person requesting this review specifically wants you to pay attention to: {focus text}
{end if}

YOUR ROLE:
You are not a tiebreaker. You are an independent assessor with access to both perspectives and the full codebase. Your assessment should:

1. Consensus Confirmation
Where initial and critical reviewers agree, confirm the finding with your own assessment of its significance. Agreement between two independent experts carries real weight — note this explicitly.

2. Disagreement Resolution
Where they disagree, examine the evidence each side presents. You may:
- Side with the initial reviewer — explain why the critical review's objection doesn't hold
- Side with the critical reviewer — explain why the initial finding was flawed
- Split the difference — the truth is somewhere between the two positions
- Reject both — neither captured the real issue; provide your own analysis
In all cases, explain your reasoning with reference to specific evidence.

3. Elevation
Identify findings that both reviewers noted but may have underweighted. Sometimes the most important insight is buried in both reviews but neither flagged it as critical.

4. Definitive Findings
Produce the authoritative list of findings for this domain. For each:
- The finding itself (one sentence)
- Severity: Critical / High / Medium / Low / Positive
- Confidence: High / Medium / Low
- Evidence summary (file paths, specific observations)
- Source: Initial / Critical / Both / Arbiter-originated

5. Definitive Recommendations
The prioritized action items for this domain. These replace the initial reviewer's recommendations where they conflict.

6. Domain Score
A single 1-5 rating for this domain with a one-paragraph justification. This score should be more calibrated than the initial reviewer's because you've seen the challenge/response cycle.

INSTRUCTIONS:
- You have full codebase read access. Use Glob and Grep to verify contested claims.
- Focus on synthesizing the two reviews, not re-reviewing from scratch.
- Where both reviewers agree and the evidence is clear, confirm concisely and move on.
- Spend your depth on disagreements and elevated findings.
- Be specific: cite file paths and line numbers when resolving disputes.

OUTPUT FORMAT:
Start with: # Arbiter Review: {Reviewer Persona Name}

End with a structured summary:

**Domain Score: X.X / 5.0**

| # | Finding | Severity | Confidence | Source |
|---|---------|----------|------------|--------|
| 1 | [finding] | Critical | High | Both |
| 2 | [finding] | High | Medium | Critical |
| ... | | | | |
```

**All 10 arbiter agents MUST be launched in a single message as parallel background agents.**

### Phase 7: Collect Arbiter Results

As each background agent completes, write its output to:
`.meta/review-reports/{run-id}/{reviewer-id}-arbiter.md`

Wait for ALL arbiter agents to complete before proceeding.

### Phase 8: Synthesize Cross-Cutting Report

After ALL phases have completed, read the arbiter reviews (primary source) and produce a synthesis document at:
`.meta/review-reports/{run-id}/synthesis.md`

If only initial reviews exist (backward-compatible `--phases initial` mode), fall back to sourcing from initial reviews using the original synthesis format.

The synthesis should contain:

#### 1. Executive Summary (2-3 paragraphs)
What did the arbiter reviewers collectively find? What's the overall health of the codebase? Note that findings have been validated through a triple-review process (initial → critical → arbiter).

#### 2. Consensus Findings
Issues or praise confirmed through the triple-review process. These carry the most weight.

| Finding | Domain | Confirmed By | Severity | Confidence |
|---------|--------|-------------|----------|------------|
| ... | architect, sre | Initial + Critical + Arbiter | High | Very High |

#### 3. Contradictions and Resolutions
Where initial and critical reviewers disagreed, and how the arbiter resolved it. Also flag cross-domain contradictions (arbiter-A says X, arbiter-B says Y).

| Domain | Disagreement | Initial Position | Critical Position | Arbiter Resolution |
|--------|-------------|-----------------|-------------------|-------------------|
| ... | ... | ... | ... | Sided with critical: ... |

#### 4. Reviewer Highlights
One standout finding from each arbiter review — the definitive insight for that domain.

#### 5. Priority Action Items
Source exclusively from arbiter "Definitive Recommendations." Deduplicate across domains, order by:
1. Items flagged by 3+ arbiter reviewers
2. Items flagged as critical by any arbiter
3. Items flagged by 2 arbiter reviewers
4. Single-arbiter items ordered by severity

#### 6. Scorecard

| Dimension | Arbiter Score | Initial Score | Delta | Key Evidence |
|-----------|-------------|---------------|-------|--------------|
| Architecture | | | | |
| Test Quality | | | | |
| Documentation | | | | |
| Security Posture | | | | |
| Developer Experience | | | | |
| Operational Readiness | | | | |
| Claims Accuracy | | | | |
| Platform Best Practices | | | | |
| Context Engineering | | | | |
| Instruction Clarity | | | | |
| **Overall** | **(avg)** | **(avg)** | | |

#### 7. Review Process Insights

**Where Critical Review Added Most Value**: Domains where the critical reviewer's challenge materially changed the final assessment.

**Where Initial Review Held Up Best**: Domains where the initial review was thorough enough that the critical review confirmed rather than challenged.

**Most Significant Disagreement**: The single most interesting point of disagreement across all domains and how the arbiter resolved it.

### Phase 9: Summary

Print a summary to the user:
- Which reviewers ran, which phases completed
- Total review count (e.g., "30 reviews: 10 initial + 10 critical + 10 arbiter")
- Link to the synthesis report
- The scorecard table (with delta column if arbiters ran)
- Top 3 consensus findings (from arbiter-confirmed findings)
- Most significant disagreement and its resolution
- Any cross-domain contradictions worth human attention
