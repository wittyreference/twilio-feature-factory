---
name: context-hub
description: External API documentation fetcher. Use when writing code that calls external APIs (OpenAI, Stripe, etc.) to get curated docs and prevent hallucinated API shapes.
---

# Context Hub — External API Documentation

Use [context-hub](https://github.com/andrewyng/context-hub) (`chub`) to fetch curated, versioned API docs before writing code that calls external APIs. This prevents hallucinated API shapes and builds cross-session memory via annotations.

## When to Use

- Before writing code that calls **non-Twilio external APIs** (Stripe, OpenAI, SendGrid, etc.)
- When unsure about current API parameters, response shapes, or SDK methods
- When the architect identifies external service dependencies

**For Twilio APIs**: Prefer the project's domain CLAUDE.md files and `/twilio-docs` skill — they are more comprehensive than context-hub's Twilio coverage. Use `chub` for Twilio only as a supplement.

## Workflow

### 1. Search for docs

```bash
chub search "<api name>"           # e.g., chub search "stripe"
chub search                        # list everything available
```

### 2. Fetch language-specific docs

```bash
chub get <id> --lang js            # e.g., chub get stripe/api --lang js
chub get <id> --lang py            # Python variant
```

### 3. Use the docs

Read the fetched content and use it to write correct code. Do not rely on memorized API shapes — use what the docs say.

### 4. Annotate what you learned

After completing the task, if you discovered a gotcha, workaround, or project-specific detail not in the doc, save it:

```bash
chub annotate <id> "Webhook verification requires raw body — do not parse before verifying"
```

Annotations persist locally across sessions and appear automatically on future `chub get` calls. Keep notes concise and actionable.

### 5. Give feedback

Rate the doc so authors can improve it. **Ask the user before sending.**

```bash
chub feedback <id> up                        # doc worked well
chub feedback <id> down --label outdated     # doc needs updating
```

Labels: `outdated`, `inaccurate`, `incomplete`, `wrong-examples`, `wrong-version`, `poorly-structured`, `accurate`, `well-structured`, `helpful`, `good-examples`.

## Quick Reference

| Goal | Command |
|------|---------|
| List everything | `chub search` |
| Find a doc | `chub search "stripe"` |
| Fetch JS docs | `chub get stripe/api --lang js` |
| Fetch Python docs | `chub get openai/chat --lang py` |
| Save a note | `chub annotate stripe/api "needs raw body"` |
| List notes | `chub annotate --list` |
| Rate a doc | `chub feedback stripe/api up` |

## Graceful Degradation

If `chub` is not installed:
1. Note it in your response: "context-hub not available — proceeding with best-effort knowledge"
2. Fall back to project CLAUDE.md files, `/twilio-docs` skill, or web search
3. Suggest the user install it: `npm install -g @aisuite/chub`

## Installation

```bash
npm install -g @aisuite/chub
```

Requires Node.js >= 18.
