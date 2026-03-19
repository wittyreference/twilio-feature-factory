// ABOUTME: Hit/stand loop handler for phone blackjack game.
// ABOUTME: Classifies DTMF/speech input, updates game state in Sync, redirects on bust/21/stand.

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

  const action = engine.classifyInput(event.Digits, event.SpeechResult);

  if (action === 'unknown') {
    const gather = twiml.gather({
      input: 'dtmf speech',
      numDigits: 1,
      timeout: 5,
      speechTimeout: 'auto',
      action: '/voice/blackjack/action',
      hints: 'hit, hit me, card, another, stand, stay, hold',
    });
    gather.say(voice, 'Sorry, I did not understand. Press 1 or say hit. Press 2 or say stand.');
    return callback(null, twiml);
  }

  if (action === 'stand') {
    const updated = { ...game, status: 'dealer_turn' };
    await sync.updateGameDoc(client, syncSid, event.CallSid, updated);
    twiml.say(voice, 'You stand.');
    twiml.redirect('/voice/blackjack/dealer-turn');
    return callback(null, twiml);
  }

  // Hit
  const updated = engine.playerHit(game);
  await sync.updateGameDoc(client, syncSid, event.CallSid, updated);

  const drawnCard = updated.playerHand[updated.playerHand.length - 1];
  const score = engine.scoreHand(updated.playerHand);

  if (updated.status === 'complete' && updated.outcome === 'player_bust') {
    twiml.say(voice, `You drew ${engine.narrateCard(drawnCard)}. ${score.total}. You busted!`);
    twiml.redirect('/voice/blackjack/game-over');
    return callback(null, twiml);
  }

  if (updated.status === 'dealer_turn') {
    twiml.say(voice, `You drew ${engine.narrateCard(drawnCard)}. 21!`);
    twiml.redirect('/voice/blackjack/dealer-turn');
    return callback(null, twiml);
  }

  const gather = twiml.gather({
    input: 'dtmf speech',
    numDigits: 1,
    timeout: 5,
    speechTimeout: 'auto',
    action: '/voice/blackjack/action',
    hints: 'hit, hit me, card, another, stand, stay, hold',
  });
  gather.say(voice, `You drew ${engine.narrateCard(drawnCard)}, for ${score.total}. Hit or stand?`);

  return callback(null, twiml);
};
