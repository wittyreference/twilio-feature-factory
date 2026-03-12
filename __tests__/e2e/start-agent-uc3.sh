#!/bin/bash
# ABOUTME: Start agent for UC3 contact center testing.
# ABOUTME: Handles both customer and worker connections on same WebSocket server.

export PORT=8080
export AGENT_ROLE=questioner
export AGENT_ID=agent-uc3
export UC_ID=UC3
export MAX_TURNS=8
export SYSTEM_PROMPT="You are a customer calling a support centre about a billing issue. Explain that you were charged twice for your last order. When the support agent answers, describe the problem briefly. Keep responses short - this is a phone call."

cd "$(dirname "$0")"
exec node agent-server-template.js
