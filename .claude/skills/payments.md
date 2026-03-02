# Payments Development Skill

Guide for Twilio Pay — PCI-compliant payment collection during voice calls. Load this skill when implementing credit card capture, payment processing, or PCI compliance patterns.

---

## Quick Decision: Do You Need Twilio Pay?

| Scenario | Use Pay? | Alternative |
|----------|:--------:|-------------|
| Collect credit card during a call | **Yes** | — |
| Process ACH/bank account during a call | **Yes** | — |
| Collect payment info via SMS/web | **No** | Stripe/payment processor directly |
| Store cards for future charges | **Maybe** | Pay with `tokenType: 'reusable'` |
| Accept payments without a voice call | **No** | Standard payment gateway |

**Key insight:** Twilio Pay is specifically for collecting payment information during active voice calls via DTMF (touchtone) or speech. It's not a general payment processor — it handles the PCI-compliant capture and tokenization, then you charge through your payment connector.

---

## PCI Mode Warning

**PCI Mode is IRREVERSIBLE and ACCOUNT-WIDE.**

When you enable PCI Mode on a Twilio account:
- The `<Pay>` TwiML verb becomes available
- DTMF tones for card numbers are masked in logs
- Recording behavior changes (card digits are silenced)
- **This CANNOT be undone**

**Always use a subaccount for payments development and testing.** Never enable PCI Mode on your main account unless you're certain.

```bash
# Create a subaccount for payments testing
twilio api:core:accounts:create --friendly-name "Payments Testing"
```

---

## Architecture

### TwiML Approach (Serverless Functions)

```
Caller dials in
    ↓
Voice webhook → <Say> greeting → <Pay> verb
    ↓
Twilio prompts for card info via DTMF:
  1. Card number (16 digits)
  2. Expiration date (MMYY)
  3. Security code (3-4 digits)
  4. Postal code (5 digits)
    ↓
statusCallback receives progress events
    ↓
action URL receives tokenized result
    ↓
You charge the token via your payment connector
```

### REST API Approach (MCP Tools)

```
Active call exists (CallSid)
    ↓
create_payment → initiates DTMF capture
    ↓
update_payment → capture next field or complete
    ↓
get_payment → check status and token
```

**When to use which:**
- **TwiML** (`<Pay>` verb): When payment is part of a predefined call flow (IVR)
- **REST API**: When payment is triggered dynamically during an existing call

---

## TwiML Pay Verb

### Basic Usage

```javascript
const twiml = new Twilio.twiml.VoiceResponse();

twiml.say('Please enter your credit card information.');

twiml.pay({
  paymentConnector: 'Default',
  chargeAmount: '29.99',
  currency: 'usd',
  paymentMethod: 'credit-card',
  tokenType: 'one-time',
  action: '/pay/payment-complete',
  statusCallback: '/pay/payment-status',
});
```

### Pay Attributes

| Attribute | Required | Default | Description |
|-----------|:--------:|---------|-------------|
| `paymentConnector` | Yes | — | Payment gateway connector name |
| `chargeAmount` | No | — | Amount to charge (e.g., `'29.99'`) |
| `currency` | No | `usd` | ISO currency code |
| `paymentMethod` | No | `credit-card` | `credit-card` or `ach-debit` |
| `tokenType` | No | `one-time` | `one-time` or `reusable` |
| `action` | Yes | — | URL receiving payment result |
| `statusCallback` | No | — | URL receiving progress events |
| `timeout` | No | `5` | Seconds to wait for input |
| `maxAttempts` | No | `1` | Retry attempts on failure |
| `validCardTypes` | No | all | Space-separated: `visa mastercard amex` |
| `minPostalCodeLength` | No | `1` | Minimum postal code digits |
| `postalCode` | No | `true` | Whether to collect postal code |
| `securityCode` | No | `true` | Whether to collect CVV |

### Action URL Parameters

When payment completes (success or failure), Twilio POSTs to the `action` URL:

| Parameter | Description |
|-----------|-------------|
| `Result` | `success`, `payment-connector-error`, `caller-interrupted`, `input-matching-failed`, `internal-error` |
| `PaymentToken` | Tokenized card (use to charge via connector) |
| `PaymentCardNumber` | Last 4 digits only |
| `PaymentCardType` | `visa`, `mastercard`, `amex`, `discover`, etc. |
| `ExpirationDate` | Card expiration (MMYY) |
| `PaymentConfirmationCode` | From payment connector |
| `ProfileId` | For reusable tokens |
| `CallSid` | The call this payment was on |

### Status Callback Parameters

Progress events during DTMF collection:

| Parameter | Description |
|-----------|-------------|
| `Capture` | Field being captured: `payment-card-number`, `expiration-date`, `security-code`, `postal-code` |
| `Result` | Current status |
| `PaymentSid` | Payment session SID (PK prefix) |
| `ErrorCode` | Error code if failed |
| `ErrorMessage` | Error description |

---

## Payment Connectors

Payment connectors bridge Twilio Pay to your payment processor. Configure in Twilio Console.

### Supported Processors

| Connector | Type | Notes |
|-----------|------|-------|
| Stripe | Default | Most common, easiest setup |
| Braintree | — | PayPal ecosystem |
| CardConnect | — | Enterprise |
| Chase Paymentech | — | Enterprise |
| Generic Pay Connector | Custom | For other processors |

### Connector Setup

1. Console → Voice → Pay Connectors
2. Select your processor
3. Enter API credentials
4. Name it (used in `paymentConnector` attribute)
5. Test with a small charge

---

## ACH Debit Payments

For bank account payments instead of credit cards:

```javascript
twiml.pay({
  paymentConnector: 'Default',
  chargeAmount: '100.00',
  paymentMethod: 'ach-debit',
  action: '/pay/payment-complete',
});
```

ACH collects:
- Bank routing number (9 digits)
- Bank account number

---

## Common Gotchas

1. **PCI Mode is irreversible**: Cannot stress this enough. Use a subaccount. Test there first. Only enable on production when ready.

2. **Payment connector must exist**: The `paymentConnector` name in TwiML must match an existing connector in your Console. Typo = failure.

3. **Recordings auto-mask card digits**: In PCI Mode, call recordings automatically silence DTMF tones during card entry. You don't need to pause recording manually.

4. **`chargeAmount` is optional**: You can tokenize a card without charging. Useful for saving cards for future use with `tokenType: 'reusable'`.

5. **Action URL is required**: Without an `action`, you won't receive the payment result. The call will continue but you'll have no token.

6. **DTMF only by default**: `<Pay>` uses DTMF (touchtone) input. Speech input requires additional configuration and is not available in all regions.

7. **`maxAttempts` resets the entire flow**: On retry, the caller re-enters ALL fields, not just the one that failed.

8. **Test with real cards**: Twilio Pay doesn't have test card numbers. Use your payment connector's test mode (e.g., Stripe test mode) for development.

## MCP Tools Available

`create_payment` — Initiate payment capture on active call
`update_payment` — Complete, cancel, or capture next field
`get_payment` — Check payment status and token

## Function Patterns Available

`functions/pay/collect-payment.js` — TwiML webhook with `<Pay>` verb
`functions/pay/payment-complete.protected.js` — Action URL handler
`functions/pay/payment-status.protected.js` — Status callback handler
