// ABOUTME: Private helper for logging callback data to Twilio Sync.
// ABOUTME: Used by all status callback functions to store data for deep validation.

/**
 * Logs callback data to a Sync Document for later retrieval by deep validation.
 *
 * Document naming convention: callbacks-{resourceType}-{resourceSid}
 * This allows deep validator to fetch callback data by resource SID.
 *
 * @param {object} context - Twilio Function context
 * @param {string} resourceType - Type of resource (message, call, task, verification)
 * @param {string} resourceSid - The resource SID (SMxxx, CAxxx, etc.)
 * @param {object} callbackData - The callback payload from Twilio
 * @returns {Promise<object>} The updated or created Sync document
 */
async function logToSync(context, resourceType, resourceSid, callbackData) {
  const client = context.getTwilioClient();
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  if (!syncServiceSid) {
    console.log('TWILIO_SYNC_SERVICE_SID not configured, skipping Sync logging');
    return null;
  }

  const documentName = `callbacks-${resourceType}-${resourceSid}`;
  const timestamp = new Date().toISOString();

  const callbackEntry = {
    timestamp,
    status: callbackData.status || callbackData.MessageStatus || callbackData.CallStatus || 'unknown',
    errorCode: callbackData.ErrorCode || callbackData.errorCode || null,
    errorMessage: callbackData.ErrorMessage || callbackData.errorMessage || null,
    rawPayload: callbackData,
  };

  try {
    // Try to update existing document
    const existingDoc = await client.sync.v1
      .services(syncServiceSid)
      .documents(documentName)
      .fetch();

    const currentData = existingDoc.data;
    const callbacks = currentData.callbacks || [];
    callbacks.push(callbackEntry);

    // Count errors
    const errorCount = callbacks.filter((c) => c.errorCode).length;

    const updatedData = {
      resourceSid,
      resourceType,
      callbacks,
      latestStatus: callbackEntry.status,
      latestTimestamp: timestamp,
      errorCount,
      callbackCount: callbacks.length,
    };

    const updated = await client.sync.v1
      .services(syncServiceSid)
      .documents(documentName)
      .update({ data: updatedData });

    console.log(`Updated Sync document ${documentName} with status: ${callbackEntry.status}`);
    return updated;
  } catch (error) {
    if (error.code === 20404) {
      // Document doesn't exist, create it
      const newData = {
        resourceSid,
        resourceType,
        callbacks: [callbackEntry],
        latestStatus: callbackEntry.status,
        latestTimestamp: timestamp,
        errorCount: callbackEntry.errorCode ? 1 : 0,
        callbackCount: 1,
      };

      const created = await client.sync.v1
        .services(syncServiceSid)
        .documents.create({
          uniqueName: documentName,
          data: newData,
          ttl: 86400, // 24 hour TTL - callback data is ephemeral
        });

      console.log(`Created Sync document ${documentName} with status: ${callbackEntry.status}`);
      return created;
    }

    // Re-throw unexpected errors
    console.log(`Error logging to Sync: ${error.message}`);
    throw error;
  }
}

/**
 * Fetches callback data from Sync for a specific resource.
 * Used by deep validator to verify callbacks were received.
 *
 * @param {object} context - Twilio Function context
 * @param {string} resourceType - Type of resource
 * @param {string} resourceSid - The resource SID
 * @returns {Promise<object|null>} The Sync document data or null if not found
 */
async function getCallbackData(context, resourceType, resourceSid) {
  const client = context.getTwilioClient();
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  if (!syncServiceSid) {
    return null;
  }

  const documentName = `callbacks-${resourceType}-${resourceSid}`;

  try {
    const doc = await client.sync.v1
      .services(syncServiceSid)
      .documents(documentName)
      .fetch();

    return doc.data;
  } catch (error) {
    if (error.code === 20404) {
      return null; // Document not found
    }
    throw error;
  }
}

/**
 * Cleans up callback data for a resource (called after validation complete).
 *
 * @param {object} context - Twilio Function context
 * @param {string} resourceType - Type of resource
 * @param {string} resourceSid - The resource SID
 */
async function cleanupCallbackData(context, resourceType, resourceSid) {
  const client = context.getTwilioClient();
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  if (!syncServiceSid) {
    return;
  }

  const documentName = `callbacks-${resourceType}-${resourceSid}`;

  try {
    await client.sync.v1
      .services(syncServiceSid)
      .documents(documentName)
      .remove();

    console.log(`Cleaned up Sync document ${documentName}`);
  } catch (error) {
    if (error.code !== 20404) {
      console.log(`Error cleaning up Sync document: ${error.message}`);
    }
  }
}

module.exports = {
  logToSync,
  getCallbackData,
  cleanupCallbackData,
};
