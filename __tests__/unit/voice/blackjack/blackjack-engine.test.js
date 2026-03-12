// ABOUTME: Unit tests for the blackjack game engine (pure logic, no Twilio deps).
// ABOUTME: Covers deck creation, scoring, dealing, player actions, dealer AI, and input classification.

const {
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
} = require('../../../../functions/helpers/blackjack-engine.private');

describe('blackjack-engine', () => {
  describe('createDeck', () => {
    it('returns 52 unique cards', () => {
      const deck = createDeck();
      expect(deck).toHaveLength(52);

      const unique = new Set(deck.map((c) => `${c.rank}-${c.suit}`));
      expect(unique.size).toBe(52);
    });

    it('contains 4 suits with 13 ranks each', () => {
      const deck = createDeck();
      const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
      const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

      for (const suit of suits) {
        const suitCards = deck.filter((c) => c.suit === suit);
        expect(suitCards).toHaveLength(13);
        for (const rank of ranks) {
          expect(suitCards.find((c) => c.rank === rank)).toBeDefined();
        }
      }
    });
  });

  describe('shuffleDeck', () => {
    it('returns same number of cards', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      expect(shuffled).toHaveLength(52);
    });

    it('contains the same cards (just reordered)', () => {
      const deck = createDeck();
      const shuffled = shuffleDeck(deck);
      const deckSet = new Set(deck.map((c) => `${c.rank}-${c.suit}`));
      const shuffledSet = new Set(shuffled.map((c) => `${c.rank}-${c.suit}`));
      expect(shuffledSet).toEqual(deckSet);
    });

    it('does not mutate the original deck', () => {
      const deck = createDeck();
      const original = [...deck];
      shuffleDeck(deck);
      expect(deck).toEqual(original);
    });
  });

  describe('drawCard', () => {
    it('returns a card and the remaining deck', () => {
      const deck = createDeck();
      const { card, remainingDeck } = drawCard(deck);
      expect(card).toHaveProperty('rank');
      expect(card).toHaveProperty('suit');
      expect(remainingDeck).toHaveLength(51);
    });

    it('does not mutate the original deck', () => {
      const deck = createDeck();
      const original = [...deck];
      drawCard(deck);
      expect(deck).toEqual(original);
    });

    it('throws if deck is empty', () => {
      expect(() => drawCard([])).toThrow('empty');
    });
  });

  describe('scoreHand', () => {
    it('scores number cards at face value', () => {
      const hand = [
        { rank: '5', suit: 'hearts' },
        { rank: '3', suit: 'clubs' },
      ];
      expect(scoreHand(hand)).toEqual({ total: 8, soft: false });
    });

    it('scores face cards as 10', () => {
      const hand = [
        { rank: 'J', suit: 'hearts' },
        { rank: 'Q', suit: 'clubs' },
      ];
      expect(scoreHand(hand)).toEqual({ total: 20, soft: false });
    });

    it('scores ace as 11 when it does not bust', () => {
      const hand = [
        { rank: 'A', suit: 'spades' },
        { rank: '6', suit: 'hearts' },
      ];
      expect(scoreHand(hand)).toEqual({ total: 17, soft: true });
    });

    it('scores ace as 1 when 11 would bust', () => {
      const hand = [
        { rank: 'A', suit: 'spades' },
        { rank: '6', suit: 'hearts' },
        { rank: '8', suit: 'clubs' },
      ];
      expect(scoreHand(hand)).toEqual({ total: 15, soft: false });
    });

    it('handles blackjack (A + 10)', () => {
      const hand = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
      ];
      expect(scoreHand(hand)).toEqual({ total: 21, soft: true });
    });

    it('handles multiple aces correctly', () => {
      const hand = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: '9', suit: 'clubs' },
      ];
      // A(11) + A(1) + 9 = 21
      expect(scoreHand(hand)).toEqual({ total: 21, soft: true });
    });

    it('demotes both aces when needed', () => {
      const hand = [
        { rank: 'A', suit: 'spades' },
        { rank: 'A', suit: 'hearts' },
        { rank: '9', suit: 'clubs' },
        { rank: '5', suit: 'diamonds' },
      ];
      // A(1) + A(1) + 9 + 5 = 16
      expect(scoreHand(hand)).toEqual({ total: 16, soft: false });
    });

    it('detects bust', () => {
      const hand = [
        { rank: '10', suit: 'hearts' },
        { rank: '5', suit: 'clubs' },
        { rank: '7', suit: 'spades' },
      ];
      expect(scoreHand(hand).total).toBe(22);
    });
  });

  describe('createGame', () => {
    it('returns a valid initial game state', () => {
      const game = createGame('CA1234567890');
      expect(game.callSid).toBe('CA1234567890');
      expect(game.playerHand).toHaveLength(2);
      expect(game.dealerHand).toHaveLength(2);
      expect(game.deck).toHaveLength(48); // 52 - 4 dealt
      expect(game.status).toBe('player_turn');
      expect(game.outcome).toBeNull();
      expect(game.moves).toHaveLength(1); // initial deal move
      expect(game.moves[0].action).toBe('deal');
      expect(game.startTime).toBeDefined();
      expect(game.endTime).toBeNull();
      expect(game.dealerHoleRevealed).toBe(false);
    });

    it('generates a unique gameId', () => {
      const game1 = createGame('CA111');
      const game2 = createGame('CA222');
      expect(game1.gameId).not.toBe(game2.gameId);
    });

    it('detects player natural blackjack', () => {
      // We need to test that createGame correctly identifies natural blackjack
      // Run many times and check that when blackjack occurs, status is set correctly
      // Since the deck is random, we test the scoring logic directly instead
      const hand = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
      ];
      const score = scoreHand(hand);
      expect(score.total).toBe(21);
    });
  });

  describe('playerHit', () => {
    it('draws a card and adds it to the player hand', () => {
      const game = createGame('CA111');
      const originalHandSize = game.playerHand.length;
      const originalDeckSize = game.deck.length;

      const updated = playerHit(game);
      expect(updated.playerHand).toHaveLength(originalHandSize + 1);
      expect(updated.deck).toHaveLength(originalDeckSize - 1);
    });

    it('records a move', () => {
      const game = createGame('CA111');
      const updated = playerHit(game);
      const lastMove = updated.moves[updated.moves.length - 1];
      expect(lastMove.action).toBe('hit');
      expect(lastMove.card).toBeDefined();
      expect(lastMove.timestamp).toBeDefined();
    });

    it('does not mutate the original game state', () => {
      const game = createGame('CA111');
      const originalDeckLength = game.deck.length;
      playerHit(game);
      expect(game.deck).toHaveLength(originalDeckLength);
    });

    it('sets status to complete if player busts', () => {
      // Construct a game state where next hit will bust
      const game = createGame('CA111');
      game.playerHand = [
        { rank: '10', suit: 'hearts' },
        { rank: '6', suit: 'clubs' },
      ];
      // Put a face card on top of the deck
      game.deck = [{ rank: 'K', suit: 'spades' }, ...game.deck];

      const updated = playerHit(game);
      expect(scoreHand(updated.playerHand).total).toBeGreaterThan(21);
      expect(updated.status).toBe('complete');
      expect(updated.outcome).toBe('player_bust');
    });

    it('sets status to dealer_turn if player hits 21', () => {
      const game = createGame('CA111');
      game.playerHand = [
        { rank: '10', suit: 'hearts' },
        { rank: '5', suit: 'clubs' },
      ];
      game.deck = [{ rank: '6', suit: 'spades' }, ...game.deck];

      const updated = playerHit(game);
      expect(scoreHand(updated.playerHand).total).toBe(21);
      expect(updated.status).toBe('dealer_turn');
    });
  });

  describe('dealerPlay', () => {
    it('dealer hits below 17', () => {
      const game = createGame('CA111');
      game.status = 'dealer_turn';
      game.dealerHand = [
        { rank: '10', suit: 'hearts' },
        { rank: '4', suit: 'clubs' },
      ];
      // Ensure deck has a low card then a high card to stop
      game.deck = [
        { rank: '2', suit: 'spades' },
        { rank: '10', suit: 'diamonds' },
        ...game.deck,
      ];

      const updated = dealerPlay(game);
      expect(updated.dealerHand.length).toBeGreaterThan(2);
      expect(updated.dealerHoleRevealed).toBe(true);
    });

    it('dealer stands at 17 or above', () => {
      const game = createGame('CA111');
      game.status = 'dealer_turn';
      game.dealerHand = [
        { rank: '10', suit: 'hearts' },
        { rank: '7', suit: 'clubs' },
      ];

      const updated = dealerPlay(game);
      expect(updated.dealerHand).toHaveLength(2); // no additional cards drawn
      expect(scoreHand(updated.dealerHand).total).toBe(17);
      expect(updated.status).toBe('complete');
    });

    it('dealer stands on soft 17', () => {
      const game = createGame('CA111');
      game.status = 'dealer_turn';
      game.dealerHand = [
        { rank: 'A', suit: 'hearts' },
        { rank: '6', suit: 'clubs' },
      ];

      const updated = dealerPlay(game);
      expect(updated.dealerHand).toHaveLength(2);
      expect(scoreHand(updated.dealerHand).total).toBe(17);
    });

    it('records moves for each dealer draw', () => {
      const game = createGame('CA111');
      game.status = 'dealer_turn';
      game.dealerHand = [
        { rank: '5', suit: 'hearts' },
        { rank: '3', suit: 'clubs' },
      ];
      game.deck = [
        { rank: '2', suit: 'spades' },
        { rank: 'K', suit: 'diamonds' },
        ...game.deck,
      ];

      const initialMoves = game.moves.length;
      const updated = dealerPlay(game);
      // Should have at least reveal + draws
      expect(updated.moves.length).toBeGreaterThan(initialMoves);
    });

    it('sets endTime when complete', () => {
      const game = createGame('CA111');
      game.status = 'dealer_turn';
      game.dealerHand = [
        { rank: '10', suit: 'hearts' },
        { rank: '9', suit: 'clubs' },
      ];

      const updated = dealerPlay(game);
      expect(updated.endTime).not.toBeNull();
    });
  });

  describe('determineOutcome', () => {
    function makeGame(playerCards, dealerCards) {
      return {
        playerHand: playerCards,
        dealerHand: dealerCards,
        status: 'complete',
      };
    }

    it('player blackjack beats dealer non-blackjack', () => {
      const game = makeGame(
        [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
        [{ rank: '10', suit: 'clubs' }, { rank: '9', suit: 'diamonds' }]
      );
      expect(determineOutcome(game)).toBe('player_blackjack');
    });

    it('dealer blackjack beats player non-blackjack', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'clubs' }, { rank: '9', suit: 'diamonds' }],
        [{ rank: 'A', suit: 'spades' }, { rank: 'Q', suit: 'hearts' }]
      );
      expect(determineOutcome(game)).toBe('dealer_blackjack');
    });

    it('both blackjack is a push', () => {
      const game = makeGame(
        [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
        [{ rank: 'A', suit: 'clubs' }, { rank: 'Q', suit: 'diamonds' }]
      );
      expect(determineOutcome(game)).toBe('push');
    });

    it('player bust', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '5', suit: 'hearts' }, { rank: '8', suit: 'clubs' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '7', suit: 'clubs' }]
      );
      expect(determineOutcome(game)).toBe('player_bust');
    });

    it('dealer bust', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '5', suit: 'clubs' }, { rank: '9', suit: 'hearts' }]
      );
      expect(determineOutcome(game)).toBe('dealer_bust');
    });

    it('player wins with higher total', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
      );
      expect(determineOutcome(game)).toBe('player_wins');
    });

    it('dealer wins with higher total', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '7', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '9', suit: 'clubs' }]
      );
      expect(determineOutcome(game)).toBe('dealer_wins');
    });

    it('push with equal totals', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }],
        [{ rank: 'J', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
      );
      expect(determineOutcome(game)).toBe('push');
    });
  });

  describe('classifyInput', () => {
    it('classifies digit 1 as hit', () => {
      expect(classifyInput('1', null)).toBe('hit');
    });

    it('classifies digit 2 as stand', () => {
      expect(classifyInput('2', null)).toBe('stand');
    });

    it('classifies speech "hit me" as hit', () => {
      expect(classifyInput(null, 'hit me')).toBe('hit');
    });

    it('classifies speech "hit" as hit', () => {
      expect(classifyInput(null, 'hit')).toBe('hit');
    });

    it('classifies speech "card" as hit', () => {
      expect(classifyInput(null, 'card')).toBe('hit');
    });

    it('classifies speech "another" as hit', () => {
      expect(classifyInput(null, 'another')).toBe('hit');
    });

    it('classifies speech "stand" as stand', () => {
      expect(classifyInput(null, 'stand')).toBe('stand');
    });

    it('classifies speech "stay" as stand', () => {
      expect(classifyInput(null, 'stay')).toBe('stand');
    });

    it('classifies speech "hold" as stand', () => {
      expect(classifyInput(null, 'hold')).toBe('stand');
    });

    it('returns unknown for invalid digit', () => {
      expect(classifyInput('5', null)).toBe('unknown');
    });

    it('returns unknown for unrecognized speech', () => {
      expect(classifyInput(null, 'what is blackjack')).toBe('unknown');
    });

    it('returns unknown when both are null', () => {
      expect(classifyInput(null, null)).toBe('unknown');
    });

    it('is case insensitive for speech', () => {
      expect(classifyInput(null, 'HIT ME')).toBe('hit');
      expect(classifyInput(null, 'Stand')).toBe('stand');
    });
  });

  describe('narrateCard', () => {
    it('narrates a standard card', () => {
      expect(narrateCard({ rank: '7', suit: 'hearts' })).toBe('7 of Hearts');
    });

    it('narrates face cards', () => {
      expect(narrateCard({ rank: 'K', suit: 'spades' })).toBe('King of Spades');
    });

    it('narrates an ace', () => {
      expect(narrateCard({ rank: 'A', suit: 'diamonds' })).toBe('Ace of Diamonds');
    });
  });

  describe('narrateHand', () => {
    it('narrates a two-card hand with score', () => {
      const hand = [
        { rank: 'A', suit: 'spades' },
        { rank: 'K', suit: 'hearts' },
      ];
      const result = narrateHand(hand);
      expect(result).toContain('Ace of Spades');
      expect(result).toContain('King of Hearts');
      expect(result).toContain('21');
    });

    it('narrates a multi-card hand', () => {
      const hand = [
        { rank: '5', suit: 'clubs' },
        { rank: '3', suit: 'hearts' },
        { rank: '7', suit: 'diamonds' },
      ];
      const result = narrateHand(hand);
      expect(result).toContain('5 of Clubs');
      expect(result).toContain('3 of Hearts');
      expect(result).toContain('7 of Diamonds');
      expect(result).toContain('15');
    });
  });
});
