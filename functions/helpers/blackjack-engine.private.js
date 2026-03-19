// ABOUTME: Pure blackjack game engine — deck, scoring, game flow, input classification, narration.
// ABOUTME: Zero Twilio dependencies. All functions return new objects, never mutate inputs.

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_NAMES = {
  J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace',
};

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function drawCard(deck) {
  if (deck.length === 0) {
    throw new Error('Cannot draw from an empty deck');
  }
  return {
    card: deck[0],
    remainingDeck: deck.slice(1),
  };
}

function scoreHand(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    if (card.rank === 'A') {
      aces++;
      total += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      total += 10;
    } else {
      total += parseInt(card.rank, 10);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return { total, soft: aces > 0 };
}

function createGame(callSid) {
  const random4 = Math.random().toString(36).substring(2, 6);
  const gameId = `bj-${Date.now()}-${random4}`;
  let deck = shuffleDeck(createDeck());

  // Deal alternating: player, dealer, player, dealer
  const playerHand = [];
  const dealerHand = [];

  let draw = drawCard(deck);
  playerHand.push(draw.card);
  deck = draw.remainingDeck;

  draw = drawCard(deck);
  dealerHand.push(draw.card);
  deck = draw.remainingDeck;

  draw = drawCard(deck);
  playerHand.push(draw.card);
  deck = draw.remainingDeck;

  draw = drawCard(deck);
  dealerHand.push(draw.card);
  deck = draw.remainingDeck;

  const playerScore = scoreHand(playerHand);
  const dealerScore = scoreHand(dealerHand);
  const playerBJ = playerScore.total === 21 && playerHand.length === 2;
  const dealerBJ = dealerScore.total === 21 && dealerHand.length === 2;

  let status = 'player_turn';
  let outcome = null;
  let endTime = null;

  if (playerBJ && dealerBJ) {
    status = 'complete';
    outcome = 'push';
    endTime = new Date().toISOString();
  } else if (playerBJ) {
    status = 'complete';
    outcome = 'player_blackjack';
    endTime = new Date().toISOString();
  } else if (dealerBJ) {
    status = 'complete';
    outcome = 'dealer_blackjack';
    endTime = new Date().toISOString();
  }

  const dealDetail = `Player: ${narrateCard(playerHand[0])} ${narrateCard(playerHand[1])} (${playerScore.total}). Dealer shows: ${narrateCard(dealerHand[0])}`;

  return {
    gameId,
    callSid,
    deck,
    playerHand,
    dealerHand,
    dealerHoleRevealed: false,
    status,
    outcome,
    moves: [{ action: 'deal', timestamp: new Date().toISOString(), detail: dealDetail }],
    startTime: new Date().toISOString(),
    endTime,
  };
}

function playerHit(game) {
  const { card, remainingDeck } = drawCard(game.deck);
  const newHand = [...game.playerHand, card];
  const score = scoreHand(newHand);

  let status = game.status;
  let outcome = game.outcome;
  let endTime = game.endTime;

  if (score.total > 21) {
    status = 'complete';
    outcome = 'player_bust';
    endTime = new Date().toISOString();
  } else if (score.total === 21) {
    status = 'dealer_turn';
  }

  return {
    ...game,
    deck: remainingDeck,
    playerHand: newHand,
    status,
    outcome,
    endTime,
    moves: [...game.moves, {
      action: 'hit',
      timestamp: new Date().toISOString(),
      detail: `Player drew ${narrateCard(card)} (${score.total})`,
    }],
  };
}

function dealerPlay(game) {
  let deck = [...game.deck];
  let dealerHand = [...game.dealerHand];
  const moves = [...game.moves];

  // Record reveal
  moves.push({
    action: 'reveal',
    timestamp: new Date().toISOString(),
    detail: `Dealer reveals ${narrateCard(dealerHand[1])}`,
  });

  // Hit until 17+
  let score = scoreHand(dealerHand);
  while (score.total < 17) {
    const draw = drawCard(deck);
    dealerHand = [...dealerHand, draw.card];
    deck = draw.remainingDeck;
    score = scoreHand(dealerHand);
    moves.push({
      action: 'dealer_hit',
      timestamp: new Date().toISOString(),
      detail: `Dealer drew ${narrateCard(dealerHand[dealerHand.length - 1])} (${score.total})`,
    });
  }

  const outcome = determineOutcome({ ...game, playerHand: game.playerHand, dealerHand });

  return {
    ...game,
    deck,
    dealerHand,
    dealerHoleRevealed: true,
    status: 'complete',
    outcome,
    moves,
    endTime: new Date().toISOString(),
  };
}

function determineOutcome(game) {
  const playerScore = scoreHand(game.playerHand);
  const dealerScore = scoreHand(game.dealerHand);
  const playerBJ = playerScore.total === 21 && game.playerHand.length === 2;
  const dealerBJ = dealerScore.total === 21 && game.dealerHand.length === 2;

  if (playerBJ && dealerBJ) {return 'push';}
  if (playerBJ) {return 'player_blackjack';}
  if (dealerBJ) {return 'dealer_blackjack';}
  if (playerScore.total > 21) {return 'player_bust';}
  if (dealerScore.total > 21) {return 'dealer_bust';}
  if (playerScore.total > dealerScore.total) {return 'player_wins';}
  if (dealerScore.total > playerScore.total) {return 'dealer_wins';}
  return 'push';
}

function classifyInput(digits, speechResult) {
  if (digits === '1') {return 'hit';}
  if (digits === '2') {return 'stand';}

  if (speechResult) {
    const speech = speechResult.toLowerCase().trim();
    if (['hit', 'hit me', 'card', 'another'].includes(speech)) {return 'hit';}
    if (['stand', 'stay', 'hold'].includes(speech)) {return 'stand';}
  }

  return 'unknown';
}

function narrateCard(card) {
  const rankName = RANK_NAMES[card.rank] || card.rank;
  const suitName = card.suit.charAt(0).toUpperCase() + card.suit.slice(1);
  return `${rankName} of ${suitName}`;
}

function narrateHand(hand) {
  const score = scoreHand(hand);
  const names = hand.map(c => narrateCard(c));

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}, for ${score.total}`;
  }

  const last = names.pop();
  return `${names.join(', ')}, and ${last}, for ${score.total}`;
}

module.exports = {
  createDeck,
  shuffleDeck,
  drawCard,
  scoreHand,
  createGame,
  playerHit,
  dealerPlay,
  determineOutcome,
  classifyInput,
  narrateCard,
  narrateHand,
};
