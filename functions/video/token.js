// ABOUTME: Generates Twilio Video SDK access tokens (JWTs) with VideoGrant.
// ABOUTME: Used by client applications to connect participants to video rooms.

// AccessToken and VideoGrant come from the twilio npm package.
// Twilio.Response comes from the serverless runtime global (not the npm package).
const { jwt: { AccessToken } } = require('twilio');
const VideoGrant = AccessToken.VideoGrant;

exports.handler = async (context, event, callback) => {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET } = context;

  if (!TWILIO_API_KEY || !TWILIO_API_SECRET) {
    response.setStatusCode(500);
    response.setBody(JSON.stringify({
      error: 'TWILIO_API_KEY and TWILIO_API_SECRET are required for token generation'
    }));
    return callback(null, response);
  }

  const identity = event.identity || `video-user-${Date.now()}`;
  const roomName = event.room;

  const videoGrant = new VideoGrant({
    room: roomName
  });

  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY,
    TWILIO_API_SECRET,
    { identity }
  );

  token.addGrant(videoGrant);

  response.setBody(JSON.stringify({
    token: token.toJwt(),
    identity,
    room: roomName || null
  }));

  return callback(null, response);
};
