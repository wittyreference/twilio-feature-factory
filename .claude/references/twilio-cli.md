# Twilio CLI Reference

Quick reference for Twilio CLI operations. Load this document when working with CLI commands to reduce token usage.

## Installation & Setup

```bash
# Install via npm (preferred for this project)
npm install -g twilio-cli

# macOS via Homebrew
brew tap twilio/brew && brew install twilio

# Verify installation
twilio --version

# Install serverless plugin (required for this project)
twilio plugins:install @twilio-labs/plugin-serverless
```

---

## Profile Management (`twilio profiles:*`)

Profiles store account credentials for different Twilio projects.

| Command | Description |
|---------|-------------|
| `twilio profiles:create` | Create new profile (interactive) |
| `twilio profiles:list` | List all profiles |
| `twilio profiles:use <name>` | Switch active profile |
| `twilio profiles:remove <name>` | Delete a profile |

### Create Profile

```bash
# Interactive (recommended)
twilio profiles:create

# With flags
twilio profiles:create \
  --account-sid ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --auth-token xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --profile my-project

# Using API keys (recommended for CI/CD)
twilio profiles:create \
  --account-sid ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --api-key SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --api-secret xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --profile my-project
```

### Switch Profiles

```bash
# List profiles (shows active)
twilio profiles:list

# Switch to different profile
twilio profiles:use my-project

# Use profile for single command
twilio api:core:messages:list --profile my-project
```

---

## Serverless (`twilio serverless:*`)

### Quick Reference

| Command | Description |
|---------|-------------|
| `serverless:init <name>` | Create new project |
| `serverless:start` | Local development server |
| `serverless:deploy` | Deploy to Twilio |
| `serverless:list` | List deployed services |
| `serverless:logs` | View function logs |
| `serverless:promote` | Promote between environments |
| `serverless:env:list` | List environment variables |
| `serverless:env:set` | Set environment variable |

### `serverless:start` - Local Development

```bash
# Basic (port 3000)
twilio serverless:start

# With ngrok tunnel (for webhooks)
twilio serverless:start --ngrok

# Custom port
twilio serverless:start --port 3001

# With detailed logs
twilio serverless:start --detailed-logs

# Live reload on file changes
twilio serverless:start --live

# Combined
twilio serverless:start --ngrok --detailed-logs --live
```

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--port` | `-p` | Port number | 3000 |
| `--load-local-env` | | Load .env file | true |
| `--ngrok` | | Start ngrok tunnel | false |
| `--detailed-logs` | | Verbose logging | false |
| `--live` | | Live reload | false |
| `--assets-folder` | | Custom assets path | assets |
| `--functions-folder` | | Custom functions path | functions |

### `serverless:deploy` - Deployment

```bash
# Deploy to default environment
twilio serverless:deploy

# Deploy to specific environment
twilio serverless:deploy --environment dev
twilio serverless:deploy --environment staging
twilio serverless:deploy --environment production

# Deploy as production (affects domain name)
twilio serverless:deploy --production

# Force overwrite existing service
twilio serverless:deploy --override-existing-project

# With specific account (CI/CD)
twilio serverless:deploy \
  --account-sid ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --api-key SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --api-secret xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --environment production
```

| Flag | Description |
|------|-------------|
| `--environment` | Target environment name |
| `--service-name` | Override service name from .twilioserverlessrc |
| `--production` | Deploy as production environment |
| `--override-existing-project` | Force deploy over existing |
| `--force` | Skip confirmation prompts |
| `--account-sid` | Override account SID |
| `--api-key` | API key for auth |
| `--api-secret` | API secret for auth |

### `serverless:list` - List Services

```bash
# List all services
twilio serverless:list

# List builds for a service
twilio serverless:list builds --service-name prototype

# List environments
twilio serverless:list environments --service-name prototype

# Output as JSON
twilio serverless:list --output json
```

### `serverless:logs` - View Logs

```bash
# Tail logs (live)
twilio serverless:logs --service-sid ZSxxxx --environment production --tail

# Recent logs
twilio serverless:logs --service-sid ZSxxxx --environment production

# Filter by function
twilio serverless:logs --service-sid ZSxxxx --function-sid ZH...
```

### `serverless:promote` - Promote Between Environments

```bash
# Promote from dev to staging
twilio serverless:promote \
  --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --source-environment dev \
  --environment staging

# Promote from staging to production
twilio serverless:promote \
  --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --source-environment staging \
  --environment production
```

### `serverless:env:*` - Environment Variables

```bash
# List environment variables
twilio serverless:env:list \
  --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --environment production

# Set single variable
twilio serverless:env:set MY_VAR=value \
  --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --environment production

# Import from .env file
twilio serverless:env:import .env \
  --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --environment production

# Remove variable
twilio serverless:env:unset MY_VAR \
  --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --environment production
```

### Rollback

```bash
# List previous builds
twilio serverless:list builds --service-name prototype

# Activate previous build
twilio serverless:activate \
  --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --build-sid BUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --environment production
```

---

## Phone Numbers (`twilio phone-numbers:*`)

### List Numbers

```bash
# List all numbers
twilio phone-numbers:list

# List with specific properties
twilio phone-numbers:list \
  --properties phoneNumber,friendlyName,smsUrl,voiceUrl

# Output as JSON
twilio phone-numbers:list -o json
```

### Search Available Numbers

```bash
# Search local numbers by area code
twilio phone-numbers:buy:local \
  --country-code US \
  --area-code 415

# Search toll-free
twilio phone-numbers:buy:toll-free \
  --country-code US

# Search with capabilities
twilio phone-numbers:buy:local \
  --country-code US \
  --sms-enabled \
  --voice-enabled
```

### Update Number Configuration

```bash
# Update webhook URLs
twilio phone-numbers:update +1234567890 \
  --sms-url https://example.com/sms \
  --voice-url https://example.com/voice

# Set friendly name
twilio phone-numbers:update +1234567890 \
  --friendly-name "Support Line"

# Configure SMS
twilio phone-numbers:update +1234567890 \
  --sms-url https://example.com/sms \
  --sms-method POST \
  --sms-fallback-url https://example.com/sms-fallback
```

---

## Debugger & Logs (`twilio debugger:*`)

### List Error Logs

```bash
# Recent errors (default limit 50)
twilio debugger:logs:list

# Limit results
twilio debugger:logs:list --limit 10

# Filter by log level
twilio debugger:logs:list --log-level error
twilio debugger:logs:list --log-level warning

# Filter by date range
twilio debugger:logs:list \
  --start-date 2024-01-01 \
  --end-date 2024-01-31

# Output as JSON (for parsing)
twilio debugger:logs:list -o json

# Get specific alert details
twilio debugger:logs:list --sid NOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Common Error Codes

| Code | Description |
|------|-------------|
| 11200 | HTTP retrieval failure |
| 11205 | HTTP connection failure |
| 11210 | HTTP bad host name |
| 12100 | Document parse failure |
| 12200 | Schema validation warning |
| 12300 | Invalid Content-Type |
| 13221 | Dial: Invalid phone number |
| 13224 | Dial: Invalid timeout |
| 13225 | Dial: Forbidden phone number |
| 14101 | Invalid phone number |
| 21211 | Invalid 'To' phone number |
| 21408 | Permission to send SMS not enabled |
| 21610 | Message cannot be sent to landline |
| 21614 | 'To' number not verified |
| 30003 | Unreachable destination |
| 30004 | Message blocked |
| 30005 | Unknown destination |
| 30006 | Landline or unreachable |
| 30007 | Carrier violation |
| 30008 | Unknown error |

---

## API Commands (`twilio api:*`)

Pattern: `twilio api:<product>:<version>:<resource>:<action>`

### Messages

```bash
# List recent messages
twilio api:core:messages:list --limit 10

# Send SMS
twilio api:core:messages:create \
  --to +1234567890 \
  --from +0987654321 \
  --body "Hello from CLI"

# Get message details
twilio api:core:messages:fetch \
  --sid SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Output as JSON
twilio api:core:messages:list -o json
```

### Calls

```bash
# List recent calls
twilio api:core:calls:list --limit 10

# Make outbound call
twilio api:core:calls:create \
  --to +1234567890 \
  --from +0987654321 \
  --url https://example.com/twiml

# Get call details
twilio api:core:calls:fetch \
  --sid CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Update in-progress call
twilio api:core:calls:update \
  --sid CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --status completed
```

### Verify

```bash
# List Verify services
twilio api:verify:v2:services:list

# Create verification
twilio api:verify:v2:services:verifications:create \
  --service-sid VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --to +1234567890 \
  --channel sms

# Check verification
twilio api:verify:v2:services:verification-checks:create \
  --service-sid VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --to +1234567890 \
  --code 123456
```

### Sync

```bash
# List Sync services
twilio api:sync:v1:services:list

# Create document
twilio api:sync:v1:services:documents:create \
  --service-sid ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --unique-name my-document \
  --data '{"key": "value"}'

# Update document
twilio api:sync:v1:services:documents:update \
  --service-sid ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --sid ETxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --data '{"key": "new-value"}'
```

### TaskRouter

```bash
# List workspaces
twilio api:taskrouter:v1:workspaces:list

# List workers
twilio api:taskrouter:v1:workspaces:workers:list \
  --workspace-sid WSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Update worker activity
twilio api:taskrouter:v1:workspaces:workers:update \
  --workspace-sid WSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --sid WKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --activity-sid WAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Common API Resources

| Product | Resource Path | Common Actions |
|---------|---------------|----------------|
| Core | `api:core:messages` | list, create, fetch, delete |
| Core | `api:core:calls` | list, create, fetch, update |
| Core | `api:core:accounts` | fetch, update |
| Verify | `api:verify:v2:services` | list, create, fetch |
| Sync | `api:sync:v1:services` | list, create, fetch |
| Sync | `api:sync:v1:services:documents` | list, create, fetch, update |
| TaskRouter | `api:taskrouter:v1:workspaces` | list, create, fetch |
| TaskRouter | `api:taskrouter:v1:workspaces:workers` | list, create, update |

---

## Global Flags

Available on all commands:

| Flag | Short | Description |
|------|-------|-------------|
| `--help` | `-h` | Show help |
| `--log-level` | `-l` | debug, info, warn, error |
| `--output` | `-o` | columns, json, tsv |
| `--silent` | | Suppress output |
| `--profile` | `-p` | Use specific profile |
| `--account-sid` | | Override account SID |
| `--auth-token` | | Override auth token |

---

## Plugin System

```bash
# List installed plugins
twilio plugins

# Install plugin
twilio plugins:install @twilio-labs/plugin-serverless
twilio plugins:install @twilio-labs/plugin-flex

# Update plugins
twilio plugins:update

# Uninstall plugin
twilio plugins:uninstall @twilio-labs/plugin-serverless

# Available plugins
twilio plugins:available
```

---

## Common Workflows

### New Project Setup

```bash
# 1. Create profile
twilio profiles:create --profile my-project

# 2. Install serverless plugin
twilio plugins:install @twilio-labs/plugin-serverless

# 3. Initialize project
twilio serverless:init my-functions
cd my-functions

# 4. Start local development
twilio serverless:start --ngrok
```

### Development Cycle

```bash
# 1. Start local server with ngrok
twilio serverless:start --ngrok --live

# 2. Make changes (auto-reloads with --live)

# 3. Check for errors
twilio debugger:logs:list --limit 5

# 4. Deploy to dev
twilio serverless:deploy --environment dev

# 5. Verify deployment
twilio serverless:list environments --service-name prototype
```

### Deploy to Production

```bash
# 1. Run tests
npm test

# 2. Check for lint errors
npm run lint

# 3. Deploy to staging first
twilio serverless:deploy --environment staging

# 4. Verify in staging
twilio debugger:logs:list --limit 10

# 5. Promote to production
twilio serverless:promote \
  --service-sid ZSxxxx \
  --source-environment staging \
  --environment production
```

### Debug Failed Calls/Messages

```bash
# 1. Check recent errors
twilio debugger:logs:list --limit 10 --log-level error

# 2. Get call details
twilio api:core:calls:fetch --sid CAxxxxxxx -o json

# 3. Check message status
twilio api:core:messages:fetch --sid SMxxxxxxx -o json

# 4. View serverless logs
twilio serverless:logs --service-sid ZSxxxx --environment production --tail
```

### Rollback Deployment

```bash
# 1. List previous builds
twilio serverless:list builds --service-name prototype

# 2. Note the build SID you want to roll back to (BUxxxxxxx)

# 3. Activate previous build
twilio serverless:activate \
  --service-sid ZSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --build-sid BUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --environment production
```

---

## Troubleshooting

### Authentication Issues

```bash
# Verify current profile
twilio profiles:list

# Test API access
twilio api:core:accounts:fetch

# Re-authenticate
twilio profiles:remove my-project
twilio profiles:create --profile my-project
```

### Deployment Failures

```bash
# Check service status
twilio serverless:list

# Verify .twilioserverlessrc exists and is valid
cat .twilioserverlessrc

# Check for syntax errors
npm run lint

# Try with verbose output
twilio serverless:deploy --log-level debug
```

### Environment Variable Issues

```bash
# List current env vars on deployed service
twilio serverless:env:list \
  --service-sid ZSxxxx \
  --environment production

# Compare with local .env
cat .env

# Re-import .env
twilio serverless:env:import .env \
  --service-sid ZSxxxx \
  --environment production
```

### Ngrok Issues

```bash
# If ngrok fails to start, try without it first
twilio serverless:start

# Then start ngrok separately
ngrok http 3000

# Use the ngrok URL for Twilio webhooks
```

---

## Quick Reference Card

| Task | Command |
|------|---------|
| Start local dev | `twilio serverless:start` |
| Start with tunnel | `twilio serverless:start --ngrok` |
| Deploy to dev | `twilio serverless:deploy --environment dev` |
| Deploy to prod | `twilio serverless:deploy --environment production` |
| Check errors | `twilio debugger:logs:list --limit 10` |
| List numbers | `twilio phone-numbers:list` |
| Send test SMS | `twilio api:core:messages:create --to X --from Y --body Z` |
| Switch profile | `twilio profiles:use <name>` |
| View logs | `twilio serverless:logs --service-sid X --environment Y --tail` |
| Rollback | `twilio serverless:activate --build-sid X --environment Y` |
