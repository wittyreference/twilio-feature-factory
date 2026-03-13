#!/usr/bin/env node
// ABOUTME: Real-time terminal viewer for blackjack game state via Twilio Sync polling.
// ABOUTME: Displays ASCII card art, color-coded scores, and move log with timestamps.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true, quiet: true });

const twilio = require('twilio');

const POLL_INTERVAL_MS = 500;
const SUITS = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
};

function getClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (apiKey && apiSecret) {
    return twilio(apiKey, apiSecret, { accountSid });
  }
  return twilio(accountSid, authToken);
}

function renderCard(card, hide) {
  if (hide) return `${C.dim}??${C.reset}`;
  const suit = SUITS[card.suit] || '?';
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const color = isRed ? C.red : C.reset;
  return `${color}${card.rank}${suit}${C.reset}`;
}

function scoreHand(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    if (c.rank === 'A') { aces++; total += 11; }
    else if (['J', 'Q', 'K'].includes(c.rank)) total += 10;
    else total += parseInt(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function renderHand(hand, label, hideHole) {
  const cards = hand.map((c, i) => renderCard(c, hideHole && i === 1)).join('  ');
  const score = scoreHand(hand);
  const sc = hideHole ? '?' : score > 21 ? `${C.red}${score}${C.reset}` : score === 21 ? `${C.green}${score}${C.reset}` : `${C.yellow}${score}${C.reset}`;
  return `  ${C.bold}${label}${C.reset}: [ ${cards} ]  (${sc})`;
}

function formatOutcome(o) {
  const m = {
    player_blackjack: `${C.green}${C.bold}BLACKJACK! Player Wins!${C.reset}`,
    dealer_blackjack: `${C.red}Dealer Blackjack${C.reset}`,
    player_bust: `${C.red}Player Busted${C.reset}`,
    dealer_bust: `${C.green}Dealer Busted — Player Wins!${C.reset}`,
    player_wins: `${C.green}${C.bold}Player Wins!${C.reset}`,
    dealer_wins: `${C.red}Dealer Wins${C.reset}`,
    push: `${C.yellow}Push (Tie)${C.reset}`,
  };
  return m[o] || o;
}

function renderGame(game) {
  console.clear();
  console.log(`${C.bold}${C.cyan}  BLACKJACK${C.reset}  ${C.dim}${game.gameId}${C.reset}`);
  console.log(`${C.dim}  Call: ${game.callSid}${C.reset}\n`);

  const hideHole = !game.dealerHoleRevealed;
  console.log(renderHand(game.dealerHand, 'Dealer', hideHole));
  console.log();
  console.log(renderHand(game.playerHand, 'Player', false));
  console.log();

  const statusMap = {
    player_turn: `${C.yellow}Player's Turn${C.reset}`,
    dealer_turn: `${C.magenta}Dealer's Turn${C.reset}`,
    complete: game.outcome ? formatOutcome(game.outcome) : `${C.dim}Complete${C.reset}`,
  };
  console.log(`  Status: ${statusMap[game.status] || game.status}\n`);

  console.log(`${C.dim}  ── Move Log ──${C.reset}`);
  for (const m of game.moves) {
    const ts = m.timestamp ? m.timestamp.split('T')[1].slice(0, 8) : '';
    console.log(`  ${C.dim}${ts}${C.reset}  ${m.detail || m.action}`);
  }
  console.log();
}

async function findLatestGame(client, syncSid) {
  const docs = await client.sync.v1.services(syncSid).documents.list({ limit: 20 });
  const bj = docs
    .filter((d) => d.uniqueName && d.uniqueName.startsWith('blackjack-'))
    .sort((a, b) => new Date(b.dateUpdated) - new Date(a.dateUpdated));
  return bj[0] || null;
}

async function main() {
  const syncSid = process.env.TWILIO_SYNC_SERVICE_SID;
  if (!syncSid) {
    console.error('Error: TWILIO_SYNC_SERVICE_SID not set');
    process.exit(1);
  }

  const client = getClient();
  const arg = process.argv.find((a) => a.startsWith('--call-sid='));
  let docName = arg ? `blackjack-${arg.split('=')[1]}` : null;

  console.log(`${C.cyan}Blackjack Tail${C.reset} — waiting for game...`);
  if (docName) console.log(`Watching: ${docName}`);
  else console.log('Auto-discovering most recent game...');

  let lastUpdated = null;

  const poll = async () => {
    try {
      if (!docName) {
        const latest = await findLatestGame(client, syncSid);
        if (latest) { docName = latest.uniqueName; console.log(`Found: ${docName}`); }
        else return;
      }

      const doc = await client.sync.v1.services(syncSid).documents(docName).fetch();
      const updated = doc.dateUpdated.toISOString();

      if (updated !== lastUpdated) {
        lastUpdated = updated;
        renderGame(doc.data);
      }
    } catch (err) {
      if (err.code !== 20404) console.error(`Poll error: ${err.message}`);
    }
  };

  const interval = setInterval(poll, POLL_INTERVAL_MS);
  poll();

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(`\n${C.dim}Stopped.${C.reset}`);
    process.exit(0);
  });
}

main();
