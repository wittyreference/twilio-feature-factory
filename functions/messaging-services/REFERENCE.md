<!-- ABOUTME: Complete Messaging Services API reference, sender pool management, and common patterns. -->
<!-- ABOUTME: Companion to CLAUDE.md — contains full code samples, service features, and testing guides. -->

# Messaging Services Reference

For essential patterns, gotchas, and quick reference, see [CLAUDE.md](./CLAUDE.md).

## Key Difference: `from` vs `messagingServiceSid`

```javascript
// Basic SMS - specify sender number
await client.messages.create({
  to: '+1234567890',
  from: '+0987654321',
  body: 'Hello!'
});

// Messaging Service - let Twilio pick optimal sender
await client.messages.create({
  to: '+1234567890',
  messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
  body: 'Hello!'
});
```

## API Examples

### Sending Messages

```javascript
const client = context.getTwilioClient();

// Basic send
const message = await client.messages.create({
  to: '+1234567890',
  messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
  body: 'Your order has shipped!'
});

// With media (MMS)
const message = await client.messages.create({
  to: '+1234567890',
  messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
  body: 'Check out this image!',
  mediaUrl: ['https://example.com/image.jpg']
});

// With status callback
const message = await client.messages.create({
  to: '+1234567890',
  messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
  body: 'Tracking delivery...',
  statusCallback: 'https://your-app.com/status'
});

// Schedule message (up to 7 days in advance)
const message = await client.messages.create({
  to: '+1234567890',
  messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
  body: 'Scheduled reminder!',
  scheduleType: 'fixed',
  sendAt: new Date(Date.now() + 3600000).toISOString()
});
```

### Managing Sender Pool

```javascript
// List phone numbers in the service
const phoneNumbers = await client.messaging.v1
  .services(context.TWILIO_MESSAGING_SERVICE_SID)
  .phoneNumbers.list();

// Add phone number to service
await client.messaging.v1
  .services(context.TWILIO_MESSAGING_SERVICE_SID)
  .phoneNumbers.create({
    phoneNumberSid: 'PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
  });

// Remove phone number from service
await client.messaging.v1
  .services(context.TWILIO_MESSAGING_SERVICE_SID)
  .phoneNumbers(phoneNumberSid).remove();
```

### Service Configuration

```javascript
// Get service details
const service = await client.messaging.v1
  .services(context.TWILIO_MESSAGING_SERVICE_SID).fetch();

// Update service settings
await client.messaging.v1
  .services(context.TWILIO_MESSAGING_SERVICE_SID).update({
    stickySender: true,
    mmsConverter: true,
    smartEncoding: true,
    fallbackUrl: 'https://fallback.example.com/sms',
    inboundRequestUrl: 'https://your-app.com/incoming',
    statusCallback: 'https://your-app.com/status'
  });
```

## Service Features

### Sticky Sender
Maintains consistent sender number per recipient. Config: `{ "stickySender": true }`.

### Geographic Matching
Selects sender number closest to recipient. Config: `{ "areaCodeGeomatch": true }`.

### MMS Conversion
Auto-converts MMS to SMS with link for unsupported carriers. Config: `{ "mmsConverter": true }`.

### Smart Encoding
Converts special characters to GSM-compatible equivalents, reducing segments and cost. Config: `{ "smartEncoding": true }`.

### Link Shortening
Track link clicks with branded short links:
```javascript
const message = await client.messages.create({
  to: '+1234567890',
  messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
  body: 'Check out our sale: https://example.com/big-sale-promo-2024',
  shortenUrls: true
});
// Results in: "Check out our sale: https://twil.io/abc123"
```

## A2P 10DLC Registration

```javascript
// Check registration status
const brandRegistration = await client.messaging.v1
  .brandRegistrations(brandSid).fetch();

const campaignRegistration = await client.messaging.v1
  .services(serviceSid)
  .usAppToPersonUsecases.list();
```

## Common Patterns

### High-Volume Notifications

```javascript
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const { recipients, message } = event;

  const results = await Promise.allSettled(
    recipients.map(recipient =>
      client.messages.create({
        to: recipient,
        messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
        body: message
      })
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  return callback(null, { sent, failed, total: recipients.length });
};
```

### Opt-Out Handling

Twilio auto-handles STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT (never reaches webhook).

```javascript
exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.MessagingResponse();
  if (event.Body.toUpperCase() === 'HELP') {
    twiml.message('Reply STOP to unsubscribe. For support: support@example.com');
    return callback(null, twiml);
  }
  twiml.message('Thanks for your message!');
  return callback(null, twiml);
};
```

### Status Tracking

```javascript
exports.handler = async (context, event, callback) => {
  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = event;
  console.log(`Message ${MessageSid}: ${MessageStatus}`);
  if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
    console.log(`Delivery failed: ${ErrorCode} - ${ErrorMessage}`);
  }
  return callback(null, { success: true });
};
```

### Scheduled Campaigns

```javascript
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const { recipients, message, sendAt } = event;

  const scheduledTime = new Date(sendAt);
  const maxTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  if (scheduledTime > maxTime) {
    return callback(null, { success: false, error: 'Max 7 days in advance' });
  }

  const results = await Promise.allSettled(
    recipients.map(recipient =>
      client.messages.create({
        to: recipient,
        messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
        body: message,
        scheduleType: 'fixed',
        sendAt: scheduledTime.toISOString()
      })
    )
  );

  return callback(null, {
    scheduled: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length
  });
};
```

### Error Handling Pattern

```javascript
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  try {
    const message = await client.messages.create({
      to: event.to,
      messagingServiceSid: context.TWILIO_MESSAGING_SERVICE_SID,
      body: event.body
    });
    return callback(null, { success: true, sid: message.sid });
  } catch (error) {
    if (error.code === 21610) {
      return callback(null, { success: false, error: 'Recipient has opted out' });
    }
    if (error.code === 21611) {
      return callback(null, { success: false, error: 'No numbers in sender pool' });
    }
    if (error.code === 30004) {
      return callback(null, { success: false, error: 'Blocked by carrier' });
    }
    throw error;
  }
};
```

## Testing

Test numbers: `+15005550006` (success), `+15005550001` (invalid).

```javascript
describe('Messaging Service', () => {
  it('should send message via messaging service', async () => {
    const context = createTestContext();
    const event = { to: '+15005550006', body: 'Test message' };
    await sendHandler(context, event, callback);
    const [, response] = callback.mock.calls[0];
    expect(response.success).toBe(true);
    expect(response.sid).toMatch(/^SM/);
  });
});
```
