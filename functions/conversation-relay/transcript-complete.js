// ABOUTME: Handles Voice Intelligence transcript completion callback.
// ABOUTME: Fetches operator results and sends SMS summary when transcript is ready.

/**
 * Transcript Complete Callback
 *
 * Called by Voice Intelligence when a transcript processing is complete.
 * Configure this webhook in Console: Voice → Voice Intelligence → [Service] → Webhooks
 *
 * Callback Parameters (from Voice Intelligence):
 *   - transcript_sid: The transcript SID (GT...)
 *   - customer_key: The customer key we set (CallSid)
 *   - status: 'completed' or 'failed'
 *
 * This function:
 *   1. Fetches the transcript sentences
 *   2. Fetches language operator results
 *   3. Updates Sync with full transcript data
 *   4. Sends SMS summary to the caller
 */
exports.handler = async function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  // Voice Intelligence webhooks may not include X-Twilio-Signature
  // Validate account_sid matches our account as security measure
  const { account_sid, transcript_sid, customer_key, status, event_type } = event;

  console.log(`Transcript callback: ${transcript_sid} - ${status} (event: ${event_type})`);

  // Security check: Validate account_sid matches our account
  if (account_sid && account_sid !== context.ACCOUNT_SID) {
    console.warn(`Rejected: account_sid mismatch (${account_sid} vs ${context.ACCOUNT_SID})`);
    response.setStatusCode(403);
    response.setBody({ success: false, error: 'Invalid account' });
    return callback(null, response);
  }

  if (!transcript_sid) {
    response.setStatusCode(400);
    response.setBody({ success: false, error: 'Missing transcript_sid' });
    return callback(null, response);
  }

  // Only process transcript_available events (the 'status' field doesn't exist in webhook)
  // Voice Intelligence webhooks send event_type, not status
  if (event_type !== 'voice_intelligence_transcript_available') {
    console.log(`Transcript ${transcript_sid} event_type: ${event_type}, skipping`);
    response.setStatusCode(200);
    response.setBody({ success: true, skipped: true, event_type });
    return callback(null, response);
  }

  try {
    const client = context.getTwilioClient();
    const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
    const intelligenceServiceSid = context.TWILIO_INTELLIGENCE_SERVICE_SID;

    // Step 1: Fetch transcript details
    const transcript = await client.intelligence.v2
      .transcripts(transcript_sid)
      .fetch();

    const callSid = customer_key || transcript.customerKey;
    console.log(`Processing transcript for call ${callSid}`);

    // Step 2: Fetch transcript sentences
    const sentences = await client.intelligence.v2
      .transcripts(transcript_sid)
      .sentences.list({ limit: 100 });

    // Format transcript text
    const formattedTranscript = sentences
      .map((s) => {
        const speaker = s.mediaChannel === 1 ? 'Caller' : 'Agent';
        return `${speaker}: ${s.transcript}`;
      })
      .join('\n');

    console.log(`Transcript has ${sentences.length} sentences`);

    // Step 3: Fetch operator results (summaries, sentiment, etc.)
    let operatorResults = [];
    try {
      operatorResults = await client.intelligence.v2
        .transcripts(transcript_sid)
        .operatorResults.list({ limit: 20 });
      console.log(`Found ${operatorResults.length} operator results`);
    } catch (opError) {
      console.log(`No operator results: ${opError.message}`);
    }

    // Extract key insights from operators
    const insights = extractInsights(operatorResults);

    // Step 4: Update Sync document with full transcript
    if (syncServiceSid && callSid) {
      await updateSyncDocument(client, syncServiceSid, callSid, {
        transcriptSid: transcript_sid,
        transcriptStatus: 'completed',
        transcriptDuration: transcript.duration,
        sentences: sentences.map((s) => ({
          speaker: s.mediaChannel === 1 ? 'caller' : 'agent',
          text: s.transcript,
          startTime: s.startTime,
          endTime: s.endTime,
          confidence: s.confidence,
        })),
        formattedTranscript,
        operatorResults: insights,
        transcriptCompletedAt: new Date().toISOString(),
      });
    }

    // Step 5: Send SMS summary
    // Get caller info from Sync or use customer_key pattern
    const smsResult = await sendSmsSummary(
      client,
      context,
      callSid,
      formattedTranscript,
      insights,
      transcript.duration
    );

    response.setStatusCode(200);
    response.setBody({
      success: true,
      transcriptSid: transcript_sid,
      callSid,
      sentenceCount: sentences.length,
      operatorCount: operatorResults.length,
      smsSent: smsResult.sent,
      messageSid: smsResult.messageSid,
    });

    return callback(null, response);
  } catch (error) {
    console.error('Transcript callback error:', error.message);

    response.setStatusCode(200); // Return 200 to prevent retries
    response.setBody({
      success: false,
      error: error.message,
    });

    return callback(null, response);
  }
};

/**
 * Extract insights from operator results
 */
function extractInsights(operatorResults) {
  const insights = {
    summary: null,
    sentiment: null,
    topics: [],
    entities: [],
    actionItems: [],
  };

  for (const result of operatorResults) {
    const data = result.extractedResults || result.textGenerationResults || {};

    // Handle different operator types
    if (result.operatorType === 'conversation_summarize' || result.name?.includes('summary')) {
      insights.summary = data.result || data.summary || data;
    } else if (result.operatorType === 'pii_extract' || result.name?.includes('pii')) {
      insights.entities = data.entities || data;
    } else if (result.operatorType === 'topic_extract' || result.name?.includes('topic')) {
      insights.topics = data.topics || data;
    } else if (result.operatorType === 'sentiment' || result.name?.includes('sentiment')) {
      insights.sentiment = data.sentiment || data.result || data;
    }
  }

  return insights;
}

/**
 * Update Sync document with transcript data
 */
async function updateSyncDocument(client, syncServiceSid, callSid, data) {
  // Try multiple document name patterns
  const documentNames = [
    `ai-demo-${callSid}`,
    `recording-${callSid}`,
  ];

  for (const documentName of documentNames) {
    try {
      const doc = await client.sync.v1
        .services(syncServiceSid)
        .documents(documentName)
        .fetch();

      await client.sync.v1
        .services(syncServiceSid)
        .documents(documentName)
        .update({
          data: { ...doc.data, ...data },
        });

      console.log(`Updated Sync document: ${documentName}`);
      return;
    } catch (err) {
      if (err.code !== 20404) {
        throw err;
      }
    }
  }

  // Create new document if none exist
  await client.sync.v1
    .services(syncServiceSid)
    .documents.create({
      uniqueName: `transcript-${callSid}`,
      data: { callSid, ...data },
      ttl: 86400,
    });

  console.log(`Created Sync document: transcript-${callSid}`);
}

/**
 * Send SMS summary to caller
 */
async function sendSmsSummary(client, context, callSid, transcript, insights, duration) {
  const smsFrom = context.TWILIO_PHONE_NUMBER;
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  if (!smsFrom) {
    console.log('No TWILIO_PHONE_NUMBER configured, skipping SMS');
    return { sent: false };
  }

  // Try to get caller number from Sync
  let smsTo = null;
  if (syncServiceSid) {
    try {
      const doc = await client.sync.v1
        .services(syncServiceSid)
        .documents(`recording-${callSid}`)
        .fetch();
      // Get the "to" number from call (the person who answered)
      smsTo = doc.data.to || doc.data.from;
    } catch (err) {
      // Try ai-demo document
      try {
        const doc = await client.sync.v1
          .services(syncServiceSid)
          .documents(`ai-demo-${callSid}`)
          .fetch();
        smsTo = doc.data.to || doc.data.from;
      } catch (err2) {
        console.log(`Could not find caller number for ${callSid}`);
      }
    }
  }

  // Fallback: Look up the call
  if (!smsTo) {
    try {
      const call = await client.calls(callSid).fetch();
      smsTo = call.to;
    } catch (err) {
      console.log(`Could not fetch call ${callSid}: ${err.message}`);
    }
  }

  if (!smsTo) {
    console.log('No recipient number found, skipping SMS');
    return { sent: false };
  }

  // Build summary message
  let summary = insights.summary;
  if (!summary && transcript) {
    // Generate simple summary from transcript
    const lines = transcript.split('\n').slice(0, 5);
    summary = lines.length > 0
      ? `Conversation preview: ${lines.join(' ').slice(0, 200)}...`
      : 'Conversation completed.';
  }

  const smsBody = [
    '📞 Voice AI Call Summary',
    '',
    `Duration: ${Math.round(duration || 0)}s`,
    insights.sentiment ? `Sentiment: ${insights.sentiment}` : null,
    '',
    summary || 'No summary available.',
    '',
    insights.topics?.length > 0 ? `Topics: ${insights.topics.slice(0, 3).join(', ')}` : null,
    '',
    `Call ID: ${callSid.slice(-8)}`,
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1600);

  try {
    const message = await client.messages.create({
      to: smsTo,
      from: smsFrom,
      body: smsBody,
    });

    console.log(`SMS summary sent: ${message.sid} to ${smsTo}`);
    return { sent: true, messageSid: message.sid };
  } catch (err) {
    console.error(`Failed to send SMS: ${err.message}`);
    return { sent: false, error: err.message };
  }
}
