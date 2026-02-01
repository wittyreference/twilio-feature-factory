# Scripts Directory

This directory contains CLI scripts for project setup and maintenance.

## Available Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `setup.js` | `npm run setup` | Interactive setup for provisioning Twilio resources |
| `enable-autonomous.sh` | `./scripts/enable-autonomous.sh` | Launch Claude Code in autonomous mode |

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

## Enable Autonomous Script

The `enable-autonomous.sh` script launches Claude Code with pre-approved permissions for unattended operation.

### What It Does

1. **Displays Warning**: Shows consequences of autonomous mode (real money, real calls)
2. **Requires Acknowledgment**: User must type `I ACKNOWLEDGE THE RISKS`
3. **Launches Claude Code**: Starts with expanded permissions
4. **Creates Audit Log**: Logs session to `.claude/autonomous-sessions/`

### Usage

```bash
# From project root
./scripts/enable-autonomous.sh

# With initial prompt
./scripts/enable-autonomous.sh "Add SMS verification to signup"

# Resume a conversation
./scripts/enable-autonomous.sh --resume
```

### Pre-Approved Commands

The script pre-approves these patterns (no permission prompts):

| Category | Patterns |
|----------|----------|
| Testing | `npm test*`, `npx jest*` |
| Building | `npm run build*`, `npx tsc*` |
| Linting | `npm run lint*`, `npx eslint*` |
| Twilio CLI | `twilio serverless:*`, `twilio api:*`, `twilio profiles:*` |
| Git (safe) | `git add`, `git commit`, `git status`, `git diff`, `git log` |
| File tools | `Read`, `Write`, `Edit`, `Glob`, `Grep` |
| Web | `WebSearch`, `WebFetch` |
| Agents | `Task`, `Skill` |

### Still Blocked (Require Approval)

- `git push --force`, `git reset --hard`
- `rm -rf` and destructive operations
- Network requests to unknown hosts
- Any command not in the pre-approved list

### Quality Gates (Always Enforced)

Even in autonomous mode, Claude Code hooks still enforce:

- **TDD**: Tests must fail first, then pass
- **Linting**: Must pass before commit
- **Credential safety**: No hardcoded secrets
- **Git safety**: No `--no-verify`, no force push

### Audit Logs

Session logs are saved to `.claude/autonomous-sessions/autonomous-YYYYMMDD-HHMMSS.log` with:

- Session start/end timestamps
- Acknowledgment method
- All tool invocations (via hooks)
