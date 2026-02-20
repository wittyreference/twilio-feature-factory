# User Guide

A plain-language guide to getting started with Twilio Agent Factory. No prior experience with AI coding tools required.

## What is this?

You describe what you want to build in plain English — "a phone tree that routes callers to sales or support" — and an AI assistant builds working Twilio code for you. It handles voice calls, text messages, phone verification, and more. You approve the plan, the AI writes the code, and you deploy it.

## Before you start

You need four things installed. After each install, run the check command to confirm it worked.

| You need | Install | Check it worked |
|----------|---------|----------------|
| Node.js 20+ | [nodejs.org/en/download](https://nodejs.org/en/download) | `node --version` |
| Twilio CLI | `npm install -g twilio-cli` | `twilio --version` |
| Twilio Serverless plugin | `twilio plugins:install @twilio-labs/plugin-serverless` | `twilio plugins` |
| Claude Code | [claude.ai/download](https://claude.ai/download) | `claude --version` |

You also need a **Twilio account**. Sign up free at [twilio.com/try-twilio](https://www.twilio.com/try-twilio). You'll need your **Account SID** and **Auth Token** from the [Twilio Console dashboard](https://console.twilio.com/).

## Get set up

Six steps. Each one is a single command (or a quick file edit).

**1. Clone the repo**

```bash
git clone https://github.com/wittyreference/twilio-feature-factory.git
cd twilio-feature-factory
```

**2. Install dependencies**

```bash
npm install
```

**3. Create your environment file**

```bash
cp .env.example .env
```

**4. Add your Twilio credentials**

Open `.env` in any text editor. Find these three lines near the top and replace the placeholder values:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
```

Where to find them:
- **Account SID** and **Auth Token**: [console.twilio.com](https://console.twilio.com/) — they're right on the dashboard when you log in.
- **Phone Number**: If you don't have one yet, the setup script in the next step can get one for you.

**5. Run the setup script**

```bash
npm run setup
```

This walks you through provisioning Twilio resources (phone number, messaging service, etc.). It only creates what you select — skip anything you don't need yet.

**6. Make your environment variables available**

Claude Code needs your `.env` variables in the shell. The simplest way:

```bash
set -a && source .env && set +a
```

Run this once before launching Claude Code each session. (For a permanent solution, install [direnv](https://direnv.net/) — see the README for details.)

**Verify everything works:**

```bash
npm start
```

You should see output confirming the Twilio app is running locally. Press `Ctrl+C` to stop it.

## Build your first feature

This is where it gets fun. You talk to Claude Code in plain English, and it builds Twilio applications for you.

**1. Open Claude Code**

```bash
claude
```

**2. Describe what you want**

Type a plain-English description of what you want to build. Here are some examples you can try:

> Build a phone menu that greets callers and lets them press 1 for sales or 2 for support, then connects them to the right team.

> When someone texts my Twilio number with "HOURS", reply with our business hours. For anything else, reply "Thanks for your message, we'll get back to you."

> Add phone number verification to a signup flow — send a 6-digit code via SMS and verify it when the user enters it.

**3. Review the plan**

Claude Code will explore the codebase, figure out the best approach, and present a plan. Read through it. If something looks off, say so — it'll adjust. When it looks good, approve it.

**4. Watch it build**

Claude Code writes the code, creates tests, and reviews its own work. You'll see each step as it happens. It may ask for your input at a few checkpoints.

**5. Deploy**

```bash
npm run deploy:dev
```

**6. Try it out**

Call or text your Twilio phone number and see your feature in action.

## Commands you'll use every day

Inside Claude Code, you can use these slash commands. Type them exactly as shown.

| Command | What it does |
|---------|-------------|
| `/preflight` | Checks that your environment is set up correctly — credentials, CLI profile, etc. Run this if something seems off. |
| `/architect [idea]` | Gets a design review before building. Good for complex features. |
| `/deploy dev` | Deploys your code to Twilio with safety checks (runs tests and linting first). |
| `/validate call CA...` | Checks whether a specific call actually worked, beyond just "no errors." |
| `/commit` | Saves your work to git with a clear commit message. Runs tests first. |
| `/wrap-up` | End-of-session cleanup — captures what you learned, updates docs. |
| `/twilio-logs` | Shows recent errors from your Twilio account. Useful when something isn't working. |

## Three things that trip everyone up

**1. Deploying to the wrong Twilio account**

If you have multiple Twilio accounts (or a main account and subaccounts), the CLI might be pointed at the wrong one. Everything will deploy successfully — to the wrong place.

How to check:
```bash
twilio profiles:list
```

Look for the arrow (`>`) showing which profile is active. Switch with:
```bash
twilio profiles:use <profile-name>
```

**2. Changing `.env` but forgetting to redeploy**

Editing `.env` only changes your local environment. Your deployed Twilio functions still have the old values. After changing `.env`, run:

```bash
npm run deploy:dev
```

Also re-run `set -a && source .env && set +a` before your next Claude Code session so the local tools pick up the changes too.

**3. Phone number without a webhook URL**

If you call your Twilio number and hear nothing (or get an error message), the number probably doesn't have a webhook URL configured. This means Twilio doesn't know what code to run when a call comes in.

Check in the [Twilio Console](https://console.twilio.com/) under Phone Numbers > Manage > Active Numbers. Select your number and make sure "A Call Comes In" has a URL pointing to your deployed function.

## Where to go from here

- **Deeper tutorial**: [WALKTHROUGH.md](WALKTHROUGH.md) walks you through building a complete voice AI assistant step-by-step.
- **Architecture and reference**: [README.md](README.md) covers the full project structure, all available commands, and technical details.
- **Ask Claude**: Inside Claude Code, just ask questions in plain English. "How do I add call recording?" or "What Twilio products does this project support?" — it knows the codebase and can guide you.
