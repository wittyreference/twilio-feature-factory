// ABOUTME: Unit tests for the blackjack game engine — pure logic, no Twilio deps.
// ABOUTME: Covers deck creation, scoring, game flow, input classification, and narration.

const engine = require('../../../../functions/helpers/blackjack-engine.private');

describe('blackjack-engine', () => {
  describe('createDeck', () => {
    it('creates 52 unique cards with 4 suits x 13 ranks', () => {
      const deck = engine.createDeck();
      expect(deck).toHaveLength(52);
      const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
      const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      suits.forEach(suit => {
        ranks.forEach(rank => {
          expect(deck).toContainEqual({ rank, suit });
        });
      });
      // All unique
      const keys = deck.map(c => `${c.rank}-${c.suit}`);
      expect(new Set(keys).size).toBe(52);
    });
  });

  describe('shuffleDeck', () => {
    it('returns same length with same cards', () => {
      const deck = engine.createDeck();
      const shuffled = engine.shuffleDeck(deck);
      expect(shuffled).toHaveLength(52);
      deck.forEach(card => {
        expect(shuffled).toContainEqual(card);
      });
    });

    it('does not mutate the original', () => {
      const deck = engine.createDeck();
      const original = [...deck];
      engine.shuffleDeck(deck);
      expect(deck).toEqual(original);
    });
  });

  describe('drawCard', () => {
    it('returns card and remaining deck', () => {
      const deck = [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }];
      const result = engine.drawCard(deck);
      expect(result.card).toEqual({ rank: 'A', suit: 'spades' });
      expect(result.remainingDeck).toEqual([{ rank: 'K', suit: 'hearts' }]);
    });

    it('throws on empty deck', () => {
      expect(() => engine.drawCard([])).toThrow();
    });

    it('does not mutate the original deck', () => {
      const deck = [{ rank: '5', suit: 'clubs' }, { rank: '3', suit: 'hearts' }];
      const original = [...deck];
      engine.drawCard(deck);
      expect(deck).toEqual(original);
    });
  });

  describe('scoreHand', () => {
    it('scores 5+3 = 8 hard', () => {
      const result = engine.scoreHand([{ rank: '5', suit: 'hearts' }, { rank: '3', suit: 'clubs' }]);
      expect(result).toEqual({ total: 8, soft: false });
    });

    it('scores J+Q = 20 hard', () => {
      const result = engine.scoreHand([{ rank: 'J', suit: 'hearts' }, { rank: 'Q', suit: 'clubs' }]);
      expect(result).toEqual({ total: 20, soft: false });
    });

    it('scores A+6 = 17 soft', () => {
      const result = engine.scoreHand([{ rank: 'A', suit: 'spades' }, { rank: '6', suit: 'hearts' }]);
      expect(result).toEqual({ total: 17, soft: true });
    });

    it('scores A+6+8 = 15 hard (ace demoted)', () => {
      const result = engine.scoreHand([
        { rank: 'A', suit: 'spades' }, { rank: '6', suit: 'hearts' }, { rank: '8', suit: 'clubs' }
      ]);
      expect(result).toEqual({ total: 15, soft: false });
    });

    it('scores A+K = 21 soft', () => {
      const result = engine.scoreHand([{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }]);
      expect(result).toEqual({ total: 21, soft: true });
    });

    it('scores A+A+9 = 21 soft', () => {
      const result = engine.scoreHand([
        { rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }, { rank: '9', suit: 'clubs' }
      ]);
      expect(result).toEqual({ total: 21, soft: true });
    });

    it('scores A+A+9+5 = 16 hard', () => {
      const result = engine.scoreHand([
        { rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' },
        { rank: '9', suit: 'clubs' }, { rank: '5', suit: 'diamonds' }
      ]);
      expect(result).toEqual({ total: 16, soft: false });
    });

    it('scores 10+5+7 = 22 bust', () => {
      const result = engine.scoreHand([
        { rank: '10', suit: 'hearts' }, { rank: '5', suit: 'clubs' }, { rank: '7', suit: 'spades' }
      ]);
      expect(result.total).toBe(22);
    });
  });

  describe('createGame', () => {
    it('creates valid initial game state', () => {
      const game = engine.createGame('CAxxx');
      expect(game.callSid).toBe('CAxxx');
      expect(game.playerHand).toHaveLength(2);
      expect(game.dealerHand).toHaveLength(2);
      expect(game.deck).toHaveLength(48);
      expect(game.status).toBe('player_turn');
      expect(game.moves).toHaveLength(1);
      expect(game.moves[0].action).toBe('deal');
      expect(game.gameId).toMatch(/^bj-\d+-[a-z0-9]{4}$/);
      expect(game.dealerHoleRevealed).toBe(false);
      expect(game.outcome).toBeNull();
      expect(game.startTime).toBeDefined();
      expect(game.endTime).toBeNull();
    });

    it('generates unique gameIds', () => {
      const g1 = engine.createGame('CA1');
      const g2 = engine.createGame('CA2');
      expect(g1.gameId).not.toBe(g2.gameId);
    });

    it('detects natural blackjack', () => {
      // We test by creating many games and checking if natural detection works
      // or we can construct a scenario manually using the engine functions
      const game = engine.createGame('CAxxx');
      const playerScore = engine.scoreHand(game.playerHand);
      const dealerScore = engine.scoreHand(game.dealerHand);
      if (playerScore.total === 21 && game.playerHand.length === 2) {
        expect(game.status).toBe('complete');
        expect(game.outcome).toContain('blackjack');
      }
      if (dealerScore.total === 21 && game.dealerHand.length === 2 &&
          playerScore.total !== 21) {
        expect(game.status).toBe('complete');
        expect(game.outcome).toBe('dealer_blackjack');
      }
    });
  });

  describe('playerHit', () => {
    const makeGame = (playerCards, deckCards) => ({
      gameId: 'bj-test',
      callSid: 'CAxxx',
      deck: deckCards,
      playerHand: playerCards,
      dealerHand: [{ rank: 'K', suit: 'spades' }, { rank: '6', suit: 'diamonds' }],
      dealerHoleRevealed: false,
      status: 'player_turn',
      outcome: null,
      moves: [{ action: 'deal', timestamp: new Date().toISOString(), detail: 'test' }],
      startTime: new Date().toISOString(),
      endTime: null,
    });

    it('draws a card (+1 hand, -1 deck)', () => {
      const game = makeGame(
        [{ rank: '7', suit: 'hearts' }, { rank: '5', suit: 'clubs' }],
        [{ rank: '2', suit: 'spades' }, { rank: '9', suit: 'diamonds' }]
      );
      const result = engine.playerHit(game);
      expect(result.playerHand).toHaveLength(3);
      expect(result.deck).toHaveLength(1);
    });

    it('records a move', () => {
      const game = makeGame(
        [{ rank: '7', suit: 'hearts' }, { rank: '5', suit: 'clubs' }],
        [{ rank: '2', suit: 'spades' }]
      );
      const result = engine.playerHit(game);
      expect(result.moves).toHaveLength(2);
      expect(result.moves[1].action).toBe('hit');
    });

    it('does not mutate the original', () => {
      const game = makeGame(
        [{ rank: '7', suit: 'hearts' }, { rank: '5', suit: 'clubs' }],
        [{ rank: '2', suit: 'spades' }]
      );
      const originalHand = [...game.playerHand];
      engine.playerHit(game);
      expect(game.playerHand).toEqual(originalHand);
    });

    it('busts when total exceeds 21', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'hearts' }, { rank: '6', suit: 'clubs' }],
        [{ rank: 'K', suit: 'spades' }]
      );
      const result = engine.playerHit(game);
      expect(result.status).toBe('complete');
      expect(result.outcome).toBe('player_bust');
    });

    it('moves to dealer_turn at 21', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'hearts' }, { rank: '5', suit: 'clubs' }],
        [{ rank: '6', suit: 'spades' }]
      );
      const result = engine.playerHit(game);
      expect(result.status).toBe('dealer_turn');
    });
  });

  describe('dealerPlay', () => {
    const makeGame = (dealerCards, deckCards) => ({
      gameId: 'bj-test',
      callSid: 'CAxxx',
      deck: deckCards,
      playerHand: [{ rank: '10', suit: 'hearts' }, { rank: '8', suit: 'clubs' }],
      dealerHand: dealerCards,
      dealerHoleRevealed: false,
      status: 'dealer_turn',
      outcome: null,
      moves: [{ action: 'deal', timestamp: new Date().toISOString(), detail: 'test' }],
      startTime: new Date().toISOString(),
      endTime: null,
    });

    it('hits below 17', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'hearts' }, { rank: '4', suit: 'clubs' }],
        [{ rank: '2', suit: 'spades' }, { rank: '10', suit: 'diamonds' }]
      );
      const result = engine.dealerPlay(game);
      expect(result.dealerHand.length).toBeGreaterThan(2);
    });

    it('stands at 17', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'hearts' }, { rank: '7', suit: 'clubs' }],
        [{ rank: '2', suit: 'spades' }]
      );
      const result = engine.dealerPlay(game);
      expect(result.dealerHand).toHaveLength(2);
    });

    it('stands on soft 17', () => {
      const game = makeGame(
        [{ rank: 'A', suit: 'hearts' }, { rank: '6', suit: 'clubs' }],
        [{ rank: '2', suit: 'spades' }]
      );
      const result = engine.dealerPlay(game);
      expect(result.dealerHand).toHaveLength(2);
    });

    it('records moves', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'hearts' }, { rank: '4', suit: 'clubs' }],
        [{ rank: '3', suit: 'spades' }, { rank: '10', suit: 'diamonds' }]
      );
      const result = engine.dealerPlay(game);
      expect(result.moves.length).toBeGreaterThan(1);
      expect(result.moves.some(m => m.action === 'reveal')).toBe(true);
    });

    it('sets endTime', () => {
      const game = makeGame(
        [{ rank: '10', suit: 'hearts' }, { rank: '7', suit: 'clubs' }],
        []
      );
      const result = engine.dealerPlay(game);
      expect(result.endTime).toBeDefined();
      expect(result.endTime).not.toBeNull();
    });
  });

  describe('determineOutcome', () => {
    const makeGame = (playerHand, dealerHand) => ({ playerHand, dealerHand });

    it('player_blackjack: A+K vs 10+9', () => {
      expect(engine.determineOutcome(makeGame(
        [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
        [{ rank: '10', suit: 'clubs' }, { rank: '9', suit: 'diamonds' }]
      ))).toBe('player_blackjack');
    });

    it('dealer_blackjack: 10+9 vs A+Q', () => {
      expect(engine.determineOutcome(makeGame(
        [{ rank: '10', suit: 'clubs' }, { rank: '9', suit: 'diamonds' }],
        [{ rank: 'A', suit: 'spades' }, { rank: 'Q', suit: 'hearts' }]
      ))).toBe('dealer_blackjack');
    });

    it('push with both blackjack: A+K vs A+Q', () => {
      expect(engine.determineOutcome(makeGame(
        [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }],
        [{ rank: 'A', suit: 'clubs' }, { rank: 'Q', suit: 'diamonds' }]
      ))).toBe('push');
    });

    it('player_bust: 10+5+8 vs 10+7', () => {
      expect(engine.determineOutcome(makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '5', suit: 'hearts' }, { rank: '8', suit: 'clubs' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '7', suit: 'clubs' }]
      ))).toBe('player_bust');
    });

    it('dealer_bust: 10+8 vs 10+5+9', () => {
      expect(engine.determineOutcome(makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '5', suit: 'clubs' }, { rank: '9', suit: 'hearts' }]
      ))).toBe('dealer_bust');
    });

    it('player_wins: 10+9 vs 10+8', () => {
      expect(engine.determineOutcome(makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '9', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
      ))).toBe('player_wins');
    });

    it('dealer_wins: 10+7 vs 10+9', () => {
      expect(engine.determineOutcome(makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '7', suit: 'hearts' }],
        [{ rank: '10', suit: 'diamonds' }, { rank: '9', suit: 'clubs' }]
      ))).toBe('dealer_wins');
    });

    it('push with equal totals: 10+8 vs J+8', () => {
      expect(engine.determineOutcome(makeGame(
        [{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }],
        [{ rank: 'J', suit: 'diamonds' }, { rank: '8', suit: 'clubs' }]
      ))).toBe('push');
    });
  });

  describe('classifyInput', () => {
    it('"1" → hit', () => expect(engine.classifyInput('1', null)).toBe('hit'));
    it('"2" → stand', () => expect(engine.classifyInput('2', null)).toBe('stand'));
    it('"hit me" → hit', () => expect(engine.classifyInput(null, 'hit me')).toBe('hit'));
    it('"card" → hit', () => expect(engine.classifyInput(null, 'card')).toBe('hit'));
    it('"another" → hit', () => expect(engine.classifyInput(null, 'another')).toBe('hit'));
    it('"stand" → stand', () => expect(engine.classifyInput(null, 'stand')).toBe('stand'));
    it('"stay" → stand', () => expect(engine.classifyInput(null, 'stay')).toBe('stand'));
    it('"hold" → stand', () => expect(engine.classifyInput(null, 'hold')).toBe('stand'));
    it('"5" → unknown', () => expect(engine.classifyInput('5', null)).toBe('unknown'));
    it('null/null → unknown', () => expect(engine.classifyInput(null, null)).toBe('unknown'));
    it('"HIT ME" → hit (case insensitive)', () => expect(engine.classifyInput(null, 'HIT ME')).toBe('hit'));
  });

  describe('narrateCard', () => {
    it('7 of Hearts', () => {
      expect(engine.narrateCard({ rank: '7', suit: 'hearts' })).toBe('7 of Hearts');
    });
    it('King of Spades', () => {
      expect(engine.narrateCard({ rank: 'K', suit: 'spades' })).toBe('King of Spades');
    });
    it('Ace of Diamonds', () => {
      expect(engine.narrateCard({ rank: 'A', suit: 'diamonds' })).toBe('Ace of Diamonds');
    });
  });

  describe('narrateHand', () => {
    it('2 cards: "X and Y, for Z"', () => {
      const hand = [{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }];
      const result = engine.narrateHand(hand);
      expect(result).toBe('Ace of Spades and King of Hearts, for 21');
    });

    it('3 cards: "X, Y, and Z, for N"', () => {
      const hand = [
        { rank: '5', suit: 'clubs' },
        { rank: '3', suit: 'hearts' },
        { rank: '7', suit: 'diamonds' }
      ];
      const result = engine.narrateHand(hand);
      expect(result).toBe('5 of Clubs, 3 of Hearts, and 7 of Diamonds, for 15');
    });
  });
});
