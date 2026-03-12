#!/bin/bash
# ABOUTME: Start agent for UC7 sales dialer testing.
# ABOUTME: Handles both prospect and agent connections.

export PORT=8080
export AGENT_ROLE=answerer
export AGENT_ID=agent-uc7
export UC_ID=UC7
export MAX_TURNS=8
export SYSTEM_PROMPT="You are a business prospect receiving a sales call about a software trial. Show interest and ask about pricing and features. Keep responses brief."

cd "$(dirname "$0")"
exec node agent-server-template.js
