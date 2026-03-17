# Blackjack Demo — Build Instructions

> **TDD build. For each module: write the test file FIRST, then the implementation.** Do not plan. Do not explore the codebase. Do not use /plan, /architect, /orchestrate, or any slash commands. Start writing files immediately. Do not stop between modules. One `git commit` at the end after all tests pass. All code files must start with a 2-line `// ABOUTME:` comment.

Build a phone-based blackjack game demonstrating Voice, Sync, Voice SDK, and TTS. A caller plays via DTMF or speech, game state updates in real-time in a terminal, and post-game summaries come from Claude reading the Sync document.

## Architecture

TwiML + Gather redirect chain. DTMF is primary input; speech is secondary. Game state persisted in Twilio Sync Documents with TTL 86400.

## Call Flow

```
Browser (Voice SDK) → sdk-handler.js → game:blackjack routing
    → blackjack/welcome.js (deal, announce, gather)
    → blackjack/action.protected.js (hit/stand loop)
    → blackjack/dealer-turn.protected.js (dealer plays, narrates)
    → blackjack/game-over.protected.js (result, replay option)
```

## File Structure

| File | Purpose |
|------|---------|
| `functions/helpers/blackjack-engine.private.js` | Pure game logic, zero Twilio deps |
| `functions/helpers/blackjack-sync.private.js` | Sync CRUD helper (update-first pattern) |
| `functions/voice/blackjack/welcome.js` | Entry: deal, announce, gather |
| `functions/voice/blackjack/action.protected.js` | Hit/stand loop |
| `functions/voice/blackjack/dealer-turn.protected.js` | Dealer plays, narrates |
| `functions/voice/blackjack/game-over.protected.js` | Results, replay |
| `assets/blackjack-client.html` | Casino-themed browser softphone |
| `scripts/blackjack-server.js` | Local Express server (port 3335) |
| `scripts/blackjack-tail.js` | Terminal game state viewer |

## Twilio Serverless Patterns

Follow these exactly — they are the #1 source of bugs:

- **TwiML**: `new Twilio.twiml.VoiceResponse()` — use the global `Twilio` object. Do NOT `require('twilio')`.
- **Load helpers**: `const engine = require(Runtime.getFunctions()['helpers/blackjack-engine'].path)`
- **Handler**: `exports.handler = async (context, event, callback) => { ... }` — return via `callback(null, twiml)`.
- **Client**: `context.getTwilioClient()` — don't construct your own.
- **Voice**: All functions use `{ voice: 'Polly.Amy-Generative' }` (British female).

## Game Engine: `functions/helpers/blackjack-engine.private.js`

Pure logic, zero Twilio deps. Export these functions:

- `createDeck()` — 52 cards. Shape: `{ rank: '2'-'10'|'J'|'Q'|'K'|'A', suit: 'hearts'|'diamonds'|'clubs'|'spades' }`
- `shuffleDeck(deck)` — Fisher-Yates. Returns NEW array, does NOT mutate.
- `drawCard(deck)` — Returns `{ card, remainingDeck }`. Throws if empty. Does NOT mutate.
- `scoreHand(hand)` — Returns `{ total, soft }`. Aces = 11, demote to 1 if bust. `soft=true` when an ace counts as 11.
- `createGame(callSid)` — Shuffle, deal 2 each (alternating), detect natural blackjack. GameId: `bj-${Date.now()}-${random4chars}`.
- `playerHit(game)` — Draw card. Bust (>21) → `status='complete', outcome='player_bust'`. 21 → `status='dealer_turn'`. Returns NEW state.
- `dealerPlay(game)` — Hit until 17+, stand on soft 17. Record reveal + each dealer_hit move. Set `status='complete'`, determine outcome. Returns NEW state.
- `determineOutcome(game)` — Returns: `'player_blackjack'|'dealer_blackjack'|'player_bust'|'dealer_bust'|'player_wins'|'dealer_wins'|'push'`. Blackjack = exactly 2 cards totaling 21.
- `classifyInput(digits, speechResult)` — `'1'`→hit, `'2'`→stand. Speech: hit/hit me/card/another→hit, stand/stay/hold→stand. Case insensitive. Returns `'hit'|'stand'|'unknown'`.
- `narrateCard(card)` — `"Ace of Spades"`, `"10 of Hearts"`.
- `narrateHand(hand)` — `"Ace of Spades and King of Hearts, for 21"` (2 cards) or `"5 of Clubs, 3 of Hearts, and 7 of Diamonds, for 15"` (3+).

All functions return NEW objects — never mutate the input.

## Sync Helper: `functions/helpers/blackjack-sync.private.js`

CRITICAL: Use update-first pattern in `createGameDoc`. Do NOT try create-first with 54302 catch — the error code is unreliable.

- `createGameDoc(client, syncSid, callSid, gameState)` — Try update first. If 20404, create with TTL 86400. Return null if syncSid is falsy.
- `fetchGameDoc(client, syncSid, callSid)` — Return `doc.data` or null on 20404.
- `updateGameDoc(client, syncSid, callSid, gameState)` — Straight update. Return null if syncSid is falsy.

Document naming: `blackjack-{callSid}`. All functions skip gracefully if syncSid is not set.

## Game State Schema

```json
{
  "gameId": "bj-1710000000000-a1b2",
  "callSid": "CAxxx",
  "deck": [{"rank": "5", "suit": "clubs"}],
  "playerHand": [{"rank": "Q", "suit": "clubs"}, {"rank": "A", "suit": "hearts"}],
  "dealerHand": [{"rank": "K", "suit": "diamonds"}, {"rank": "7", "suit": "clubs"}],
  "dealerHoleRevealed": false,
  "status": "player_turn|dealer_turn|complete",
  "outcome": null,
  "moves": [{"action": "deal", "timestamp": "...", "detail": "Player: Q♣ A♥ (21). Dealer shows: K♦"}],
  "startTime": "...",
  "endTime": null
}
```

## Voice Functions

Each loads both helpers via `Runtime.getFunctions()`. Each uses `context.getTwilioClient()` and `context.TWILIO_SYNC_SERVICE_SID`.

### `welcome.js` (Public)
- Create game via `engine.createGame(event.CallSid)`, save to Sync
- Natural blackjack → announce + `<Redirect>` to game-over
- Normal → `<Gather input="dtmf speech" numDigits="1" timeout="5" speechTimeout="auto" action="/voice/blackjack/action" hints="hit, hit me, card, another, stand, stay, hold">` with card narration inside
- No-input fallback after Gather

### `action.protected.js` (Protected)
- Fetch game from Sync. Not found → redirect to welcome.
- Classify input. Unknown → re-gather with "Sorry, I did not understand"
- Stand → update Sync, redirect to `/voice/blackjack/dealer-turn`
- Hit → `engine.playerHit(game)`, update Sync. Bust → redirect game-over. 21 → redirect dealer-turn. Else → re-gather.

### `dealer-turn.protected.js` (Protected)
- Fetch game. Run `engine.dealerPlay(game)`. Update Sync.
- Narrate hole card reveal. Narrate each dealer draw with `<Pause length="1">` between.
- `<Redirect>` to `/voice/blackjack/game-over`

### `game-over.protected.js` (Protected)
Has its OWN replay speech classification — do NOT reuse `classifyInput`:
- Replay words: deal, play again, yes, again, new hand, another
- Quit words: quit, no, stop, goodbye, bye
- Digit 1 = replay → redirect to welcome. Digit 2 = quit → goodbye.
- Outcome messages for all 7 outcomes. Replay gather: `timeout="4"`, `hints="deal, play again, yes, quit, no"`.

## SDK Handler Modification

Add between the `client:` and fallback `else` blocks in `functions/voice/sdk-handler.js`:

```javascript
} else if (to.startsWith('game:')) {
  twiml.redirect('/voice/blackjack/welcome');
}
```

## Browser Client: `assets/blackjack-client.html`

Casino theme. Voice SDK 2.x loaded from `/sdk/twilio.min.js`.

**Visual**: Dark green felt (`#1a472a`), gold title (`#ffd700`), felt card area (`#2d5a3d`) with inset shadow. Pill status bar (red=offline, yellow=connecting, green=ready). HIT button blue (`#1864ab`), STAND purple (`#862e9c`) with hover scale. Call button green→red on connect. Event log: dark terminal (`#0d1f13`), monospace, green text (`#69db7c`).

**Functionality**: "Call Dealer" → `device.connect({ params: { To: 'game:blackjack' } })`. HIT → `activeCall.sendDigits('1')`. STAND → `activeCall.sendDigits('2')`. Keyboard: 1/h = hit, 2/s = stand. Token fetch from `/api/token?identity=blackjack-player`. Status bar, identity, call SID, event log.

## Local Server: `scripts/blackjack-server.js`

Express on port 3335. `GET /` → `assets/blackjack-client.html`. `GET /sdk/twilio.min.js` → `node_modules/@twilio/voice-sdk/dist/twilio.min.js`. `GET /api/token` → Access Token with VoiceGrant using `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`, `TWILIO_VOICE_SDK_APP_SID`. Needs `express`, `dotenv`, `twilio` (all already installed).

## Log Tail: `scripts/blackjack-tail.js`

Polls Sync REST API every 500ms. Colored card art with Unicode suits (red for hearts/diamonds). Color-coded scores (green=21, red=bust, yellow=soft). Move log with timestamps. Auto-discovers most recent `blackjack-*` doc, or accepts `--call-sid=CAxxx`. Needs `twilio` and `dotenv` (already installed).

---

## TDD Specifications

Tests go in `__tests__/unit/voice/blackjack/`. `jest.setup.js` provides `global.createTestContext()`, `global.createTestEvent(params)`, and `global.createTestCallback()`.

### blackjack-engine.test.js

No mocks needed — pure logic.

- `createDeck`: 52 unique cards, 4 suits × 13 ranks
- `shuffleDeck`: same length, same cards, doesn't mutate original
- `drawCard`: returns `{card, remainingDeck}`, throws on empty, doesn't mutate
- `scoreHand`: `[5♥,3♣]=8/hard`, `[J♥,Q♣]=20/hard`, `[A♠,6♥]=17/soft`, `[A♠,6♥,8♣]=15/hard`, `[A♠,K♥]=21/soft`, `[A♠,A♥,9♣]=21/soft`, `[A♠,A♥,9♣,5♦]=16/hard`, `[10♥,5♣,7♠]=22/bust`
- `createGame`: valid state (2 cards each, 48 deck, status=player_turn, 1 deal move), unique gameId, natural blackjack detection
- `playerHit`: draws card (+1 hand, -1 deck), records move, doesn't mutate, bust (10♥+6♣ draw K♠ → complete/player_bust), 21 (10♥+5♣ draw 6♠ → dealer_turn)
- `dealerPlay`: hits below 17 (10♥+4♣, deck=[2♠,10♦,...] → >2 cards), stands at 17 (10♥+7♣ → 2 cards), stands soft 17 (A♥+6♣ → 2 cards), records moves, sets endTime
- `determineOutcome`: player_blackjack (A♠K♥ vs 10♣9♦), dealer_blackjack (10♣9♦ vs A♠Q♥), push-both-bj (A♠K♥ vs A♣Q♦), player_bust (10♠5♥8♣ vs 10♦7♣), dealer_bust (10♠8♥ vs 10♦5♣9♥), player_wins (10♠9♥ vs 10♦8♣), dealer_wins (10♠7♥ vs 10♦9♣), push-equal (10♠8♥ vs J♦8♣)
- `classifyInput`: '1'→hit, '2'→stand, 'hit me'→hit, 'card'→hit, 'another'→hit, 'stand'→stand, 'stay'→stand, 'hold'→stand, '5'→unknown, null/null→unknown, 'HIT ME'→hit (case insensitive)
- `narrateCard`: "7 of Hearts", "King of Spades", "Ace of Diamonds"
- `narrateHand`: 2-card "X and Y, for Z" with score, 3-card "X, Y, and Z, for N"

### blackjack-sync.test.js

Build a `makeMockClient({fetchData, fetchError, createError})` helper returning `{client, mockCreate, mockFetch, mockUpdate, documentsChain}` with jest.fn() chains for `client.sync.v1.services(sid).documents(name).update/fetch` and `documents.create`.

- `createGameDoc`: update succeeds → no create called; 20404 on update → falls back to create with `{uniqueName: 'blackjack-CAxxx', data: gameState, ttl: 86400}`; null syncSid → returns null; unexpected error → throws
- `fetchGameDoc`: returns doc.data; null syncSid → null; 20404 → null; unexpected error → throws
- `updateGameDoc`: calls update with `{data: gameState}`; null syncSid → null

### Voice Function Test Boilerplate

Each voice test file needs this at top:

```javascript
const Twilio = require('twilio');
const path = require('path');
global.Twilio = Twilio;
global.Runtime = {
  getFunctions: () => ({
    'helpers/blackjack-engine': { path: path.resolve(__dirname, '../../../../functions/helpers/blackjack-engine.private') },
    'helpers/blackjack-sync': { path: path.resolve(__dirname, '../../../../functions/helpers/blackjack-sync.private') },
  }),
};
jest.mock('../../../../functions/helpers/blackjack-sync.private', () => ({
  createGameDoc: jest.fn().mockResolvedValue({}),
  fetchGameDoc: jest.fn(),
  updateGameDoc: jest.fn().mockResolvedValue({}),
}));
```

Context: `{ ...global.createTestContext(), TWILIO_SYNC_SERVICE_SID: 'IS1234', getTwilioClient: jest.fn().mockReturnValue({}) }`

Assert TwiML via `callback.mock.calls[0][1].toString()`.

### welcome.test.js

Mock `engine.createGame` via `jest.spyOn` to return deterministic hand (7♥9♣ vs K♠6♦, status=player_turn).

- Creates Sync doc with callSid and status
- TwiML has `<Gather` with `action="/voice/blackjack/action"` and `hints="hit, hit me, card, another, stand, stay, hold"`
- Announces player hand and dealer up card
- No-input fallback contains "did not receive"
- Natural blackjack: mock returns A♠K♥, status=complete, outcome=player_blackjack → TwiML contains "Blackjack" and `<Redirect>/voice/blackjack/game-over`
- Dealer blackjack: mock returns dealer A♣Q♦ → TwiML contains "dealer blackjack" and redirect

### action.test.js

`fetchGameDoc` returns baseGame (7♥5♣ vs K♠6♦, status=player_turn, full deck).

- Game not found → `<Redirect>/voice/blackjack/welcome`
- Unknown input (Digits='9') → re-gather with "did not understand"
- Stand (Digits='2') → "stand" + `<Redirect>/voice/blackjack/dealer-turn` + updateGameDoc called
- Hit (Digits='1', 2♠ on deck top) → "drew" + `<Gather` + updateGameDoc called
- Bust (hand=10♥6♣, K♠ on deck) → "busted" + `<Redirect>/voice/blackjack/game-over`
- 21 (hand=10♥5♣, 6♠ on deck) → "21" + `<Redirect>/voice/blackjack/dealer-turn`
- Speech "hit me" works, speech "stand" works

### dealer-turn.test.js

- Game not found → redirect to welcome
- Reveals hole card: game with dealer 10♠7♦ → TwiML contains "reveals" and "7 of Diamonds"
- Stands at 17: dealer 10♠7♦ → 2 cards, redirect to game-over, updateGameDoc called
- Updates Sync: completed state has `status='complete'`, `outcome` defined, `dealerHoleRevealed=true`

### game-over.test.js

Build `makeCompletedGame(outcome, playerHand, dealerHand)` helper.

- Game not found → "goodbye"
- All 7 outcomes: player_blackjack→"blackjack"+"you win", dealer_blackjack→"dealer"+"blackjack", player_bust→"busted", dealer_bust→"busted"+"you win", player_wins→"you win", dealer_wins→"dealer wins", push→"push"
- Offers replay Gather with `action="/voice/blackjack/game-over"` and "play again"
- Digit 1 → `<Redirect>/voice/blackjack/welcome`
- Speech "deal" → redirect to welcome
- Speech "play again" → redirect to welcome
- Speech "quit" → "goodbye", no Gather
- Digit 2 → "goodbye", no Gather

---

## Build Order (TDD)

1. `blackjack-engine.test.js` → `blackjack-engine.private.js`
2. `blackjack-sync.test.js` → `blackjack-sync.private.js`
3. `welcome.test.js` → `welcome.js`
4. `action.test.js` → `action.protected.js`
5. `dealer-turn.test.js` → `dealer-turn.protected.js`
6. `game-over.test.js` → `game-over.protected.js`
7. Modify `sdk-handler.js` — add `game:` routing
8. `blackjack-client.html` + `blackjack-server.js` + `blackjack-tail.js` (no tests needed)
9. Run: `npm test -- --testPathPattern=blackjack --no-coverage` — all pass
10. Run: `npm run lint:fix`
11. Commit: `git add -A && git commit -m "feat: Add blackjack voice game with TDD"`
