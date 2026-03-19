// ABOUTME: Dealer turn handler — reveals hole card, draws until 17+, narrates each card.
// ABOUTME: Updates completed game state in Sync and redirects to game-over.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const engine = require(Runtime.getFunctions()['helpers/blackjack-engine'].path);
  const sync = require(Runtime.getFunctions()['helpers/blackjack-sync'].path);
  const client = context.getTwilioClient();
  const syncSid = context.TWILIO_SYNC_SERVICE_SID;
  const voice = { voice: 'Polly.Amy-Generative' };

  const game = await sync.fetchGameDoc(client, syncSid, event.CallSid);
  if (!game) {
    twiml.redirect('/voice/blackjack/welcome');
    return callback(null, twiml);
  }

  const result = engine.dealerPlay(game);
  await sync.updateGameDoc(client, syncSid, event.CallSid, result);

  // Narrate hole card reveal
  twiml.say(voice, `The dealer reveals their hole card: ${engine.narrateCard(game.dealerHand[1])}.`);

  // Narrate each dealer draw with pauses
  const dealerHits = result.moves.filter(m => m.action === 'dealer_hit');
  for (const move of dealerHits) {
    twiml.pause({ length: 1 });
    twiml.say(voice, move.detail + '.');
  }

  twiml.redirect('/voice/blackjack/game-over');
  return callback(null, twiml);
};
