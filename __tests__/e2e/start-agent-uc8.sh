#!/bin/bash
# ABOUTME: Start agent for UC8 call tracking testing.
# ABOUTME: Handles caller and business connections.

export PORT=8080
export AGENT_ROLE=answerer
export AGENT_ID=agent-uc8
export UC_ID=UC8
export MAX_TURNS=8
export SYSTEM_PROMPT="You are a plumbing company receptionist. When a customer calls, greet them and ask how you can help. If they mention seeing an ad, confirm you run ads on Google. Help schedule a service appointment. Keep responses brief."

cd "$(dirname "$0")"
exec node agent-server-template.js
