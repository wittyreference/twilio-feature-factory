// ABOUTME: Entry point for phone-based blackjack — deals cards, announces hand, gathers input.
// ABOUTME: Detects natural blackjack and redirects to game-over if found.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const engine = require(Runtime.getFunctions()['helpers/blackjack-engine'].path);
  const sync = require(Runtime.getFunctions()['helpers/blackjack-sync'].path);
  const client = context.getTwilioClient();
  const syncSid = context.TWILIO_SYNC_SERVICE_SID;

  const game = engine.createGame(event.CallSid);
  await sync.createGameDoc(client, syncSid, event.CallSid, game);

  const voice = { voice: 'Polly.Amy-Generative' };

  if (game.status === 'complete') {
    // Natural blackjack
    if (game.outcome === 'player_blackjack') {
      twiml.say(voice, `Blackjack! You were dealt ${engine.narrateHand(game.playerHand)}. The dealer has ${engine.narrateHand(game.dealerHand)}.`);
    } else if (game.outcome === 'dealer_blackjack') {
      twiml.say(voice, `The dealer has blackjack! ${engine.narrateHand(game.dealerHand)}. Your hand: ${engine.narrateHand(game.playerHand)}.`);
    } else {
      twiml.say(voice, 'Both hands are blackjack! It\'s a push.');
    }
    twiml.redirect('/voice/blackjack/game-over');
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

  const dealerUpCard = engine.narrateCard(game.dealerHand[0]);
  gather.say(voice, `Welcome to blackjack! Your cards are ${engine.narrateHand(game.playerHand)}. The dealer is showing ${dealerUpCard}. Press 1 or say hit. Press 2 or say stand.`);

  twiml.say(voice, 'I did not receive your input. Goodbye.');
  twiml.hangup();

  return callback(null, twiml);
};
