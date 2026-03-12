// ABOUTME: Handles recording completion for pizza ordering calls.
// ABOUTME: Triggers transcription, stores order in Sync, and sends SMS confirmation.

exports.handler = async function (context, event, callback) {
  var response = new Twilio.Response();
  response.appendHeader('Content-Type', 'application/json');

  var AccountSid = event.AccountSid;
  var RecordingSid = event.RecordingSid;
  var RecordingUrl = event.RecordingUrl;
  var RecordingStatus = event.RecordingStatus;
  var RecordingDuration = event.RecordingDuration;
  var CallSid = event.CallSid;

  console.log(
    'Pizza order recording callback: ' +
      RecordingSid + ' for call ' + CallSid + ' - ' + RecordingStatus
  );

  // Security: validate AccountSid
  if (AccountSid && AccountSid !== context.ACCOUNT_SID) {
    console.log('Rejected: AccountSid mismatch');
    response.setStatusCode(403);
    response.setBody(JSON.stringify({ success: false, error: 'Invalid account' }));
    return callback(null, response);
  }

  if (!CallSid) {
    response.setStatusCode(400);
    response.setBody(JSON.stringify({ success: false, error: 'Missing CallSid' }));
    return callback(null, response);
  }

  if (RecordingStatus !== 'completed') {
    console.log('Recording not completed: ' + RecordingStatus);
    response.setStatusCode(200);
    response.setBody(
      JSON.stringify({ success: true, skipped: true, status: RecordingStatus })
    );
    return callback(null, response);
  }

  try {
    var client = context.getTwilioClient();
    var syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;
    var intelligenceServiceSid = context.TWILIO_INTELLIGENCE_SERVICE_SID;
    var recordingMediaUrl = RecordingUrl + '.mp3';

    // Fetch call details for caller number
    var callFrom = null;
    var callTo = null;
    try {
      var call = await client.calls(CallSid).fetch();
      callFrom = call.from;
      callTo = call.to;
    } catch (callError) {
      console.log('Could not fetch call details: ' + callError.message);
    }

    // Step 1: Trigger Voice Intelligence transcription
    var transcriptSid = null;
    if (intelligenceServiceSid) {
      try {
        var channel = {
          media_properties: {
            source_sid: RecordingSid,
          },
          participants: [
            { channel_participant: 1, user_id: 'customer' },
            { channel_participant: 2, user_id: 'pizza-agent' },
          ],
        };

        var transcript = await client.intelligence.v2.transcripts.create({
          serviceSid: intelligenceServiceSid,
          channel: channel,
          customerKey: CallSid,
        });

        transcriptSid = transcript.sid;
        console.log('Created transcript ' + transcriptSid + ' for recording ' + RecordingSid);
      } catch (transcriptError) {
        console.log('Failed to create transcript: ' + transcriptError.message);
      }
    }

    // Step 2: Store order in Sync Document
    if (syncServiceSid) {
      var orderData = {
        callSid: CallSid,
        from: callFrom,
        to: callTo,
        recordingSid: RecordingSid,
        recordingUrl: recordingMediaUrl,
        recordingDuration: RecordingDuration,
        transcriptSid: transcriptSid,
        orderStatus: 'received',
        createdAt: new Date().toISOString(),
      };

      try {
        await client.sync.v1.services(syncServiceSid).documents.create({
          uniqueName: 'pizza-order-' + CallSid,
          data: orderData,
          ttl: 86400,
        });
        console.log('Created Sync document: pizza-order-' + CallSid);
      } catch (syncError) {
        if (syncError.code === 54301) {
          console.log('Sync document already exists (duplicate callback)');
        } else {
          console.log('Sync document error: ' + syncError.message);
        }
      }

      // Step 3: Add to pizza orders Sync List for tracking
      try {
        // Ensure the list exists
        try {
          await client.sync.v1
            .services(syncServiceSid)
            .syncLists('pizza-orders')
            .fetch();
        } catch (listError) {
          if (listError.code === 20404) {
            await client.sync.v1.services(syncServiceSid).syncLists.create({
              uniqueName: 'pizza-orders',
              ttl: 86400,
            });
            console.log('Created pizza-orders Sync List');
          }
        }

        await client.sync.v1
          .services(syncServiceSid)
          .syncLists('pizza-orders')
          .syncListItems.create({
            data: {
              callSid: CallSid,
              from: callFrom,
              duration: RecordingDuration,
              transcriptSid: transcriptSid,
              timestamp: new Date().toISOString(),
            },
            ttl: 86400,
          });
        console.log('Added order to pizza-orders Sync List');
      } catch (listError) {
        console.log('Sync list error: ' + listError.message);
      }
    }

    // Step 4: Send SMS order confirmation
    var messageSid = null;
    if (callFrom && context.TWILIO_PHONE_NUMBER) {
      try {
        var smsBody =
          'Thanks for ordering from Mario Pizza! ' +
          'Your order has been received and is being prepared. ' +
          'Call duration: ' + Math.round(RecordingDuration || 0) + 's. ' +
          'Order ref: ' + CallSid.slice(-8);

        var msgParams = {
          to: callFrom,
          body: smsBody,
        };

        // Use messaging service if available, else from number
        if (context.TWILIO_MESSAGING_SERVICE_SID) {
          msgParams.messagingServiceSid = context.TWILIO_MESSAGING_SERVICE_SID;
        } else {
          msgParams.from = context.TWILIO_PHONE_NUMBER;
        }

        var message = await client.messages.create(msgParams);
        messageSid = message.sid;
        console.log('SMS confirmation sent: ' + messageSid + ' to ' + callFrom);
      } catch (smsError) {
        console.log('SMS send failed: ' + smsError.message);
      }
    }

    response.setStatusCode(200);
    response.setBody(
      JSON.stringify({
        success: true,
        callSid: CallSid,
        recordingSid: RecordingSid,
        transcriptSid: transcriptSid,
        messageSid: messageSid,
        orderDocName: 'pizza-order-' + CallSid,
      })
    );

    return callback(null, response);
  } catch (error) {
    console.log('Pizza order callback error: ' + error.message);

    response.setStatusCode(200); // Return 200 to prevent Twilio retries
    response.setBody(JSON.stringify({ success: false, error: error.message }));
    return callback(null, response);
  }
};
