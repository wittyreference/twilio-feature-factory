<!-- ABOUTME: Complete reference for Twilio Verify API patterns, code samples, and error handling. -->
<!-- ABOUTME: Companion to CLAUDE.md — contains detailed examples, rate limiting, and testing guidance. -->

# Verify Reference

For essential patterns and quick reference, see [CLAUDE.md](./CLAUDE.md).

## API Examples

### Start Verification (Full Options)

```javascript
const verification = await client.verify.v2
  .services(serviceSid)
  .verifications.create({
    to: '+1234567890',
    channel: 'sms',
    locale: 'en',                    // Message language
    customFriendlyName: 'MyApp',     // Sender name in message
    customMessage: 'Your code is {{code}}', // Custom template
    sendDigits: 'wwww1928',          // DTMF to dial (voice)
    rateLimits: {
      uniqueName: 'end_user_phone_number',
      value: '+1234567890'
    }
  });
```

### Check Verification

```javascript
const verificationCheck = await client.verify.v2
  .services(serviceSid)
  .verificationChecks.create({
    to: '+1234567890',
    code: '123456'
  });
```

## Common Patterns

### Basic 2FA Flow

```javascript
// Step 1: Start verification (user requests code)
exports.startVerification = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const { phoneNumber } = event;

  const verification = await client.verify.v2
    .services(context.TWILIO_VERIFY_SERVICE_SID)
    .verifications.create({
      to: phoneNumber,
      channel: 'sms'
    });

  return callback(null, {
    success: true,
    status: verification.status
  });
};

// Step 2: Check verification (user submits code)
exports.checkVerification = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const { phoneNumber, code } = event;

  const verificationCheck = await client.verify.v2
    .services(context.TWILIO_VERIFY_SERVICE_SID)
    .verificationChecks.create({
      to: phoneNumber,
      code: code
    });

  if (verificationCheck.status === 'approved') {
    // Grant access, create session, etc.
    return callback(null, { success: true, verified: true });
  }

  return callback(null, { success: false, verified: false });
};
```

### Fallback to Voice

```javascript
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();
  const { phoneNumber, attemptCount = 0 } = event;

  // Use voice after 2 failed SMS attempts
  const channel = attemptCount >= 2 ? 'call' : 'sms';

  const verification = await client.verify.v2
    .services(context.TWILIO_VERIFY_SERVICE_SID)
    .verifications.create({
      to: phoneNumber,
      channel: channel
    });

  return callback(null, {
    success: true,
    status: verification.status,
    channel: channel
  });
};
```

### Rate Limiting

```javascript
const verification = await client.verify.v2
  .services(serviceSid)
  .verifications.create({
    to: phoneNumber,
    channel: 'sms',
    rateLimits: {
      uniqueName: 'end_user_phone_number',
      value: phoneNumber
    }
  });
```

## Error Handling

### Error Handling Pattern

```javascript
exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();

  try {
    const verification = await client.verify.v2
      .services(context.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to: event.phoneNumber,
        channel: 'sms'
      });

    return callback(null, { success: true, status: verification.status });
  } catch (error) {
    if (error.code === 60202) {
      return callback(null, {
        success: false,
        error: 'Too many attempts. Please wait before trying again.'
      });
    }
    if (error.code === 60223) {
      return callback(null, {
        success: false,
        error: 'Invalid phone number format.'
      });
    }
    throw error;
  }
};
```

## Testing Verify Functions

### Test Phone Numbers

Twilio provides magic phone numbers for testing:
- `+15005550006` - Always succeeds
- `+15005550009` - Always fails

### Test Codes

With Custom Code enabled on your Verify Service:
- Code `123456` works for test numbers in development

### Integration Test Pattern

```javascript
it('should start verification successfully', async () => {
  const context = createTestContext();
  const event = { to: '+15005550006', channel: 'sms' };

  await handler(context, event, callback);

  const [, response] = callback.mock.calls[0];
  expect(response.success).toBe(true);
  expect(response.status).toBe('pending');
});
```

## Service Configuration

Create a Verify Service in the Twilio Console with these options:
- **Code Length**: 4-10 digits (default: 6)
- **Code TTL**: 60-600 seconds (default: 600)
- **Lookup Enabled**: Validate phone numbers before sending
- **Skip SMS to Landlines**: Auto-switch landlines to voice
- **Custom Code Enabled**: Allow custom codes for testing
