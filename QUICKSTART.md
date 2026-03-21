<!-- ABOUTME: 10-minute quickstart guide for making an outbound call via MCP tools. -->
<!-- ABOUTME: Covers setup, credential configuration, making a call, and validation. -->

# Quick Start: Make Your First Call

Get from zero to a working outbound call in under 10 minutes. No webhooks, no ngrok, no server required.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- A Twilio account ([sign up free](https://www.twilio.com/try-twilio))
- Node.js 20 or 22

## Step 1: Clone and Install

```bash
git clone https://github.com/wittyreference/twilio-feature-factory.git
cd twilio-feature-factory
npm install
```

## Step 2: Run the Setup Wizard

```bash
./scripts/bootstrap.sh
```

This handles everything: checks prerequisites, collects your Twilio credentials, provisions resources, sets up environment isolation, and verifies the MCP server.

You'll need your **Account SID** and **Auth Token** from the [Twilio Console](https://console.twilio.com/).

## Step 3: Make a Call

Open Claude Code in the project directory. The MCP server connects automatically and gives Claude access to Twilio API tools.

Ask Claude:

```
Use the make_call MCP tool to call +1XXXXXXXXXX from my Twilio number.
Say "Hello from the Feature Factory! Your setup is working."
```

Replace `+1XXXXXXXXXX` with your personal phone number. Claude will use the MCP server's `make_call` tool (not the Twilio CLI) to place the call. Your phone will ring and you'll hear the greeting.

## Step 4: Verify the Call

Ask Claude:

```
Validate the call you just made using the validate_call tool.
```

This runs deep validation — checking call status, Voice Insights metrics, and debugger alerts. You'll see a structured report confirming the call connected successfully.

## What Just Happened

1. Claude used the MCP server's `make_call` tool to call the Twilio REST API
2. Twilio placed an outbound call from your number to your phone
3. The `<Say>` TwiML verb converted text to speech
4. The `validate_call` tool checked call status, duration, and error logs

No serverless functions were deployed. No webhooks were configured. Claude talked directly to Twilio's API through the MCP server.

## Next Steps

- **Build a full feature**: See [WALKTHROUGH.md](WALKTHROUGH.md) for a guided 30-minute tutorial building a Voice AI Assistant with call summary
- **Explore MCP tools**: Ask Claude "What Twilio tools are available?" to see the full inventory
- **Run the pipeline**: Try `/architect "voice IVR that routes to sales or support"` to start the development pipeline — Claude will guide you through spec, test-gen, dev, review, and docs phases
- **Send an SMS**: If you have A2P 10DLC registration, try `send_sms` (required for US messaging)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 401 Unauthorized | Run `./scripts/env-doctor.sh` to check for credential conflicts |
| Call doesn't connect | Verify your Twilio number is voice-capable in the Console |
| MCP tools not available | 1. Verify `agents/mcp-servers/twilio/dist/serve.js` exists. 2. Run `./scripts/verify-mcp.sh` to test startup. 3. Exit Claude Code completely and relaunch. 4. If using direnv, run `direnv allow` |
| Claude uses CLI instead of MCP | MCP tools may need hydration. Ask Claude to use the `make_call` MCP tool explicitly. If it says tools aren't available, ask it to run `ToolSearch("select:mcp__twilio__make_call")` |
| "Invalid 'To' number" | Use E.164 format: `+1` followed by 10 digits |
