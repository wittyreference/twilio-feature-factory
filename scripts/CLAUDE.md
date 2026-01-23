# Scripts Directory

This directory contains CLI scripts for project setup and maintenance.

## Available Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `setup.js` | `npm run setup` | Interactive setup for provisioning Twilio resources |

## Setup Script

The setup script (`scripts/setup.js`) provides an interactive CLI for bootstrapping a Twilio Agent Factory project:

### What it does

1. **Credential Validation**: Prompts for Account SID and Auth Token if not in .env
2. **Resource Selection**: Interactive checkboxes to select which resources to provision
3. **Resource Provisioning**: Creates selected resources via Twilio API
4. **Callback Deployment**: Deploys status callback Functions via Serverless Toolkit
5. **Webhook Configuration**: Configures all resources to use deployed callback URLs
6. **Environment Update**: Updates .env file with new SIDs and URLs

### Resources Available for Provisioning

| Resource | Creates | Env Variable |
|----------|---------|--------------|
| Phone Number | Local US number (SMS+Voice enabled) | `TWILIO_PHONE_NUMBER` |
| Verify Service | OTP verification service | `TWILIO_VERIFY_SERVICE_SID` |
| Sync Service | Real-time state sync | `TWILIO_SYNC_SERVICE_SID` |
| Messaging Service | Sender pools, compliance | `TWILIO_MESSAGING_SERVICE_SID` |
| TaskRouter Workspace | Skills-based routing | `TWILIO_TASKROUTER_WORKSPACE_SID` |
| TaskRouter Workflow | Default routing workflow | `TWILIO_TASKROUTER_WORKFLOW_SID` |
| Callback Functions | Status callback handlers | `TWILIO_CALLBACK_BASE_URL` |

### Usage

```bash
# Run interactively
npm run setup

# Or directly
node scripts/setup.js
```

### Prerequisites

- Node.js 18+
- Twilio CLI installed (`npm install -g twilio-cli`)
- Serverless plugin installed (`twilio plugins:install @twilio-labs/plugin-serverless`)
- Valid Twilio Account SID and Auth Token

### What Gets Deployed

When "Callback Functions" is selected, the script deploys:

- `functions/callbacks/message-status.protected.js` - SMS/MMS delivery callbacks
- `functions/callbacks/call-status.protected.js` - Voice call status callbacks
- `functions/callbacks/task-status.protected.js` - TaskRouter event callbacks
- `functions/callbacks/verification-status.protected.js` - Verify callbacks
- `functions/callbacks/fallback.protected.js` - Universal fallback handler
- `functions/callbacks/helpers/sync-logger.private.js` - Shared logging utility

All callbacks log to Sync for deep validation during testing.

### Callback URL Configuration

After deployment, the script automatically configures:

| Resource | Callback URL | Fallback URL |
|----------|-------------|--------------|
| Phone Number | `/callbacks/message-status`, `/callbacks/call-status` | `/callbacks/fallback` |
| Messaging Service | `/callbacks/message-status` | `/callbacks/fallback` |
| TaskRouter Workspace | `/callbacks/task-status` | - |

### Security

- Auth Token is hidden during input
- Credentials are validated before any operations
- All deployed Functions use `.protected.js` (require Twilio request signatures)

### Troubleshooting

**"Twilio CLI is not installed"**
```bash
npm install -g twilio-cli
```

**"Serverless plugin not found"**
```bash
twilio plugins:install @twilio-labs/plugin-serverless
```

**"Invalid credentials"**
- Verify Account SID starts with `AC`
- Verify Auth Token is correct (not API Secret)
- Check credentials at https://console.twilio.com/

**Deployment fails**
- Ensure you're logged into Twilio CLI: `twilio login`
- Check for syntax errors in Functions: `npm run lint`
