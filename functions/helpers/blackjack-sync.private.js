// ABOUTME: Sync helper for persisting blackjack game state across function invocations.
// ABOUTME: Wraps Twilio Sync Document CRUD with error handling and graceful degradation.

/**
 * Creates or overwrites a Sync document for a blackjack game.
 * Uses update-first pattern: handles replay (same CallSid) without error code ambiguity.
 */
async function createGameDoc(client, syncServiceSid, callSid, gameState) {
  if (!syncServiceSid) {
    console.log('TWILIO_SYNC_SERVICE_SID not configured, skipping Sync');
    return null;
  }

  const documentName = `blackjack-${callSid}`;

  // Try update first (handles replay — same CallSid, doc already exists)
  try {
    const doc = await client.sync.v1
      .services(syncServiceSid)
      .documents(documentName)
      .update({ data: gameState });

    console.log(`Overwrote existing Sync document ${documentName}`);
    return doc;
  } catch (updateError) {
    if (updateError.code !== 20404) {
      console.log(`Error updating Sync document: ${updateError.message}`);
      throw updateError;
    }
  }

  // Document doesn't exist yet — create it
  const doc = await client.sync.v1
    .services(syncServiceSid)
    .documents.create({
      uniqueName: documentName,
      data: gameState,
      ttl: 86400,
    });

  console.log(`Created Sync document ${documentName}`);
  return doc;
}

/**
 * Fetches the game state from Sync.
 * Returns the document data or null if not found.
 */
async function fetchGameDoc(client, syncServiceSid, callSid) {
  if (!syncServiceSid) {
    return null;
  }

  const documentName = `blackjack-${callSid}`;

  try {
    const doc = await client.sync.v1
      .services(syncServiceSid)
      .documents(documentName)
      .fetch();

    return doc.data;
  } catch (error) {
    if (error.code === 20404) {
      return null;
    }
    console.log(`Error fetching Sync document: ${error.message}`);
    throw error;
  }
}

/**
 * Updates the game state in Sync.
 */
async function updateGameDoc(client, syncServiceSid, callSid, gameState) {
  if (!syncServiceSid) {
    return null;
  }

  const documentName = `blackjack-${callSid}`;

  try {
    const doc = await client.sync.v1
      .services(syncServiceSid)
      .documents(documentName)
      .update({ data: gameState });

    console.log(`Updated Sync document ${documentName} — status: ${gameState.status}`);
    return doc;
  } catch (error) {
    console.log(`Error updating Sync document: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createGameDoc,
  fetchGameDoc,
  updateGameDoc,
};
