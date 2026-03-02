# Pay Functions Context

This directory contains Twilio Pay functions for PCI-compliant payment collection during voice calls.

## Files

| File | Access | Description |
|------|--------|-------------|
| `collect-payment.js` | Public | Voice webhook returning `<Pay>` TwiML to collect credit card via DTMF |
| `payment-complete.protected.js` | Protected | `<Pay>` action URL — receives tokenized card result, returns confirmation TwiML |
| `payment-status.protected.js` | Protected | `<Pay>` statusCallback — logs payment progress events |

## PCI Mode Requirement

**WARNING**: `<Pay>` requires PCI Mode to be enabled on the Twilio account. PCI Mode is **irreversible** and **account-wide**. Always use a subaccount for payments development and testing.

## Payment Flow

```
Caller dials in
    ↓
collect-payment.js → <Say> greeting → <Pay> verb
    ↓
Twilio prompts for: card number → expiry → CVV → zip (DTMF)
    ↓
payment-status.protected.js receives progress events
    ↓
payment-complete.protected.js receives tokenized result
    ↓
<Say> confirmation/failure → <Hangup>
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PAYMENT_CONNECTOR` | No | `Default` | Payment connector name |
| `PAYMENT_CHARGE_AMOUNT` | No | `0.00` | Default charge amount |
| `PAYMENT_CURRENCY` | No | `usd` | Currency code |

The `chargeAmount` can also be passed as an event parameter to override the default.

## Pay TwiML Attributes

```javascript
twiml.pay({
  paymentConnector: 'Default',     // Payment gateway connector
  chargeAmount: '9.99',            // Amount to charge
  currency: 'usd',                 // Currency code
  paymentMethod: 'credit-card',    // credit-card or ach-debit
  tokenType: 'one-time',           // one-time or reusable
  action: '/pay/payment-complete', // Receives result
  statusCallback: '/pay/payment-status', // Progress updates
});
```

## Payment Result Parameters

The `action` URL receives these parameters:

| Parameter | Description |
|-----------|-------------|
| `Result` | `success`, `payment-connector-error`, `caller-interrupted`, etc. |
| `PaymentToken` | Tokenized card (for charging via payment processor) |
| `PaymentCardNumber` | Last 4 digits |
| `PaymentCardType` | `visa`, `mastercard`, `amex`, etc. |
| `PaymentConfirmationCode` | Confirmation code from connector |

## File Naming Conventions

- `*.js` - Public endpoints (voice webhooks Twilio calls directly)
- `*.protected.js` - Protected endpoints (action URLs, status callbacks)
