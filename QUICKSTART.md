<!-- ABOUTME: 10-minute quickstart guide for making an outbound call via MCP tools. -->
<!-- ABOUTME: Covers setup, credential configuration, making a call, and validation. -->

# Quick Start: Make Your First Call

Get from zero to a working outbound call in under 10 minutes. No webhooks, no ngrok, no server required.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- A Twilio account with a phone number ([sign up free](https://www.twilio.com/try-twilio))
- Node.js 20 or 22

## Step 1: Clone and Install

```bash
git clone https://github.com/wittyreference/twilio-feature-factory.git
cd twilio-feature-factory
npm install
```

## Step 2: Configure Credentials

```bash
cp .env.example .env
```

Edit `.env` with your Twilio credentials:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

Find these in your [Twilio Console](https://console.twilio.com/).

**Environment isolation** (recommended): Install [direnv](https://direnv.net/) to prevent credential conflicts:

```bash
brew install direnv
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
source ~/.zshrc
direnv allow
```

## Step 3: Make a Call

Open Claude Code in the project directory. The MCP server connects automatically and gives Claude access to Twilio API tools.

Ask Claude:

```
Make an outbound call to +1XXXXXXXXXX from my Twilio number.
Use a <Say> verb to say "Hello from the Feature Factory! Your setup is working."
```

Replace `+1XXXXXXXXXX` with your personal phone number. Your phone will ring, and you'll hear the greeting.

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
- **Run the pipeline**: Try `/orchestrate new-feature "build a voice IVR that routes to sales or support"` to run the full development pipeline with human approval gates
- **Send an SMS**: If you have A2P 10DLC registration, try `send_sms` (required for US messaging)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 401 Unauthorized | Run `./scripts/env-doctor.sh` to check for credential conflicts |
| Call doesn't connect | Verify your Twilio number is voice-capable in the Console |
| MCP tools not available | Check that `.mcp.json` exists and the server is configured |
| "Invalid 'To' number" | Use E.164 format: `+1` followed by 10 digits |
