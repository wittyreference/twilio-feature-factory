#!/bin/bash
# ABOUTME: Wrapper script to start Agent B server for validation testing.
# ABOUTME: Sets env vars and launches agent-server-template on port 8081.

export PORT=8080
export AGENT_ROLE=answerer
export AGENT_ID=agent-b
export UC_ID="${UC_ID:-generic}"
export MAX_TURNS=8

cd "$(dirname "$0")"
exec node agent-server-template.js
