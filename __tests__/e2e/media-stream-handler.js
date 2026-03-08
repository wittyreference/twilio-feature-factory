// ABOUTME: Minimal Media Streams WebSocket handler for UC6 validation.
// ABOUTME: Accepts stream connections, logs audio frames, keeps connection alive.

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8081;

const server = http.createServer((req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('WebSocket upgrade required');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let streamSid = null;
  let frameCount = 0;

  console.log('[MediaStream] New WebSocket connection');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      switch (msg.event) {
        case 'connected':
          console.log('[MediaStream] Connected:', msg.protocol);
          break;

        case 'start':
          streamSid = msg.start.streamSid;
          console.log(`[MediaStream] Stream started: ${streamSid}, call: ${msg.start.callSid}`);
          console.log(`[MediaStream] Format: ${msg.start.mediaFormat.encoding}, ${msg.start.mediaFormat.sampleRate}Hz`);
          break;

        case 'media':
          frameCount++;
          if (frameCount % 50 === 1) {
            console.log(`[MediaStream] Received ${frameCount} audio frames (track: ${msg.media.track})`);
          }
          break;

        case 'stop':
          console.log(`[MediaStream] Stream stopped after ${frameCount} frames`);
          break;

        default:
          console.log(`[MediaStream] Unknown event: ${msg.event}`);
      }
    } catch (err) {
      console.log(`[MediaStream] Parse error: ${err.message}`);
    }
  });

  ws.on('close', () => {
    console.log(`[MediaStream] Connection closed (${frameCount} total frames)`);
  });

  ws.on('error', (err) => {
    console.log(`[MediaStream] Error: ${err.message}`);
  });
});

server.listen(PORT, () => {
  console.log(`[MediaStream] Listening on port ${PORT}`);
});
