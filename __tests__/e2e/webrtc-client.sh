#!/bin/bash
# ABOUTME: Launches a WebRTC softphone in the browser for receiving Twilio Voice SDK calls.
# ABOUTME: Reuses the voice-sdk test server + harness. Use with payment-demo.sh client:<identity>.

set -euo pipefail

IDENTITY="${1:-mc}"
PORT="${VOICE_SDK_TEST_PORT:-3333}"
NGROK_DOMAIN="${WEBRTC_NGROK_DOMAIN:-submariner.ngrok.dev}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER="$SCRIPT_DIR/voice-sdk/server.js"

# Load env
# shellcheck disable=SC1091
source "$PROJECT_ROOT/.env" 2>/dev/null || true

# Check required env vars
MISSING=()
[ -z "${TWILIO_ACCOUNT_SID:-}" ] && MISSING+=("TWILIO_ACCOUNT_SID")
[ -z "${TWILIO_API_KEY:-}" ] && MISSING+=("TWILIO_API_KEY")
[ -z "${TWILIO_API_SECRET:-}" ] && MISSING+=("TWILIO_API_SECRET")
[ -z "${TWILIO_VOICE_SDK_APP_SID:-}" ] && MISSING+=("TWILIO_VOICE_SDK_APP_SID")

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "❌ Missing required env vars: ${MISSING[*]}"
    echo ""
    echo "   TWILIO_API_KEY and TWILIO_API_SECRET are needed for access tokens."
    echo "   Check .env — they may be commented out."
    echo ""
    echo "   Create an API key:  twilio api:core:keys:create --friendly-name voice-sdk"
    exit 1
fi

# Check ngrok tunnel
NGROK_OK=false
if curl -s -o /dev/null -w "%{http_code}" "https://$NGROK_DOMAIN" 2>/dev/null | grep -q "502\|200"; then
    NGROK_OK=true
fi

if [ "$NGROK_OK" = false ]; then
    echo "⚠️  ngrok tunnel not detected at $NGROK_DOMAIN"
    echo "   Start it:  ngrok http $PORT --domain=$NGROK_DOMAIN"
    echo ""
fi

# Check if port is already in use
if lsof -i :"$PORT" -sTCP:LISTEN &>/dev/null; then
    echo "⚠️  Port $PORT already in use — reusing existing server"
    open "http://localhost:$PORT/?identity=$IDENTITY"
    echo ""
    echo "╔══════════════════════════════════════════════════╗"
    echo "║  WebRTC Client: $IDENTITY"
    echo "║  Local:  http://localhost:$PORT/?identity=$IDENTITY"
    echo "║  Tunnel: https://$NGROK_DOMAIN/?identity=$IDENTITY"
    echo "║                                                  ║"
    echo "║  To call this client from payment-demo.sh:       ║"
    echo "║    ./payment-demo.sh client:$IDENTITY"
    echo "╚══════════════════════════════════════════════════╝"
    exit 0
fi

# Start the voice-sdk server in background
node "$SERVER" &
SERVER_PID=$!

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down server (PID $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Wait for server to be ready
echo "Starting Voice SDK server on port $PORT..."
for i in $(seq 1 20); do
    if curl -s -o /dev/null -w "" "http://localhost:$PORT" 2>/dev/null; then
        break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "❌ Server failed to start"
        exit 1
    fi
    sleep 0.25
done

# Open browser
open "http://localhost:$PORT/?identity=$IDENTITY"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  WebRTC Client: $IDENTITY"
echo "║  Local:  http://localhost:$PORT/?identity=$IDENTITY"
echo "║  Tunnel: https://$NGROK_DOMAIN/?identity=$IDENTITY"
echo "║                                                  ║"
echo "║  To call this client from payment-demo.sh:       ║"
echo "║    ./payment-demo.sh client:$IDENTITY"
echo "║                                                  ║"
echo "║  Press Ctrl+C to stop                            ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Keep running until interrupted
wait "$SERVER_PID"
