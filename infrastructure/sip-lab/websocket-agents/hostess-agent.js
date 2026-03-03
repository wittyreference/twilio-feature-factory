// ABOUTME: ConversationRelay WebSocket server for the "hostess" AI agent (Sam).
// ABOUTME: Answers calls at The Golden Fork restaurant, takes reservations, confirms details.

const { WebSocketServer } = require('ws');
const Anthropic = require('@anthropic-ai/sdk');

const PORT = process.env.PORT || 8091;
const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are Sam, a warm and professional hostess at The Golden Fork restaurant, answering the phone.

Your behavior:
- Greet callers warmly: "Thank you for calling The Golden Fork, this is Sam, how can I help you?"
- For reservation requests:
  - Saturday at 7pm: say you have a table available at 7:15
  - Ask for the name and party size
  - Ask if there are any special occasions or dietary needs
  - Confirm the full reservation details before ending
- Be friendly but efficient — this is a busy restaurant

Style:
- Speak naturally, 1-2 sentences max per turn
- Use warm language: "wonderful", "absolutely", "we'd love to have you"
- Don't narrate actions or use asterisks

The conversation will end when the caller says goodbye. Just say goodbye warmly in return.`;

const wss = new WebSocketServer({ port: PORT });
console.log(`Hostess agent (Sam) listening on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  const conversationHistory = [];
  let callSid = '';
  let turnCount = 0;

  ws.on('message', async (data) => {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'setup':
        callSid = message.callSid || '';
        console.log(`[${callSid}] Hostess agent connected (from: ${message.from}, to: ${message.to})`);

        // Hostess answers the phone
        const greeting = "Thank you for calling The Golden Fork, this is Sam, how can I help you today?";
        ws.send(JSON.stringify({ type: 'text', token: greeting }));
        conversationHistory.push({ role: 'assistant', content: greeting });
        break;

      case 'prompt':
        if (!message.last) return;

        turnCount++;
        const userText = message.voicePrompt;
        console.log(`[${callSid}] Caller said: ${userText}`);
        conversationHistory.push({ role: 'user', content: userText });

        try {
          const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            system: SYSTEM_PROMPT,
            messages: conversationHistory.map(m => ({ role: m.role, content: m.content })),
          });

          const responseText = response.content[0].text;
          console.log(`[${callSid}] Sam says: ${responseText}`);
          ws.send(JSON.stringify({ type: 'text', token: responseText }));
          conversationHistory.push({ role: 'assistant', content: responseText });
        } catch (err) {
          console.log(`[${callSid}] Anthropic error: ${err.message}`);
          ws.send(JSON.stringify({ type: 'text', token: "I'm sorry, could you say that again?" }));
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
    console.log(`[${callSid}] Hostess agent disconnected (${turnCount} turns)`);
  });

  ws.on('error', (err) => {
    console.log(`[${callSid}] WebSocket error: ${err.message}`);
  });
});
