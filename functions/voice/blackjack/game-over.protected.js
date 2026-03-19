// ABOUTME: Game-over handler — announces result for all 7 outcomes, offers replay or quit.
// ABOUTME: Has its own replay/quit speech classification separate from classifyInput.

const OUTCOME_MESSAGES = {
  player_blackjack: 'Blackjack! You win!',
  dealer_blackjack: 'The dealer has blackjack. Dealer wins.',
  player_bust: 'You busted! Dealer wins.',
  dealer_bust: 'The dealer busted! You win!',
  player_wins: 'You win!',
  dealer_wins: 'The dealer wins.',
  push: "It's a push. Nobody wins.",
};

const REPLAY_WORDS = ['deal', 'play again', 'yes', 'again', 'new hand', 'another'];
const QUIT_WORDS = ['quit', 'no', 'stop', 'goodbye', 'bye'];

function classifyReplay(digits, speechResult) {
  if (digits === '1') {return 'replay';}
  if (digits === '2') {return 'quit';}

  if (speechResult) {
    const speech = speechResult.toLowerCase().trim();
    if (REPLAY_WORDS.includes(speech)) {return 'replay';}
    if (QUIT_WORDS.includes(speech)) {return 'quit';}
  }

  return 'unknown';
}

exports.handler = async (context, event, callback) => {
  const twiml = new Twilio.twiml.VoiceResponse();
  const engine = require(Runtime.getFunctions()['helpers/blackjack-engine'].path);
  const sync = require(Runtime.getFunctions()['helpers/blackjack-sync'].path);
  const client = context.getTwilioClient();
  const syncSid = context.TWILIO_SYNC_SERVICE_SID;
  const voice = { voice: 'Polly.Amy-Generative' };

  const game = await sync.fetchGameDoc(client, syncSid, event.CallSid);
  if (!game) {
    twiml.say(voice, 'Thanks for playing. Goodbye.');
    twiml.hangup();
    return callback(null, twiml);
  }

  // Check for replay/quit input (this handler is also the Gather action)
  const replayAction = classifyReplay(event.Digits, event.SpeechResult);

  if (replayAction === 'replay') {
    twiml.redirect('/voice/blackjack/welcome');
    return callback(null, twiml);
  }

  if (replayAction === 'quit') {
    twiml.say(voice, 'Thanks for playing. Goodbye.');
    twiml.hangup();
    return callback(null, twiml);
  }

  // Announce outcome
  const message = OUTCOME_MESSAGES[game.outcome] || 'Game over.';
  const playerScore = engine.scoreHand(game.playerHand);
  const dealerScore = engine.scoreHand(game.dealerHand);

  twiml.say(voice, `${message} Your hand: ${engine.narrateHand(game.playerHand)}. Dealer's hand: ${engine.narrateHand(game.dealerHand)}.`);

  // Offer replay
  const gather = twiml.gather({
    input: 'dtmf speech',
    numDigits: 1,
    timeout: 4,
    speechTimeout: 'auto',
    action: '/voice/blackjack/game-over',
    hints: 'deal, play again, yes, quit, no',
  });
  gather.say(voice, 'Press 1 or say deal to play again. Press 2 or say quit to end.');

  twiml.say(voice, 'Thanks for playing. Goodbye.');
  twiml.hangup();

  return callback(null, twiml);
};
