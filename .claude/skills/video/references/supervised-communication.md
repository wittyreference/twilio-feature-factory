# Supervised Communication

Supervised communication is a category of video applications where an observer or supervisor can join a room **without the other participants being aware**. This goes beyond simply not publishing tracks—the observer is truly invisible to other participants.

**Use Cases:**
- **Exam proctoring** - Proctor monitors student without student knowing when they're being watched
- **Prison/correctional visitation** - Guard monitors inmate-visitor conversation invisibly
- **Call center supervision** - Manager listens to agent-customer video calls
- **Training observation** - Trainer watches trainee sessions without affecting behavior

## Track Subscriptions API

The Track Subscriptions API enables true observer patterns by controlling which tracks each participant subscribes to. By default, rooms use "subscribe-to-all" where every participant receives every published track. This API allows custom communication topologies.

**API Endpoint:**
```
POST /v1/Rooms/{RoomSid}/Participants/{ParticipantSid}/SubscribeRules
```

**Rule Structure:**
```json
{
  "type": "include|exclude",
  "all": true,
  "publisher": "participant_identity",
  "kind": "audio|video|data"
}
```

## True Observer Pattern (Invisible to Others)

To make an observer truly invisible, configure **other participants'** subscribe rules to exclude the observer's tracks:

```javascript
// When observer joins, update each existing participant's subscribe rules
async function makeObserverInvisible(roomSid, observerIdentity, participantSids) {
  for (const participantSid of participantSids) {
    await client.video.v1
      .rooms(roomSid)
      .participants(participantSid)
      .subscribeRules
      .update({
        rules: [
          { type: 'include', all: true },
          { type: 'exclude', publisher: observerIdentity }
        ]
      });
  }
}

// Observer subscribes to all tracks (sees everyone)
async function observerSubscribesToAll(roomSid, observerSid) {
  await client.video.v1
    .rooms(roomSid)
    .participants(observerSid)
    .subscribeRules
    .update({
      rules: [{ type: 'include', all: true }]
    });
}
```

**Result:**
- Observer sees and hears all participants
- Participants do NOT receive observer's tracks (even if observer publishes)
- Participant count still increments (unavoidable)

## Observer Visibility Levels

| Level | Implementation | Participant Sees | Recorded |
|-------|----------------|------------------|----------|
| **Visible** | Default subscribe-to-all | Observer's identity, audio, video | Yes |
| **Silent** | Observer publishes no tracks | Participant count increases, no media | No |
| **Invisible** | Track Subscriptions API exclusion | Participant count increases, no media, no track events | No (if no tracks) |

**Observer Recording Pattern:**
To ensure observers are NOT recorded, connect without publishing tracks:
```javascript
// Client-side: Connect as observer without tracks
const room = await Twilio.Video.connect(token, {
  name: roomName,
  tracks: [] // No tracks = no recordings
});
```

**Key difference between Silent and Invisible:**
- **Silent**: Participants receive `participantConnected` and `trackSubscribed` events for observer (even if no tracks)
- **Invisible**: Participants receive `participantConnected` but observer's tracks are filtered out at the SFU level

## Prison Visitation Example

```javascript
// Room setup: inmate + visitor + guard (invisible)
const room = await client.video.v1.rooms.create({
  uniqueName: `visitation-${inmateId}-${Date.now()}`,
  type: 'group',
  maxParticipants: 3,
  recordParticipantsOnConnect: true  // Compliance recording
});

// When guard joins, make them invisible to inmate and visitor
async function onGuardJoined(roomSid, guardIdentity) {
  const participants = await client.video.v1.rooms(roomSid).participants.list();

  for (const p of participants) {
    if (p.identity !== guardIdentity) {
      await client.video.v1
        .rooms(roomSid)
        .participants(p.sid)
        .subscribeRules
        .update({
          rules: [
            { type: 'include', all: true },
            { type: 'exclude', publisher: guardIdentity }
          ]
        });
    }
  }
}
```

## Gotchas for Supervised Communication

**Participant count is visible:** The Track Subscriptions API hides media tracks, not participant presence. If your UI shows "2 participants" and it suddenly shows "3", users may notice. Options:
- Use server-side participant list filtering in your app
- Accept that count reveals observation (may be acceptable for compliance)

**New participants need rules updated:** When a new participant joins after the observer, you must update their subscribe rules too. Use `participantConnected` webhook to trigger rule updates.

**Observer can still publish (if they want to intervene):** The exclusion rules don't prevent observer from publishing—they just prevent others from receiving. Observer can "decloak" by removing the exclusion rules when intervention is needed.
