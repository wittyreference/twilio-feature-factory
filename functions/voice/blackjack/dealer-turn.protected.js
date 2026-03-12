// ABOUTME: Handles the dealer's automatic turn in blackjack — reveals hole card and hits until 17+.
// ABOUTME: Narrates each dealer draw with pauses for dramatic effect, then redirects to game-over.

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

  // Run dealer logic
  const updated = engine.dealerPlay(game);
  await sync.updateGameDoc(client, syncServiceSid, callSid, updated);

  // Narrate the dealer's turn
  twiml.say(
    { voice: 'Polly.Matthew-Generative' },
    `The dealer reveals their hole card: ${engine.narrateCard(game.dealerHand[1])}. ` +
    `The dealer has ${engine.scoreHand(game.dealerHand).total}.`
  );

  // Narrate any additional draws
  const dealerDraws = updated.moves.filter((m) => m.action === 'dealer_hit');
  for (const draw of dealerDraws) {
    twiml.pause({ length: 1 });
    twiml.say(
      { voice: 'Polly.Matthew-Generative' },
      `The dealer draws the ${engine.narrateCard(draw.card)}, for ${engine.scoreHand(
        updated.dealerHand.slice(0, updated.dealerHand.indexOf(draw.card) + 1)
      ).total}.`
    );
  }

  // If dealer drew extra cards, announce final total
  if (dealerDraws.length > 0) {
    const dealerScore = engine.scoreHand(updated.dealerHand);
    twiml.pause({ length: 1 });
    if (dealerScore.total > 21) {
      twiml.say(
        { voice: 'Polly.Matthew-Generative' },
        `The dealer busts with ${dealerScore.total}!`
      );
    } else {
      twiml.say(
        { voice: 'Polly.Matthew-Generative' },
        `The dealer stands at ${dealerScore.total}.`
      );
    }
  }

  twiml.redirect('/voice/blackjack/game-over');
  return callback(null, twiml);
};
