// ABOUTME: Handles recording completion callback from Twilio.
// ABOUTME: Updates Sync document with recording URL when available.

/**
 * Recording Complete Callback
 *
 * Called by Twilio when a call recording is complete.
 * Updates the Sync document with the recording URL.
 *
 * Callback Parameters:
 *   - RecordingSid: The recording SID
 *   - RecordingUrl: URL to the recording (without extension)
 *   - RecordingStatus: 'completed' or 'failed'
 *   - RecordingDuration: Duration in seconds
 *   - CallSid: The call SID
 */
exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  const {
    RecordingSid,
    RecordingUrl,
    RecordingStatus,
    RecordingDuration,
    CallSid,
  } = event;

  console.log(`Recording callback: ${RecordingSid} for call ${CallSid} - ${RecordingStatus}`);

  if (!CallSid) {
    response.setStatusCode(400);
    response.setBody({ success: false, error: 'Missing CallSid' });
    return callback(null, response);
  }

  try {
    const client = context.getTwilioClient();
    const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

    if (syncServiceSid && RecordingStatus === 'completed') {
      const documentName = `ai-demo-${CallSid}`;

      try {
        // Fetch existing document
        const doc = await client.sync.v1
          .services(syncServiceSid)
          .documents(documentName)
          .fetch();

        // Update with recording info
        const updatedData = {
          ...doc.data,
          recordingSid: RecordingSid,
          recordingUrl: `${RecordingUrl}.mp3`,
          recordingDuration: RecordingDuration,
          recordingStatus: RecordingStatus,
        };

        await client.sync.v1
          .services(syncServiceSid)
          .documents(documentName)
          .update({ data: updatedData });

        console.log(`Updated Sync document ${documentName} with recording`);
      } catch (syncError) {
        // Document might not exist yet (finalize hasn't been called)
        // Store recording info separately
        if (syncError.code === 20404) {
          await client.sync.v1
            .services(syncServiceSid)
            .documents.create({
              uniqueName: `recording-${CallSid}`,
              data: {
                callSid: CallSid,
                recordingSid: RecordingSid,
                recordingUrl: `${RecordingUrl}.mp3`,
                recordingDuration: RecordingDuration,
                recordingStatus: RecordingStatus,
                createdAt: new Date().toISOString(),
              },
              ttl: 86400,
            });
          console.log(`Created temporary recording document for ${CallSid}`);
        } else {
          throw syncError;
        }
      }
    }

    response.setStatusCode(200);
    response.setBody({
      success: true,
      recordingSid: RecordingSid,
      callSid: CallSid,
      status: RecordingStatus,
    });

    return callback(null, response);
  } catch (error) {
    console.error('Recording callback error:', error.message);

    response.setStatusCode(200); // Return 200 to prevent Twilio retries
    response.setBody({
      success: false,
      error: error.message,
    });

    return callback(null, response);
  }
};
