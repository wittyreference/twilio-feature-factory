#!/bin/bash
# ABOUTME: One-command demo script for agent-assisted payment testing.
# ABOUTME: Creates conference, calls the user, adds Payment Agent, writes session to Sync.

set -euo pipefail

# Load env
source .env 2>/dev/null || true

CUSTOMER_PHONE="${1:?Usage: ./payment-demo.sh +1XXXXXXXXXX}"
PAYMENT_AGENT_PHONE="${PAYMENT_AGENT_PHONE_NUMBER:-+12066664151}"
FROM_NUMBER="${TWILIO_PHONE_NUMBER:-+12069666002}"
ACCOUNT_SID="${TWILIO_ACCOUNT_SID}"
AUTH_TOKEN="${TWILIO_AUTH_TOKEN}"
SYNC_SID="${TWILIO_SYNC_SERVICE_SID}"
CALLBACK_BASE="${TWILIO_CALLBACK_BASE_URL:-https://prototype-8922-dev.twil.io}"

CONF_NAME="pay-demo-$(date +%s)"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Agent-Assisted Payment Demo                     ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  Customer: $CUSTOMER_PHONE                  ║"
echo "║  Agent:    $PAYMENT_AGENT_PHONE                  ║"
echo "║  Conference: $CONF_NAME              ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Check that payment agent server is running
if ! lsof -i :8080 -sTCP:LISTEN &>/dev/null; then
    echo "❌ Payment Agent server not running on port 8080"
    echo "   Start it: node __tests__/e2e/payment-agent-server.js"
    exit 1
fi

# Check ngrok
if ! curl -s -o /dev/null -w "%{http_code}" https://zembla.ngrok.dev 2>/dev/null | grep -q "426"; then
    echo "❌ ngrok tunnel not running"
    echo "   Start it: ngrok http 8080 --domain=zembla.ngrok.dev"
    exit 1
fi

echo "⚙️  Adding Payment Agent to conference..."
PA_SID=$(curl -s -X POST "https://api.twilio.com/2010-04-01/Accounts/$ACCOUNT_SID/Calls.json" \
  -u "$ACCOUNT_SID:$AUTH_TOKEN" \
  -d "To=$PAYMENT_AGENT_PHONE" -d "From=$FROM_NUMBER" \
  --data-urlencode "Twiml=<Response><Dial><Conference startConferenceOnEnter=\"true\" endConferenceOnExit=\"false\" beep=\"false\" record=\"record-from-start\" recordingStatusCallback=\"$CALLBACK_BASE/conversation-relay/recording-complete\">$CONF_NAME</Conference></Dial></Response>" | jq -r '.sid')
echo "   Payment Agent call: $PA_SID"

echo "📞 Calling customer..."
CUST_SID=$(curl -s -X POST "https://api.twilio.com/2010-04-01/Accounts/$ACCOUNT_SID/Calls.json" \
  -u "$ACCOUNT_SID:$AUTH_TOKEN" \
  -d "To=$CUSTOMER_PHONE" -d "From=$FROM_NUMBER" \
  --data-urlencode "Twiml=<Response><Dial><Conference startConferenceOnEnter=\"true\" endConferenceOnExit=\"false\" beep=\"false\">$CONF_NAME</Conference></Dial></Response>" | jq -r '.sid')
echo "   Customer call: $CUST_SID"

echo ""
echo "⏳ Waiting for calls to connect..."
sleep 8

# Write session info to Sync so the Payment Agent server knows the customer's call SID
echo "📝 Writing session to Sync..."
SESSION_DATA=$(jq -n \
  --arg customerCallSid "$CUST_SID" \
  --arg conferenceName "$CONF_NAME" \
  --arg paymentAgentCallSid "$PA_SID" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{customerCallSid: $customerCallSid, conferenceName: $conferenceName, paymentAgentCallSid: $paymentAgentCallSid, createdAt: $timestamp}')

# Try update first, then create
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://sync.twilio.com/v1/Services/$SYNC_SID/Documents/payment-demo-session" \
  -u "$ACCOUNT_SID:$AUTH_TOKEN" \
  -d "Data=$SESSION_DATA")

if [ "$HTTP_CODE" = "404" ]; then
  curl -s -X POST "https://sync.twilio.com/v1/Services/$SYNC_SID/Documents" \
    -u "$ACCOUNT_SID:$AUTH_TOKEN" \
    -d "UniqueName=payment-demo-session" \
    -d "Data=$SESSION_DATA" \
    -d "Ttl=86400" > /dev/null
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  ✅ Demo ready!                                  ║"
echo "║                                                  ║"
echo "║  Pick up your phone and tell the agent you       ║"
echo "║  want to make a payment.                         ║"
echo "║                                                  ║"
echo "║  When prompted, enter card details on your       ║"
echo "║  phone's keypad:                                 ║"
echo "║    Card:   4242 4242 4242 4242                   ║"
echo "║    Expiry: 1228                                  ║"
echo "║    CVV:    123                                   ║"
echo "║    ZIP:    10001                                 ║"
echo "║                                                  ║"
echo "║  Watch the Payment Agent server logs for         ║"
echo "║  real-time transcript + payment events.          ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "To end the demo:"
echo "  curl -s -X POST 'https://api.twilio.com/2010-04-01/Accounts/$ACCOUNT_SID/Conferences.json' -u '$ACCOUNT_SID:$AUTH_TOKEN' -d 'Status=completed' --data-urlencode 'FriendlyName=$CONF_NAME'"
