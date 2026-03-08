# Self-Service Before Asking User

Use MCP tools and CLI commands to verify state before asking the user to check manually:

- **Deployed functions**: Use `list_functions` MCP tool or `twilio serverless:list`
- **Phone number config**: Use `list_phone_numbers` MCP tool or `twilio api:core:incoming-phone-numbers:fetch`
- **Pay Connectors**: Console-only — NO REST API. This is the one thing you DO need user to verify.
- **General rule**: Check `.claude/references/twilio-cli.md` for the right command before asking user to verify anything.
