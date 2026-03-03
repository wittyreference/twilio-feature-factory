// ABOUTME: Test payment processor endpoint for Twilio Generic Pay Connector.
// ABOUTME: Simulates charge/tokenize — always succeeds in simple mode, validates cards in robust mode.

/**
 * Generic Pay Connector Payment Simulator
 *
 * Endpoint that receives tokenized card data from Twilio's Generic Pay Connector
 * and returns success/failure based on test card numbers.
 *
 * Modes:
 *   simple (default): Always returns success regardless of card
 *   robust: Validates card number patterns for test scenarios
 *
 * Environment Variables:
 *   PAY_SIMULATOR_MODE - "simple" (default) or "robust"
 */

// Test card number patterns (last 4 digits for matching in robust mode)
const TEST_CARDS = {
  '4242': { result: 'success', cardType: 'visa' },
  '4151': { result: 'success', cardType: 'visa' },
  '0002': { result: 'decline', errorCode: 'card_declined', errorMessage: 'Card was declined' },
  '0069': { result: 'decline', errorCode: 'expired_card', errorMessage: 'Card has expired' },
  '9995': { result: 'decline', errorCode: 'insufficient_funds', errorMessage: 'Insufficient funds' },
};

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

exports.handler = async (context, event, callback) => {
  const mode = context.PAY_SIMULATOR_MODE || 'simple';

  console.log(`Payment simulator (${mode} mode) received request`);
  console.log(`Method: ${event.Method || 'unknown'}`);
  console.log(`CardType: ${event.CardType || 'unknown'}`);
  console.log(`Amount: ${event.Amount || 'N/A'}`);

  // In simple mode, always return success regardless of input
  if (mode === 'simple') {
    const isCharge = (event.Method || '').toLowerCase() === 'charge';
    const responseBody = isCharge
      ? { charge_id: generateId(), error_code: null, error_message: null }
      : { token_id: generateId(), error_code: null, error_message: null };

    console.log(`Simple mode: returning success — ${JSON.stringify(responseBody)}`);
    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify(responseBody));
    return callback(null, response);
  }

  // Robust mode: validate card number patterns
  const cardNumber = event.CardNumber || '';
  const lastFour = cardNumber.slice(-4);
  const testCard = TEST_CARDS[lastFour];
  const isCharge = (event.Method || '').toLowerCase() === 'charge';

  if (testCard && testCard.result === 'decline') {
    console.log(`Robust mode: declining card ending in ${lastFour} — ${testCard.errorMessage}`);
    const responseBody = isCharge
      ? { charge_id: null, error_code: testCard.errorCode, error_message: testCard.errorMessage }
      : { token_id: null, error_code: testCard.errorCode, error_message: testCard.errorMessage };

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify(responseBody));
    return callback(null, response);
  }

  // Default: success
  const responseBody = isCharge
    ? { charge_id: generateId(), error_code: null, error_message: null }
    : { token_id: generateId(), error_code: null, error_message: null };

  console.log(`Robust mode: approving card ending in ${lastFour} — ${JSON.stringify(responseBody)}`);
  const response = new Twilio.Response();
  response.setStatusCode(200);
  response.appendHeader('Content-Type', 'application/json');
  response.setBody(JSON.stringify(responseBody));
  return callback(null, response);
};
