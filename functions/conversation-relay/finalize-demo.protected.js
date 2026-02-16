// ABOUTME: Processes completed AI demo call transcript and sends summary.
// ABOUTME: Stores transcript in Sync, generates summary, sends SMS notification.

/**
 * Finalize AI Demo Call
 *
 * Called by the WebSocket server when a call ends. Processes the
 * conversation transcript, generates a summary, stores in Sync,
 * and sends an SMS summary to the caller.
 *
 * POST Body:
 *   - callSid: The call SID
 *   - from: Caller phone number
 *   - to: Called phone number
 *   - transcript: Array of {role, content, timestamp} objects
 *   - duration: Call duration in seconds
 *   - turnCount: Number of conversation turns
 *
 * Environment Variables:
 *   - TWILIO_SYNC_SERVICE_SID: Sync service for storage
 *   - TWILIO_PHONE_NUMBER: SMS sender number
 *   - ANTHROPIC_API_KEY: For summary generation (optional)
 */
exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  // Parse request body
  let requestData;
  if (typeof event === 'string') {
    try {
      requestData = JSON.parse(event);
    } catch {
      requestData = event;
    }
  } else {
    requestData = event;
  }

  const { callSid, from, to, transcript, duration, turnCount } = requestData;

  // Validate required fields
  if (!callSid) {
    response.setStatusCode(400);
    response.setBody({ success: false, error: 'Missing callSid' });
    return callback(null, response);
  }

  if (!transcript || !Array.isArray(transcript)) {
    response.setStatusCode(400);
    response.setBody({ success: false, error: 'Missing or invalid transcript' });
    return callback(null, response);
  }

  try {
    const client = context.getTwilioClient();

    // Format transcript for storage and display
    const formattedTranscript = transcript
      .map((msg) => `${msg.role === 'user' ? 'Caller' : 'AI'}: ${msg.content}`)
      .join('\n');

    // Generate summary (simple extraction if no API key, Claude if available)
    let summary;
    if (process.env.ANTHROPIC_API_KEY) {
      summary = await generateClaudeSummary(formattedTranscript);
    } else {
      summary = generateSimpleSummary(transcript, duration, turnCount);
    }

    // Store in Sync
    const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
    if (syncServiceSid) {
      const documentName = `ai-demo-${callSid}`;

      try {
        // Try to create, or update if exists
        await client.sync.v1
          .services(syncServiceSid)
          .documents.create({
            uniqueName: documentName,
            data: {
              callSid,
              from,
              to,
              duration,
              turnCount,
              transcript,
              formattedTranscript,
              summary,
              completedAt: new Date().toISOString(),
            },
            ttl: 86400, // 24 hour TTL
          });

        console.log(`Transcript stored in Sync: ${documentName}`);
      } catch (syncError) {
        // Document might already exist, try update
        if (syncError.code === 54301) {
          await client.sync.v1
            .services(syncServiceSid)
            .documents(documentName)
            .update({
              data: {
                callSid,
                from,
                to,
                duration,
                turnCount,
                transcript,
                formattedTranscript,
                summary,
                completedAt: new Date().toISOString(),
              },
            });
          console.log(`Transcript updated in Sync: ${documentName}`);
        } else {
          throw syncError;
        }
      }
    }

    // Send SMS summary to the caller
    const smsBody = `AI Call Summary\n\nDuration: ${duration}s\nTurns: ${turnCount}\n\n${summary}\n\nFull transcript stored with call ID: ${callSid.slice(-8)}`;

    // Determine who to send SMS to (the person who was called)
    const smsTo = to || from;
    const smsFrom = context.TWILIO_PHONE_NUMBER;

    if (smsTo && smsFrom) {
      const message = await client.messages.create({
        to: smsTo,
        from: smsFrom,
        body: smsBody.slice(0, 1600), // SMS limit
      });

      console.log(`SMS summary sent: ${message.sid} to ${smsTo}`);
    }

    response.setStatusCode(200);
    response.setBody({
      success: true,
      callSid,
      summary,
      syncDocument: syncServiceSid ? `ai-demo-${callSid}` : null,
      smsSent: !!(smsTo && smsFrom),
    });

    return callback(null, response);
  } catch (error) {
    console.log('Failed to finalize AI demo:', error.message);

    response.setStatusCode(500);
    response.setBody({
      success: false,
      error: error.message,
    });

    return callback(null, response);
  }
};

/**
 * Generate a simple summary without external API
 */
function generateSimpleSummary(transcript, duration, turnCount) {
  const userMessages = transcript.filter((m) => m.role === 'user');
  // Note: Could filter aiMessages = transcript.filter(m => m.role === 'assistant')
  // for AI-side analysis if needed

  // Extract key topics from user messages
  const topics = userMessages
    .map((m) => m.content)
    .join(' ')
    .split(/[.!?]/)
    .filter((s) => s.trim().length > 10)
    .slice(0, 3)
    .map((s) => s.trim());

  return `You had a ${Math.round(duration)}s conversation with ${turnCount} exchanges. ${
    topics.length > 0
      ? `Key topics discussed: ${topics.join('; ')}`
      : 'The conversation covered general topics.'
  }`;
}

/**
 * Generate summary using Claude API
 */
async function generateClaudeSummary(transcript) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Summarize this phone conversation in 2-3 sentences. Focus on what was discussed and any outcomes:\n\n${transcript}`,
        },
      ],
    });

    for (const block of response.content) {
      if (block.type === 'text') {
        return block.text;
      }
    }
    return 'Summary could not be generated.';
  } catch (error) {
    console.log('Claude summary error:', error.message);
    return 'Summary generation failed. See full transcript for details.';
  }
}
