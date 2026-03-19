// ABOUTME: Terminal game state viewer — polls Sync for blackjack state with colored card art.
// ABOUTME: Auto-discovers most recent blackjack doc or accepts --call-sid=CAxxx.

require('dotenv').config();
const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_API_KEY || process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN,
  { accountSid: process.env.TWILIO_ACCOUNT_SID }
);
const syncSid = process.env.TWILIO_SYNC_SERVICE_SID;

const SUITS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function colorSuit(suit) {
  const sym = SUITS[suit] || suit;
  return (suit === 'hearts' || suit === 'diamonds') ? `${RED}${sym}${RESET}` : sym;
}

function renderCard(card) {
  return `${card.rank}${colorSuit(card.suit)}`;
}

function renderHand(hand, label) {
  const cards = hand.map(renderCard).join(' ');
  const total = scoreTotal(hand);
  let color = RESET;
  if (total === 21) {color = GREEN;}
  else if (total > 21) {color = RED;}
  else if (isSoft(hand)) {color = YELLOW;}
  return `${BOLD}${label}:${RESET} ${cards}  ${color}(${total})${RESET}`;
}

function scoreTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (['J', 'Q', 'K'].includes(c.rank)) { total += 10; }
    else { total += parseInt(c.rank, 10); }
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isSoft(hand) {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (['J', 'Q', 'K'].includes(c.rank)) { total += 10; }
    else { total += parseInt(c.rank, 10); }
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return aces > 0;
}

function render(game) {
  console.clear();
  console.log(`${BOLD}${GREEN}=== BLACKJACK ===${RESET}  ${game.gameId}`);
  console.log(`Call: ${game.callSid}  Status: ${BOLD}${game.status}${RESET}  Outcome: ${game.outcome || '-'}\n`);
  console.log(renderHand(game.playerHand, 'Player'));

  if (game.dealerHoleRevealed) {
    console.log(renderHand(game.dealerHand, 'Dealer'));
  } else {
    const up = renderCard(game.dealerHand[0]);
    console.log(`${BOLD}Dealer:${RESET} ${up} [?]`);
  }

  console.log(`\n${BOLD}Moves:${RESET}`);
  for (const m of game.moves) {
    const ts = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
    console.log(`  ${ts} ${m.action}: ${m.detail}`);
  }
  console.log(`\nDeck: ${game.deck.length} cards remaining`);
}

async function findDoc(callSid) {
  if (callSid) {
    return `blackjack-${callSid}`;
  }
  // Auto-discover most recent
  const docs = await client.sync.v1.services(syncSid).documents.list({ limit: 50 });
  const bjDocs = docs.filter(d => d.uniqueName && d.uniqueName.startsWith('blackjack-'));
  if (bjDocs.length === 0) {
    console.log('No blackjack games found. Start a game first.');
    process.exit(1);
  }
  bjDocs.sort((a, b) => new Date(b.dateUpdated) - new Date(a.dateUpdated));
  return bjDocs[0].uniqueName;
}

async function main() {
  const args = process.argv.slice(2);
  const sidArg = args.find(a => a.startsWith('--call-sid='));
  const callSid = sidArg ? sidArg.split('=')[1] : null;

  const docName = await findDoc(callSid);
  console.log(`Tailing: ${docName}\n`);

  let lastData = null;
  setInterval(async () => {
    try {
      const doc = await client.sync.v1.services(syncSid).documents(docName).fetch();
      const data = JSON.stringify(doc.data);
      if (data !== lastData) {
        lastData = data;
        render(doc.data);
      }
    } catch (err) {
      if (err.code !== 20404) {
        console.error('Poll error:', err.message);
      }
    }
  }, 500);
}

main();
