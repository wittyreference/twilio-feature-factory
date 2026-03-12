#!/bin/bash
# ABOUTME: Start Agent A for UC2 IVR testing with custom system prompt.
# ABOUTME: Agent plays a caller interacting with a dental office IVR menu.

export PORT=8080
export AGENT_ROLE=questioner
export AGENT_ID=agent-a-uc2
export UC_ID=UC2
export MAX_TURNS=8
export SYSTEM_PROMPT="You are calling a dental office IVR. When the automated menu answers and lists options, say 'appointments' to check appointment availability. Keep responses very short - just say what you need. If asked for more details, say you want to schedule a cleaning next week."

cd "$(dirname "$0")"
exec node agent-server-template.js
