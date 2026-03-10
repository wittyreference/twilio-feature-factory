<!-- ABOUTME: Essential context for Messaging Services functions with sender pools and compliance. -->
<!-- ABOUTME: Covers file inventory, key differences from basic messaging, A2P 10DLC, and error codes. -->

# Messaging Services Context

For full API examples, service features, and common patterns, see [REFERENCE.md](./REFERENCE.md).

## Files

| File | Access | Description |
|------|--------|-------------|
| `send-message.protected.js` | Protected | Send SMS/MMS via Messaging Service with optional scheduling and status callbacks |
| `sender-pool.protected.js` | Protected | Manage sender pool: list/add/remove phone numbers via `action` param |
| `incoming-handler.js` | Public | Inbound webhook with keyword routing (HELP, INFO) and default acknowledgment |

## Key Difference from Basic Messaging

Uses `messagingServiceSid` instead of `from` — Twilio selects the optimal sender from the pool:

```javascript
// Basic: await client.messages.create({ to, from: phoneNumber, body });
// Service: await client.messages.create({ to, messagingServiceSid: serviceSid, body });
```

## Service Features (Overview)

- **Sender Pool**: Multiple numbers for scale and deliverability
- **Sticky Sender**: Same number for ongoing conversations
- **Geographic Matching**: Local numbers when available
- **MMS Conversion**: Auto-fallback when MMS unsupported
- **Smart Encoding**: GSM-compatible character conversion
- **Link Shortening**: Click-through tracking
- **Compliance**: Built-in opt-out (STOP/HELP) management

## A2P 10DLC (US)

Registration flow: Brand → Campaign → Number Assignment. Required for US messaging at scale.

| Use Case | Throughput |
|----------|-----------|
| `2fa` | Highest |
| `notifications`, `customer_care`, `delivery_notifications`, `account_notification` | Higher |
| `marketing` | Standard |

### Registration Timeline

**Total: 2–10+ business days.** Do NOT promise same-day high-volume messaging.

| Stage | Duration | Notes |
|-------|----------|-------|
| Brand registration | 1–7 business days | Vetting by TCR. Sole proprietors take longer |
| Campaign registration | 1–3 business days | Per-campaign review |
| Number assignment | Instant | After campaign approval |
| Throughput ramp | 1–14 days | Starts at low TPS, ramps to campaign limit |

For 50K+ messages/day, budget 2–4 weeks total including ramp-up. Unregistered traffic on 10DLC numbers gets filtered aggressively.

## Webhook Parameters

### Status Callback

| Parameter | Description |
|-----------|-------------|
| `MessageSid` | Message identifier |
| `MessageStatus` | `queued`, `sent`, `delivered`, `undelivered`, `failed` |
| `ErrorCode` / `ErrorMessage` | Error details if failed |
| `MessagingServiceSid` | Associated service |

## Error Codes

| Code | Description |
|------|-------------|
| `21211` | Invalid 'To' phone number |
| `21408` | Permission to send not enabled |
| `21610` | Recipient opted out |
| `21611` | No phone numbers in Messaging Service |
| `21614` | 'To' not verified (trial accounts) |
| `21617` | Messaging Service not found |
| `30003` | Unreachable destination |
| `30004` | Message blocked (spam) |
| `30005` | Unknown destination |
| `30006` | Landline or unreachable carrier |
| `30007` | Carrier violation |

## Environment Variables

```
TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxx
```

## Gotchas

- **Empty Sender Pool**: Error 21611 if no numbers added to service. Add numbers before sending.
- **Sticky Sender Persistence**: Binding persists even after removing a number. Clear via API if needed.
- **10DLC Registration Required**: US A2P messaging without registration gets heavily filtered.
- **Scheduled Message Limits**: Max 7 days in advance. `scheduleType: 'fixed'` required.
- **MMS Conversion Side Effects**: With `mmsConverter: true`, MMS becomes SMS+link on some carriers — changes UX.
- **Opt-Out Auto-Handling**: STOP/STOPALL/etc. never reach your webhook. Don't try to intercept them.

## File Naming

- `*.js` — Public (inbound webhooks)
- `*.protected.js` — Protected (sending, status callbacks)
- `*.private.js` — Private (formatting, validation helpers)
