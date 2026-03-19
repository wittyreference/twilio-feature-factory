// ABOUTME: Sync CRUD helper for blackjack game state persistence.
// ABOUTME: Uses update-first pattern with 20404 fallback to create. TTL 86400.

function docName(callSid) {
  return `blackjack-${callSid}`;
}

async function createGameDoc(client, syncSid, callSid, gameState) {
  if (!syncSid) {return null;}

  try {
    await client.sync.v1.services(syncSid)
      .documents(docName(callSid))
      .update({ data: gameState });
  } catch (err) {
    if (err.code === 20404) {
      await client.sync.v1.services(syncSid)
        .documents.create({
          uniqueName: docName(callSid),
          data: gameState,
          ttl: 86400,
        });
    } else {
      throw err;
    }
  }
}

async function fetchGameDoc(client, syncSid, callSid) {
  if (!syncSid) {return null;}

  try {
    const doc = await client.sync.v1.services(syncSid)
      .documents(docName(callSid))
      .fetch();
    return doc.data;
  } catch (err) {
    if (err.code === 20404) {return null;}
    throw err;
  }
}

async function updateGameDoc(client, syncSid, callSid, gameState) {
  if (!syncSid) {return null;}

  return client.sync.v1.services(syncSid)
    .documents(docName(callSid))
    .update({ data: gameState });
}

module.exports = { createGameDoc, fetchGameDoc, updateGameDoc };
