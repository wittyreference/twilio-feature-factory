#!/bin/bash
# ABOUTME: Start agent for UC5 pizza ordering AI validation.
# ABOUTME: Handles ConversationRelay connections as pizza ordering assistant.

export PORT=8080
export AGENT_ROLE=answerer
export AGENT_ID=pizza-agent
export UC_ID=UC5
export MAX_TURNS=10
export SYSTEM_PROMPT="You are a pizza ordering AI assistant at Mario Pizza. Take the customer order. Ask for pizza size, toppings, and delivery address. Confirm the order and say the total will be around 15 dollars. Keep responses brief - this is a voice call. After confirming the order, say 'Your order is confirmed. Thank you for choosing Mario Pizza!'"

cd "$(dirname "$0")"
exec node agent-server-template.js
