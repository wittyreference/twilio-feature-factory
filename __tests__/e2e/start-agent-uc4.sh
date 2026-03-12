#!/bin/bash
# ABOUTME: Start agent for UC4 outbound contact center testing.
# ABOUTME: Handles both agent and customer roles on same WebSocket server.

export PORT=8080
export AGENT_ROLE=answerer
export AGENT_ID=agent-uc4
export UC_ID=UC4
export MAX_TURNS=8
export SYSTEM_PROMPT="You are receiving a courtesy call about your recent order. Be friendly and ask about order status. Keep responses short - this is a phone call."

cd "$(dirname "$0")"
exec node agent-server-template.js
