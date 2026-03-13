// ABOUTME: Entry point for the blackjack game — deals cards and prompts for first action.
// ABOUTME: Creates a new game, stores state in Sync, and gathers DTMF or speech input.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const client = context.getTwilioClient();
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  const engine = require(Runtime.getFunctions()['helpers/blackjack-engine'].path);
  const sync = require(Runtime.getFunctions()['helpers/blackjack-sync'].path);

  const callSid = event.CallSid;

  // Create a new game
  const game = engine.createGame(callSid);

  // Persist to Sync
  await sync.createGameDoc(client, syncServiceSid, callSid, game);

  const dealerUpCard = engine.narrateCard(game.dealerHand[0]);
  const playerNarration = engine.narrateHand(game.playerHand);

  // Check for natural blackjack
  if (game.status === 'complete') {
    twiml.say(
      { voice: 'Polly.Amy-Generative' },
      'Welcome to Blackjack! '
    );

    if (game.outcome === 'player_blackjack') {
      twiml.say(
        { voice: 'Polly.Amy-Generative' },
        `You were dealt ${playerNarration}. Blackjack! You win!`
      );
    } else if (game.outcome === 'dealer_blackjack') {
      const dealerNarration = engine.narrateHand(game.dealerHand);
      twiml.say(
        { voice: 'Polly.Amy-Generative' },
        `You were dealt ${playerNarration}. ` +
        `The dealer has ${dealerNarration}. Dealer blackjack. Dealer wins.`
      );
    } else {
      twiml.say(
        { voice: 'Polly.Amy-Generative' },
        `You were dealt ${playerNarration}. The dealer also has blackjack. It's a push.`
      );
    }

    twiml.redirect('/voice/blackjack/game-over');
    return callback(null, twiml);
  }

  // Normal play — announce and gather
  twiml.say(
    { voice: 'Polly.Amy-Generative' },
    'Welcome to Blackjack! Let me deal the cards.'
  );

  twiml.pause({ length: 1 });

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
    { voice: 'Polly.Amy-Generative' },
    `You have ${playerNarration}. ` +
    `The dealer is showing ${dealerUpCard}. ` +
    'Press 1 or say hit for another card. Press 2 or say stand to hold.'
  );

  // No-input fallback
  twiml.say(
    { voice: 'Polly.Amy-Generative' },
    'I did not receive any input. Goodbye.'
  );

  return callback(null, twiml);
};
