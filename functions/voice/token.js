// ABOUTME: Generates Twilio Voice SDK access tokens (JWTs) with VoiceGrant.
// ABOUTME: Used by browser-based softphones to authenticate with Twilio Voice SDK.

// AccessToken and VoiceGrant come from the twilio npm package.
// Twilio.Response comes from the serverless runtime global (not the npm package).
const { jwt: { AccessToken } } = require('twilio');
const VoiceGrant = AccessToken.VoiceGrant;

exports.handler = async (context, event, callback) => {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, TWILIO_VOICE_SDK_APP_SID } = context;

  if (!TWILIO_API_KEY || !TWILIO_API_SECRET) {
    response.setStatusCode(500);
    response.setBody(JSON.stringify({
      error: 'TWILIO_API_KEY and TWILIO_API_SECRET are required for token generation'
    }));
    return callback(null, response);
  }

  if (!TWILIO_VOICE_SDK_APP_SID) {
    response.setStatusCode(500);
    response.setBody(JSON.stringify({
      error: 'TWILIO_VOICE_SDK_APP_SID is required for Voice SDK tokens'
    }));
    return callback(null, response);
  }

  const identity = event.identity || `browser-user-${Date.now()}`;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWILIO_VOICE_SDK_APP_SID,
    incomingAllow: true
  });

  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY,
    TWILIO_API_SECRET,
    { identity }
  );

  token.addGrant(voiceGrant);

  response.setBody(JSON.stringify({
    token: token.toJwt(),
    identity
  }));

  return callback(null, response);
};
