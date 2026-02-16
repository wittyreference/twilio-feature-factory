// ABOUTME: Handles recording completion callback from Twilio.
// ABOUTME: Updates Sync document and triggers Voice Intelligence transcription.

/**
 * Recording Complete Callback
 *
 * Called by Twilio when a call recording is complete.
 * - Updates the Sync document with the recording URL
 * - Triggers Voice Intelligence transcription (if TWILIO_INTELLIGENCE_SERVICE_SID set)
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
    AccountSid,
    RecordingSid,
    RecordingUrl,
    RecordingStatus,
    RecordingDuration,
    CallSid,
  } = event;

  console.log(`Recording callback: ${RecordingSid} for call ${CallSid} - ${RecordingStatus}`);

  // Security check: Validate AccountSid matches our account
  if (AccountSid && AccountSid !== context.ACCOUNT_SID) {
    console.warn(`Rejected: AccountSid mismatch (${AccountSid} vs ${context.ACCOUNT_SID})`);
    response.setStatusCode(403);
    response.setBody({ success: false, error: 'Invalid account' });
    return callback(null, response);
  }

  if (!CallSid) {
    response.setStatusCode(400);
    response.setBody({ success: false, error: 'Missing CallSid' });
    return callback(null, response);
  }

  try {
    const client = context.getTwilioClient();
    const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
    const intelligenceServiceSid = context.TWILIO_INTELLIGENCE_SERVICE_SID;

    const recordingMediaUrl = `${RecordingUrl}.mp3`;
    let transcriptSid = null;

    // Fetch call details to get From/To numbers for SMS summary later
    let callFrom = null;
    let callTo = null;
    try {
      const call = await client.calls(CallSid).fetch();
      callFrom = call.from;
      callTo = call.to;
    } catch (callError) {
      console.log(`Could not fetch call details: ${callError.message}`);
    }

    // Step 1: Trigger Voice Intelligence transcription if configured
    if (intelligenceServiceSid && RecordingStatus === 'completed') {
      try {
        // Channel format for Voice Intelligence API
        // Use source_sid to reference the Recording directly (avoids auth issues with URLs)
        const channel = {
          media_properties: {
            source_sid: RecordingSid,
          },
          participants: [
            { channel_participant: 1, user_id: 'caller' },
            { channel_participant: 2, user_id: 'agent' },
          ],
        };

        const transcript = await client.intelligence.v2.transcripts.create({
          serviceSid: intelligenceServiceSid,
          channel,
          customerKey: CallSid, // Use CallSid as customer key for correlation
        });

        transcriptSid = transcript.sid;
        console.log(`Created transcript ${transcriptSid} for recording ${RecordingSid}`);
      } catch (transcriptError) {
        // Log but don't fail the callback - transcript creation is async
        console.log('Failed to create transcript:', transcriptError.message);
      }
    }

    // Step 2: Update Sync document with recording info
    if (syncServiceSid && RecordingStatus === 'completed') {
      const documentName = `ai-demo-${CallSid}`;

      try {
        // Fetch existing document
        const doc = await client.sync.v1
          .services(syncServiceSid)
          .documents(documentName)
          .fetch();

        // Update with recording and transcript info (add from/to if not present)
        const updatedData = {
          ...doc.data,
          from: doc.data.from || callFrom,
          to: doc.data.to || callTo,
          recordingSid: RecordingSid,
          recordingUrl: recordingMediaUrl,
          recordingDuration: RecordingDuration,
          recordingStatus: RecordingStatus,
          transcriptSid: transcriptSid,
          transcriptStatus: transcriptSid ? 'queued' : null,
        };

        await client.sync.v1
          .services(syncServiceSid)
          .documents(documentName)
          .update({ data: updatedData });

        console.log(`Updated Sync document ${documentName} with recording and transcript`);
      } catch (syncError) {
        // Document might not exist yet (finalize hasn't been called)
        // Store recording info separately
        if (syncError.code === 20404) {
          try {
            await client.sync.v1
              .services(syncServiceSid)
              .documents.create({
                uniqueName: `recording-${CallSid}`,
                data: {
                  callSid: CallSid,
                  from: callFrom,
                  to: callTo,
                  recordingSid: RecordingSid,
                  recordingUrl: recordingMediaUrl,
                  recordingDuration: RecordingDuration,
                  recordingStatus: RecordingStatus,
                  transcriptSid: transcriptSid,
                  transcriptStatus: transcriptSid ? 'queued' : null,
                  createdAt: new Date().toISOString(),
                },
                ttl: 86400,
              });
            console.log(`Created temporary recording document for ${CallSid}`);
          } catch (createError) {
            // Handle duplicate callbacks (Twilio may retry)
            if (createError.code === 54301) {
              console.log(`Recording document already exists for ${CallSid} (duplicate callback)`);
            } else {
              throw createError;
            }
          }
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
      transcriptSid: transcriptSid,
    });

    return callback(null, response);
  } catch (error) {
    console.log('Recording callback error:', error.message);

    response.setStatusCode(200); // Return 200 to prevent Twilio retries
    response.setBody({
      success: false,
      error: error.message,
    });

    return callback(null, response);
  }
};
