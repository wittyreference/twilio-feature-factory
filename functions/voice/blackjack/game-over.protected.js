// ABOUTME: Announces the blackjack game result and offers the player a chance to replay.
// ABOUTME: Reads final game state from Sync, narrates outcome, gathers replay/quit input.

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const client = context.getTwilioClient();
  const syncServiceSid = context.TWILIO_SYNC_SERVICE_SID;

  const engine = require(Runtime.getFunctions()['helpers/blackjack-engine'].path);
  const sync = require(Runtime.getFunctions()['helpers/blackjack-sync'].path);

  const callSid = event.CallSid;
  const game = await sync.fetchGameDoc(client, syncServiceSid, callSid);

  if (!game) {
    twiml.say({ voice: 'Polly.Matthew' }, 'Thanks for playing. Goodbye.');
    return callback(null, twiml);
  }

  const playerScore = engine.scoreHand(game.playerHand);
  const dealerScore = engine.scoreHand(game.dealerHand);

  // Handle replay input if this is a callback from the gather
  const replayAction = engine.classifyInput(event.Digits || null, event.SpeechResult || null);
  if (event.Digits === '1' || (event.SpeechResult && replayAction === 'hit')) {
    twiml.say({ voice: 'Polly.Matthew' }, 'New hand coming up!');
    twiml.redirect('/voice/blackjack/welcome');
    return callback(null, twiml);
  }
  if (event.Digits === '2') {
    twiml.say({ voice: 'Polly.Matthew' }, 'Thanks for playing Blackjack! Goodbye.');
    return callback(null, twiml);
  }

  // Announce the outcome
  const outcomeMessages = {
    player_blackjack: 'Blackjack! You win!',
    dealer_blackjack: 'Dealer has blackjack. Dealer wins.',
    player_bust: `You busted with ${playerScore.total}. Dealer wins.`,
    dealer_bust: `Dealer busted with ${dealerScore.total}. You win!`,
    player_wins: `You win with ${playerScore.total} against the dealer's ${dealerScore.total}!`,
    dealer_wins: `Dealer wins with ${dealerScore.total} against your ${playerScore.total}.`,
    push: `It's a push! You both have ${playerScore.total}.`,
  };

  const message = outcomeMessages[game.outcome] || 'Game over.';

  twiml.pause({ length: 1 });
  twiml.say({ voice: 'Polly.Matthew' }, message);
  twiml.pause({ length: 1 });

  // Offer replay
  const gather = twiml.gather({
    input: 'dtmf speech',
    numDigits: 1,
    timeout: 5,
    action: '/voice/blackjack/game-over',
    method: 'POST',
    speechTimeout: 'auto',
    hints: 'deal, play again, yes, quit, no',
  });

  gather.say(
    { voice: 'Polly.Matthew' },
    'Press 1 or say deal to play again. Press 2 or say quit to hang up.'
  );

  // No input — hang up gracefully
  twiml.say({ voice: 'Polly.Matthew' }, 'Thanks for playing Blackjack! Goodbye.');
  return callback(null, twiml);
};
