#!/bin/bash
# ABOUTME: Wrapper script to start Agent A server for validation testing.
# ABOUTME: Sets env vars and launches agent-server-template on port 8080.

export PORT=8080
export AGENT_ROLE=questioner
export AGENT_ID=agent-a
export UC_ID="${UC_ID:-generic}"
export MAX_TURNS=8

cd "$(dirname "$0")"
exec node agent-server-template.js
