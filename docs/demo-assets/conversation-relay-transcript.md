# ABOUTME: Sample annotated transcript from a ConversationRelay AI voice session.
# ABOUTME: Use as Tier 3 fallback when live demo is unavailable.

# ConversationRelay Demo Transcript

This is an annotated transcript from a successful AI voice session using ConversationRelay with Claude as the LLM backend.

## Session Details

- **Phone Number:** +12069666002
- **Voice:** Google.en-US-Neural2-F
- **Transcription:** Google telephony model
- **LLM:** Claude (via Anthropic API)
- **Use Case:** Pizza ordering assistant

## Transcript

```
[0:00] SYSTEM: Call connected. WebSocket established.
[0:01] AI: "Hi there! Welcome to Mario's Pizza. I'm your AI ordering assistant.
            What can I get started for you today?"

[0:05] CALLER: "Yeah, I'd like to order a large pepperoni pizza."

[0:08] AI: "Great choice! One large pepperoni pizza. Would you like that with
            our regular crust, thin crust, or deep dish?"

[0:13] CALLER: "Thin crust please."

[0:15] AI: "Perfect — one large pepperoni on thin crust. Anything else you'd
            like to add? We have garlic bread, wings, or drinks."

[0:21] CALLER: "Actually, can I also get an order of garlic bread?"

[0:24] AI: "Absolutely! So that's one large thin-crust pepperoni pizza and one
            order of garlic bread. Would you like to add any drinks?"

[0:30] CALLER: "No, that's it."

[0:32] AI: "Alright! Your order is one large thin-crust pepperoni pizza and
            garlic bread. Can I get a name for the order?"

[0:38] CALLER: "It's Mike."

[0:40] AI: "Got it, Mike. Your estimated wait time is about 25 minutes.
            Is there anything else I can help you with?"

[0:45] CALLER: "No, that's everything. Thanks!"

[0:47] AI: "Thank you, Mike! Your order is confirmed. Have a great evening!"

[0:50] SYSTEM: Call ended. Duration: 50 seconds.
```

## What Happens Behind the Scenes

1. **Twilio receives call** → TwiML connects to ConversationRelay WebSocket
2. **Speech → Text** → Google Speech-to-Text transcribes caller audio in real-time
3. **Text → LLM** → Transcribed text sent to Claude via Anthropic API
4. **LLM → Text** → Claude generates response based on system prompt
5. **Text → Speech** → Google Neural2 voice synthesizes response audio
6. **Audio → Caller** → Synthesized audio streams back to caller

## Post-Call Artifacts

After the call completes, the system automatically:
- **Records** the full call audio (stored as Twilio Recording)
- **Transcribes** via Voice Intelligence (full transcript with speaker labels)
- **Stores state** in Twilio Sync (order details, conversation history)
- **Runs operators** — Summary and Sentiment analysis via Voice Intelligence

## Validation Output

Running `validate_voice_ai_flow` on this call produces:

```
Voice AI Flow Validation Results:
  ✓ Call completed successfully (status: completed, duration: 50s)
  ✓ No debugger errors (0 warnings, 0 errors)
  ✓ Recording completed (duration: 48s, channels: 1)
  ✓ Transcript completed (6 sentences, 2 speakers detected)
  ✓ Content validation passed (no forbidden patterns found)
  ✓ Sync document exists (order state persisted)

Overall: PASS (6/6 checks passed)
```
