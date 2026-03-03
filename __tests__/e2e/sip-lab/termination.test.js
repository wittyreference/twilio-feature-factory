// ABOUTME: E2E test for SIP trunk termination (Twilio→PBX) via live call.
// ABOUTME: Requires running Asterisk on droplet and provisioned SIP trunk.

const hasSipLab =
  process.env.SIP_LAB_TRUNK_SID &&
  process.env.SIP_LAB_PHONE_NUMBER_SID &&
  process.env.SIP_LAB_DROPLET_IP &&
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN;

const describeWithSipLab = hasSipLab ? describe : describe.skip;

describeWithSipLab('SIP Trunk Termination E2E (Twilio→PBX)', () => {
  let client;

  beforeAll(() => {
    client = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  });

  test('call to trunk-associated number reaches Asterisk and completes', async () => {
    // Find the phone number associated with the trunk
    const numbers = await client.trunking.v1
      .trunks(process.env.SIP_LAB_TRUNK_SID)
      .phoneNumbers.list();

    expect(numbers.length).toBeGreaterThan(0);
    const trunkNumber = numbers[0].phoneNumber;

    // Initiate a call to the trunk number
    // Twilio will route through the SIP trunk to Asterisk
    const call = await client.calls.create({
      to: trunkNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: '<Response><Pause length="5"/></Response>',
    });

    expect(call.sid).toMatch(/^CA/);

    // Wait for call to complete
    let callStatus;
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const fetched = await client.calls(call.sid).fetch();
      callStatus = fetched.status;
      if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus)) {
        break;
      }
    }

    // Asterisk should answer the call — expect completed status
    expect(callStatus).toBe('completed');

    // Verify call had non-zero duration (Asterisk played audio)
    const finalCall = await client.calls(call.sid).fetch();
    expect(parseInt(finalCall.duration, 10)).toBeGreaterThan(0);
  }, 120000);
});
