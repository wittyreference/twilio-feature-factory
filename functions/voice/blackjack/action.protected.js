// ABOUTME: Processes player input (hit or stand) during a blackjack game.
// ABOUTME: Classifies DTMF/speech, updates game state in Sync, and redirects accordingly.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const client = context.getTwilioClient();
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  const engine = require(Runtime.getFunctions()['helpers/blackjack-engine'].path);
  const sync = require(Runtime.getFunctions()['helpers/blackjack-sync'].path);

  const callSid = event.CallSid;

  // Fetch current game state
  const game = await sync.fetchGameDoc(client, syncServiceSid, callSid);

  if (!game) {
    twiml.say(
      { voice: 'Polly.Matthew-Generative' },
      'Sorry, your game was not found. Let me start a new one.'
    );
    twiml.redirect('/voice/blackjack/welcome');
    return callback(null, twiml);
  }

  // Classify input
  const action = engine.classifyInput(event.Digits || null, event.SpeechResult || null);

  if (action === 'unknown') {
    const gather = twiml.gather({
      input: 'dtmf speech',
      numDigits: 1,
      timeout: 5,
      action: '/voice/blackjack/action',
      method: 'POST',
      speechTimeout: 'auto',
      hints: 'hit, hit me, card, another, stand, stay, hold',
    });

    gather.say(
      { voice: 'Polly.Matthew-Generative' },
      'Sorry, I did not understand. Press 1 or say hit for another card. Press 2 or say stand to hold.'
    );

    // No-input fallback
    twiml.say({ voice: 'Polly.Matthew-Generative' }, 'No input received. Goodbye.');
    return callback(null, twiml);
  }

  if (action === 'stand') {
    const updated = { ...game, status: 'dealer_turn' };
    updated.moves = [...game.moves, {
      action: 'stand',
      timestamp: new Date().toISOString(),
      detail: `Player stands at ${engine.scoreHand(game.playerHand).total}`,
    }];
    await sync.updateGameDoc(client, syncServiceSid, callSid, updated);

    twiml.say(
      { voice: 'Polly.Matthew-Generative' },
      `You stand at ${engine.scoreHand(game.playerHand).total}. Let's see what the dealer has.`
    );
    twiml.redirect('/voice/blackjack/dealer-turn');
    return callback(null, twiml);
  }

  // action === 'hit'
  const updated = engine.playerHit(game);
  await sync.updateGameDoc(client, syncServiceSid, callSid, updated);

  const newCard = updated.playerHand[updated.playerHand.length - 1];
  const newScore = engine.scoreHand(updated.playerHand);

  if (updated.status === 'complete' && updated.outcome === 'player_bust') {
    twiml.say(
      { voice: 'Polly.Matthew-Generative' },
      `You drew the ${engine.narrateCard(newCard)}. That gives you ${newScore.total}. You busted!`
    );
    twiml.redirect('/voice/blackjack/game-over');
    return callback(null, twiml);
  }

  if (updated.status === 'dealer_turn') {
    twiml.say(
      { voice: 'Polly.Matthew-Generative' },
      `You drew the ${engine.narrateCard(newCard)}. That gives you ${newScore.total}! ` +
      "Let's see what the dealer has."
    );
    twiml.redirect('/voice/blackjack/dealer-turn');
    return callback(null, twiml);
  }

  // Still playing — gather next action
  const gather = twiml.gather({
    input: 'dtmf speech',
    numDigits: 1,
    timeout: 5,
    action: '/voice/blackjack/action',
    method: 'POST',
    speechTimeout: 'auto',
    hints: 'hit, hit me, card, another, stand, stay, hold',
  });

  gather.say(
    { voice: 'Polly.Matthew-Generative' },
    `You drew the ${engine.narrateCard(newCard)}, for ${newScore.total}. ` +
    'Press 1 or say hit for another card. Press 2 or say stand to hold.'
  );

  twiml.say({ voice: 'Polly.Matthew-Generative' }, 'No input received. Goodbye.');
  return callback(null, twiml);
};
