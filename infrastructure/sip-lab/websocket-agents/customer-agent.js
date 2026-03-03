// ABOUTME: ConversationRelay WebSocket server for the "customer" AI agent (Alex).
// ABOUTME: Calls a restaurant to make a dinner reservation, then ends the call after confirmation.

const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');

const PORT = process.env.PORT || 8090;
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are Alex, a friendly person calling The Golden Fork restaurant to make a dinner reservation.

Your goal:
- Ask for a table for 4 people this Saturday evening, around 7pm
- If that time isn't available, be flexible and accept an alternative
- Give your name as "Alex" when asked
- Mention you're celebrating a birthday if they ask about special occasions
- Once the reservation is confirmed, thank them warmly and say goodbye

Style:
- Speak naturally and conversationally, like a real phone call
- Keep responses to 1-2 sentences max — this is a phone conversation, not an essay
- Use casual language: "yeah", "sounds great", "perfect"
- Don't narrate your actions or use asterisks

IMPORTANT: After the reservation is confirmed and you've said goodbye, you MUST end your final message with the exact text: [END_CALL]
This signals that the conversation is complete. Do this after approximately 4-6 exchanges.`;

const wss = new WebSocketServer({ port: PORT });
console.log(`Customer agent (Alex) listening on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  const conversationHistory = [];
  let callSid = '';
  let turnCount = 0;

  ws.on('message', async (data) => {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'setup':
        callSid = message.callSid || '';
        console.log(`[${callSid}] Customer agent connected (from: ${message.from}, to: ${message.to})`);

        // Customer initiates — say hello first
        const greeting = "Hi, I'd like to make a reservation for this Saturday evening please.";
        ws.send(JSON.stringify({ type: 'text', token: greeting }));
        conversationHistory.push({ role: 'assistant', content: greeting });
        break;

      case 'prompt':
        if (!message.last) return;

        turnCount++;
        const userText = message.voicePrompt;
        console.log(`[${callSid}] Hostess said: ${userText}`);
        conversationHistory.push({ role: 'user', content: userText });

        try {
          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            system: SYSTEM_PROMPT,
            messages: conversationHistory.map(m => ({ role: m.role, content: m.content })),
          });

          const responseText = response.content[0].text;
          const cleanText = responseText.replace('[END_CALL]', '').trim();

          console.log(`[${callSid}] Alex says: ${cleanText}`);
          ws.send(JSON.stringify({ type: 'text', token: cleanText }));
          conversationHistory.push({ role: 'assistant', content: responseText });

          if (responseText.includes('[END_CALL]') || turnCount >= 8) {
            console.log(`[${callSid}] Conversation complete, ending call`);
            setTimeout(() => {
              ws.send(JSON.stringify({ type: 'end' }));
            }, 3000);
          }
        } catch (err) {
          console.log(`[${callSid}] Anthropic error: ${err.message}`);
          ws.send(JSON.stringify({ type: 'text', token: "Sorry, could you repeat that?" }));
        }
        break;

      case 'interrupt':
        console.log(`[${callSid}] Interrupted`);
        break;

      case 'dtmf':
        console.log(`[${callSid}] DTMF: ${message.digit}`);
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[${callSid}] Customer agent disconnected (${turnCount} turns)`);
  });

  ws.on('error', (err) => {
    console.log(`[${callSid}] WebSocket error: ${err.message}`);
  });
});
