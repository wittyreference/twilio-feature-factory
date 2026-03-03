// ABOUTME: Playwright E2E test for DataTrack API collaborative features.
// ABOUTME: Tests message exchange between participants via LocalDataTrack and RemoteDataTrack.

const { test, expect } = require('@playwright/test');
const twilio = require('twilio');

// Generate unique room name for each test run
const generateRoomName = () => `datatrack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Twilio client for API operations
let twilioClient;

test.beforeAll(() => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  if (accountSid && apiKey && apiSecret) {
    twilioClient = twilio(apiKey, apiSecret, { accountSid });
  }
});

test.describe('Video SDK - DataTrack Collaboration', () => {
  test.skip(!process.env.TWILIO_ACCOUNT_SID, 'Requires Twilio credentials');

  test('participants can exchange messages via DataTrack', async ({ browser }) => {
    test.setTimeout(60000);
    const roomName = generateRoomName();

    // Create browser contexts for Alice and Bob
    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    try {
      // Step 1: Alice joins the room
      await pageAlice.goto('/');
      await pageAlice.evaluate(() => { window.IDENTITY = 'alice'; });
      await pageAlice.fill('#room-input', roomName);
      await pageAlice.click('#btn-join');
      await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Alice connected');

      // Step 2: Alice creates and publishes a DataTrack
      const aliceDataTrackPublished = await pageAlice.evaluate(async () => {
        const { LocalDataTrack } = Twilio.Video;
        const dataTrack = new LocalDataTrack({ name: 'chat' });

        // Store reference for later use
        window.localDataTrack = dataTrack;

        // Publish the data track
        const room = window.getRoom();
        await room.localParticipant.publishTrack(dataTrack);

        return {
          name: dataTrack.name,
          kind: dataTrack.kind,
          isEnabled: dataTrack.isEnabled
        };
      });

      expect(aliceDataTrackPublished.kind).toBe('data');
      expect(aliceDataTrackPublished.name).toBe('chat');
      console.log('Alice published DataTrack:', aliceDataTrackPublished);

      // Step 3: Bob joins the room
      await pageBob.goto('/');
      await pageBob.evaluate(() => { window.IDENTITY = 'bob'; });
      await pageBob.fill('#room-input', roomName);
      await pageBob.click('#btn-join');
      await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });
      console.log('Bob connected');

      // Step 4: Bob sets up listener for DataTrack messages
      await pageBob.evaluate(() => {
        window.receivedMessages = [];
        window.dataTrackSubscribed = false;

        const room = window.getRoom();

        // Handle existing participants
        room.participants.forEach(participant => {
          participant.tracks.forEach(publication => {
            if (publication.track && publication.track.kind === 'data') {
              window.dataTrackSubscribed = true;
              publication.track.on('message', (data) => {
                window.receivedMessages.push({
                  type: typeof data === 'string' ? 'string' : 'binary',
                  data: typeof data === 'string' ? data : 'ArrayBuffer',
                  timestamp: Date.now()
                });
              });
            }
          });

          // Handle new track subscriptions
          participant.on('trackSubscribed', (track) => {
            if (track.kind === 'data') {
              window.dataTrackSubscribed = true;
              track.on('message', (data) => {
                window.receivedMessages.push({
                  type: typeof data === 'string' ? 'string' : 'binary',
                  data: typeof data === 'string' ? data : 'ArrayBuffer',
                  timestamp: Date.now()
                });
              });
            }
          });
        });

        // Handle new participants
        room.on('participantConnected', (participant) => {
          participant.on('trackSubscribed', (track) => {
            if (track.kind === 'data') {
              window.dataTrackSubscribed = true;
              track.on('message', (data) => {
                window.receivedMessages.push({
                  type: typeof data === 'string' ? 'string' : 'binary',
                  data: typeof data === 'string' ? data : 'ArrayBuffer',
                  timestamp: Date.now()
                });
              });
            }
          });
        });
      });

      // Step 5: Wait for Bob to subscribe to Alice's DataTrack
      await pageBob.waitForFunction(() => window.dataTrackSubscribed === true, { timeout: 15000 });
      console.log('Bob subscribed to DataTrack');

      // Step 6: Alice sends a string message
      const testMessage1 = 'Hello from Alice!';
      await pageAlice.evaluate((msg) => {
        window.localDataTrack.send(msg);
      }, testMessage1);
      console.log('Alice sent message:', testMessage1);

      // Step 7: Verify Bob received the message
      await pageBob.waitForFunction(
        (expected) => window.receivedMessages.some(m => m.data === expected),
        testMessage1,
        { timeout: 10000 }
      );

      const bobMessages1 = await pageBob.evaluate(() => window.receivedMessages);
      expect(bobMessages1.length).toBeGreaterThanOrEqual(1);
      expect(bobMessages1.some(m => m.data === testMessage1)).toBe(true);
      console.log('Bob received message:', testMessage1);

      // Step 8: Alice sends a JSON message (simulating structured data)
      const testMessage2 = JSON.stringify({ type: 'cursor', x: 100, y: 200, sender: 'alice' });
      await pageAlice.evaluate((msg) => {
        window.localDataTrack.send(msg);
      }, testMessage2);
      console.log('Alice sent JSON message');

      // Step 9: Verify Bob received the JSON message
      await pageBob.waitForFunction(
        (expected) => window.receivedMessages.some(m => m.data === expected),
        testMessage2,
        { timeout: 10000 }
      );

      const bobMessages2 = await pageBob.evaluate(() => window.receivedMessages);
      expect(bobMessages2.length).toBeGreaterThanOrEqual(2);

      // Parse and verify JSON message
      const jsonMessage = bobMessages2.find(m => m.data === testMessage2);
      expect(jsonMessage).toBeDefined();
      const parsed = JSON.parse(jsonMessage.data);
      expect(parsed.type).toBe('cursor');
      expect(parsed.x).toBe(100);
      expect(parsed.y).toBe(200);
      console.log('Bob received JSON message with cursor data');

      // Step 10: Bob creates and publishes his own DataTrack for bidirectional communication
      const bobDataTrackPublished = await pageBob.evaluate(async () => {
        const { LocalDataTrack } = Twilio.Video;
        const dataTrack = new LocalDataTrack({ name: 'chat-response' });
        window.bobDataTrack = dataTrack;

        const room = window.getRoom();
        await room.localParticipant.publishTrack(dataTrack);

        return { name: dataTrack.name, kind: dataTrack.kind };
      });

      expect(bobDataTrackPublished.kind).toBe('data');
      console.log('Bob published DataTrack:', bobDataTrackPublished);

      // Step 11: Alice sets up listener for Bob's messages
      await pageAlice.evaluate(() => {
        window.aliceReceivedMessages = [];

        const room = window.getRoom();
        room.participants.forEach(participant => {
          participant.on('trackSubscribed', (track) => {
            if (track.kind === 'data') {
              track.on('message', (data) => {
                window.aliceReceivedMessages.push({
                  data: typeof data === 'string' ? data : 'ArrayBuffer',
                  timestamp: Date.now()
                });
              });
            }
          });

          // Check existing tracks
          participant.tracks.forEach(publication => {
            if (publication.track && publication.track.kind === 'data' && publication.track.name === 'chat-response') {
              publication.track.on('message', (data) => {
                window.aliceReceivedMessages.push({
                  data: typeof data === 'string' ? data : 'ArrayBuffer',
                  timestamp: Date.now()
                });
              });
            }
          });
        });
      });

      // Wait for Alice to subscribe to Bob's track
      await pageAlice.waitForTimeout(2000);

      // Step 12: Bob sends a reply
      const replyMessage = 'Hello back from Bob!';
      await pageBob.evaluate((msg) => {
        window.bobDataTrack.send(msg);
      }, replyMessage);
      console.log('Bob sent reply:', replyMessage);

      // Step 13: Verify Alice received the reply
      await pageAlice.waitForFunction(
        (expected) => window.aliceReceivedMessages && window.aliceReceivedMessages.some(m => m.data === expected),
        replyMessage,
        { timeout: 10000 }
      );

      const aliceMessages = await pageAlice.evaluate(() => window.aliceReceivedMessages);
      expect(aliceMessages.some(m => m.data === replyMessage)).toBe(true);
      console.log('Alice received reply from Bob');

      // Step 14: Final verification - count all messages
      const finalBobMessages = await pageBob.evaluate(() => window.receivedMessages);
      const finalAliceMessages = await pageAlice.evaluate(() => window.aliceReceivedMessages);

      console.log(`Total messages - Bob received: ${finalBobMessages.length}, Alice received: ${finalAliceMessages.length}`);

      expect(finalBobMessages.length).toBeGreaterThanOrEqual(2);
      expect(finalAliceMessages.length).toBeGreaterThanOrEqual(1);

      console.log('VERIFIED: Bidirectional DataTrack communication working');

      // Cleanup
      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');

    } finally {
      await contextAlice.close();
      await contextBob.close();
    }
  });

  test('DataTrack handles rapid message sending', async ({ browser }) => {
    test.setTimeout(60000);
    const roomName = generateRoomName();

    const contextAlice = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const contextBob = await browser.newContext({ permissions: ['camera', 'microphone'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    try {
      // Alice joins and publishes DataTrack
      await pageAlice.goto('/');
      await pageAlice.evaluate(() => { window.IDENTITY = 'alice'; });
      await pageAlice.fill('#room-input', roomName);
      await pageAlice.click('#btn-join');
      await expect(pageAlice.locator('#status')).toHaveText('connected', { timeout: 30000 });

      await pageAlice.evaluate(async () => {
        const { LocalDataTrack } = Twilio.Video;
        window.localDataTrack = new LocalDataTrack({ name: 'rapid-test' });
        const room = window.getRoom();
        await room.localParticipant.publishTrack(window.localDataTrack);
      });

      // Bob joins and sets up listener
      await pageBob.goto('/');
      await pageBob.evaluate(() => { window.IDENTITY = 'bob'; });
      await pageBob.fill('#room-input', roomName);
      await pageBob.click('#btn-join');
      await expect(pageBob.locator('#status')).toHaveText('connected', { timeout: 30000 });

      await pageBob.evaluate(() => {
        window.receivedMessages = [];
        const room = window.getRoom();

        const setupTrackListener = (track) => {
          if (track.kind === 'data') {
            track.on('message', (data) => {
              window.receivedMessages.push(data);
            });
          }
        };

        room.participants.forEach(p => {
          p.tracks.forEach(pub => {
            if (pub.track) {setupTrackListener(pub.track);}
          });
          p.on('trackSubscribed', setupTrackListener);
        });
      });

      // Wait for subscription
      await pageBob.waitForTimeout(3000);

      // Alice sends 20 messages rapidly
      const messageCount = 20;
      await pageAlice.evaluate((count) => {
        for (let i = 0; i < count; i++) {
          window.localDataTrack.send(`message-${i}`);
        }
      }, messageCount);
      console.log(`Alice sent ${messageCount} messages rapidly`);

      // Wait and verify Bob received all messages
      await pageBob.waitForFunction(
        (expected) => window.receivedMessages.length >= expected,
        messageCount,
        { timeout: 15000 }
      );

      const received = await pageBob.evaluate(() => window.receivedMessages);
      console.log(`Bob received ${received.length} messages`);

      expect(received.length).toBe(messageCount);

      // Verify message order is preserved
      for (let i = 0; i < messageCount; i++) {
        expect(received[i]).toBe(`message-${i}`);
      }
      console.log('VERIFIED: All messages received in order');

      await pageAlice.click('#btn-leave');
      await pageBob.click('#btn-leave');

    } finally {
      await contextAlice.close();
      await contextBob.close();
    }
  });
});
