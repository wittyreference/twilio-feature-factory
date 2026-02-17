// ABOUTME: Ends an active conference by updating its status to completed.
// ABOUTME: Protected endpoint for programmatic conference termination and cleanup.

exports.handler = async (context, event, callback) => {
  const client = context.getTwilioClient();

  // Conference identifier - either SID or friendly name
  const conferenceSid = event.ConferenceSid;
  const conferenceName = event.ConferenceName;

  if (!conferenceSid && !conferenceName) {
    const response = new Twilio.Response();
    response.setStatusCode(400);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({ error: 'Missing required parameter: ConferenceSid or ConferenceName' }));
    return callback(null, response);
  }

  try {
    let conference;

    if (conferenceSid) {
      // End by SID directly
      conference = await client.conferences(conferenceSid)
        .update({ status: 'completed' });
    } else {
      // Find conference by friendly name first
      const conferences = await client.conferences.list({
        friendlyName: conferenceName,
        status: 'in-progress',
        limit: 1
      });

      if (conferences.length === 0) {
        const response = new Twilio.Response();
        response.setStatusCode(404);
        response.appendHeader('Content-Type', 'application/json');
        response.setBody(JSON.stringify({
          error: 'Conference not found or not in progress',
          conferenceName
        }));
        return callback(null, response);
      }

      conference = await client.conferences(conferences[0].sid)
        .update({ status: 'completed' });
    }

    const response = new Twilio.Response();
    response.setStatusCode(200);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      success: true,
      conferenceSid: conference.sid,
      friendlyName: conference.friendlyName,
      status: conference.status
    }));

    return callback(null, response);
  } catch (error) {
    const response = new Twilio.Response();
    response.setStatusCode(error.status || 500);
    response.appendHeader('Content-Type', 'application/json');
    response.setBody(JSON.stringify({
      error: error.message,
      code: error.code
    }));

    return callback(null, response);
  }
};
