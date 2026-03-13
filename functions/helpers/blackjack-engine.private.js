// ABOUTME: Pure blackjack game logic with zero Twilio dependencies.
// ABOUTME: Handles deck management, scoring, dealer AI, input classification, and card narration.

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_NAMES = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace',
};

const SUIT_NAMES = {
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clubs',
  spades: 'Spades',
};

const HIT_WORDS = ['hit', 'hit me', 'card', 'another', 'another card'];
const STAND_WORDS = ['stand', 'stay', 'hold'];

/**
 * Creates a standard 52-card deck (unshuffled).
 */
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Returns a new shuffled copy of the deck (Fisher-Yates).
 * Does not mutate the original.
 */
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Draws the top card from the deck.
 * Returns { card, remainingDeck } without mutating the original.
 */
function drawCard(deck) {
  if (deck.length === 0) {
    throw new Error('Cannot draw from an empty deck');
  }
  const [card, ...remainingDeck] = deck;
  return { card, remainingDeck };
}

/**
 * Scores a hand. Returns { total, soft }.
 * soft=true means an ace is currently counting as 11.
 */
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

  // Demote aces from 11 to 1 as needed
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return { total, soft: aces > 0 };
}

/**
 * Narrates a card for TTS: "Ace of Spades", "7 of Hearts".
 */
function narrateCard(card) {
  return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
}

/**
 * Narrates a full hand with score for TTS.
 */
function narrateHand(hand) {
  const cardNames = hand.map(narrateCard);
  const score = scoreHand(hand);
  if (cardNames.length === 2) {
    return `${cardNames[0]} and ${cardNames[1]}, for ${score.total}`;
  }
  const last = cardNames.pop();
  return `${cardNames.join(', ')}, and ${last}, for ${score.total}`;
}

/**
 * Creates a new game: shuffles deck, deals 2 cards each, returns full state.
 */
function createGame(callSid) {
  let deck = shuffleDeck(createDeck());

  const playerHand = [];
  const dealerHand = [];

  // Deal alternating: player, dealer, player, dealer
  let draw;
  draw = drawCard(deck); playerHand.push(draw.card); deck = draw.remainingDeck;
  draw = drawCard(deck); dealerHand.push(draw.card); deck = draw.remainingDeck;
  draw = drawCard(deck); playerHand.push(draw.card); deck = draw.remainingDeck;
  draw = drawCard(deck); dealerHand.push(draw.card); deck = draw.remainingDeck;

  const playerScore = scoreHand(playerHand);
  const dealerScore = scoreHand(dealerHand);

  const dealDetail = `Player: ${narrateCard(playerHand[0])}, ${narrateCard(playerHand[1])} (${playerScore.total}). Dealer shows: ${narrateCard(dealerHand[0])}`;

  const state = {
    gameId: `bj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    callSid,
    deck,
    playerHand,
    dealerHand,
    dealerHoleRevealed: false,
    status: 'player_turn',
    outcome: null,
    moves: [{ action: 'deal', timestamp: new Date().toISOString(), detail: dealDetail }],
    startTime: new Date().toISOString(),
    endTime: null,
  };

  // Check for natural blackjack on either side
  const playerBJ = playerHand.length === 2 && playerScore.total === 21;
  const dealerBJ = dealerHand.length === 2 && dealerScore.total === 21;

  if (playerBJ || dealerBJ) {
    state.dealerHoleRevealed = true;
    state.status = 'complete';
    state.endTime = new Date().toISOString();
    if (playerBJ && dealerBJ) {
      state.outcome = 'push';
    } else if (playerBJ) {
      state.outcome = 'player_blackjack';
    } else {
      state.outcome = 'dealer_blackjack';
    }
  }

  return state;
}

/**
 * Player hits: draws a card, checks for bust or 21.
 * Returns a new state object (does not mutate original).
 */
function playerHit(game) {
  const { card, remainingDeck } = drawCard(game.deck);
  const newHand = [...game.playerHand, card];
  const score = scoreHand(newHand);

  const move = {
    action: 'hit',
    card,
    timestamp: new Date().toISOString(),
    detail: `Player hits: ${narrateCard(card)} (${score.total})`,
  };

  const newState = {
    ...game,
    deck: remainingDeck,
    playerHand: newHand,
    moves: [...game.moves, move],
  };

  if (score.total > 21) {
    newState.status = 'complete';
    newState.outcome = 'player_bust';
    newState.endTime = new Date().toISOString();
  } else if (score.total === 21) {
    newState.status = 'dealer_turn';
  }

  return newState;
}

/**
 * Dealer plays: hits until 17+, reveals hole card, determines outcome.
 * Returns a new state object (does not mutate original).
 */
function dealerPlay(game) {
  const state = { ...game, dealerHoleRevealed: true, moves: [...game.moves] };
  let deck = [...game.deck];
  let dealerHand = [...game.dealerHand];

  // Record hole card reveal
  state.moves.push({
    action: 'reveal',
    timestamp: new Date().toISOString(),
    detail: `Dealer reveals: ${narrateCard(dealerHand[1])} (${scoreHand(dealerHand).total})`,
  });

  // Dealer hits until 17+
  let score = scoreHand(dealerHand);
  while (score.total < 17) {
    const draw = drawCard(deck);
    dealerHand = [...dealerHand, draw.card];
    deck = draw.remainingDeck;
    score = scoreHand(dealerHand);

    state.moves.push({
      action: 'dealer_hit',
      card: draw.card,
      timestamp: new Date().toISOString(),
      detail: `Dealer hits: ${narrateCard(draw.card)} (${score.total})`,
    });
  }

  state.deck = deck;
  state.dealerHand = dealerHand;
  state.status = 'complete';
  state.endTime = new Date().toISOString();
  state.outcome = determineOutcome({ ...state, playerHand: game.playerHand });

  return state;
}

/**
 * Determines the outcome of a completed game.
 */
function determineOutcome(game) {
  const playerScore = scoreHand(game.playerHand);
  const dealerScore = scoreHand(game.dealerHand);

  const playerBJ = game.playerHand.length === 2 && playerScore.total === 21;
  const dealerBJ = game.dealerHand.length === 2 && dealerScore.total === 21;

  if (playerBJ && dealerBJ) {return 'push';}
  if (playerBJ) {return 'player_blackjack';}
  if (dealerBJ) {return 'dealer_blackjack';}

  if (playerScore.total > 21) {return 'player_bust';}
  if (dealerScore.total > 21) {return 'dealer_bust';}

  if (playerScore.total > dealerScore.total) {return 'player_wins';}
  if (dealerScore.total > playerScore.total) {return 'dealer_wins';}
  return 'push';
}

/**
 * Classifies DTMF digits or speech input into a game action.
 * Returns 'hit', 'stand', or 'unknown'.
 */
function classifyInput(digits, speechResult) {
  if (digits === '1') {return 'hit';}
  if (digits === '2') {return 'stand';}

  if (speechResult) {
    const speech = speechResult.toLowerCase().trim();
    if (HIT_WORDS.some((w) => speech.includes(w))) {return 'hit';}
    if (STAND_WORDS.some((w) => speech.includes(w))) {return 'stand';}
  }

  return 'unknown';
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
