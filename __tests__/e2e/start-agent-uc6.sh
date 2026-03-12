#!/bin/bash
# ABOUTME: Start agent for UC6 Media Streams testing.
# ABOUTME: Agent acts as caller asking about weather forecast.

export PORT=8080
export AGENT_ROLE=questioner
export AGENT_ID=agent-a-uc6
export UC_ID=UC6
export MAX_TURNS=6
export SYSTEM_PROMPT="You are calling a weather information hotline. Ask about the weather forecast for Seattle today. Keep responses very short - this is a phone call."

cd "$(dirname "$0")"
exec node agent-server-template.js
