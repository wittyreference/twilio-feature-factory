---
name: video
description: Twilio Video development guide. Use when building video applications, telehealth platforms, remote collaboration tools, or working with rooms, participants, recordings, and compositions.
---

# Video Development Skill

Comprehensive decision-making guide for Twilio Video development. Load this skill when building video applications, telehealth platforms, or remote collaboration tools.

## Room Type Decision (CRITICAL)

**ALWAYS use `group` rooms.**

| Room Type | Recommendation | Why |
|-----------|----------------|-----|
| `group` | ALWAYS | HIPAA-eligible, full features, scalable |
| `group-small` | AVOID | Legacy alias, use `group` instead |
| `peer-to-peer` | NEVER | Not HIPAA-eligible, limited features |
| `go` | NEVER | Not HIPAA-eligible, legacy WebRTC |

## Quick Decision Reference

| Need | Use | Why |
|------|-----|-----|
| Any video session | `group` room | Only HIPAA-eligible type |
| Recording for compliance | `recordParticipantsOnConnect: true` | Automatic, per-track |
| Recording selective participants | Recording Rules | Fine-grained include/exclude |
| Combined video file | Compositions | Post-room MP4/WebM generation |
| Auto-compose every room | Composition Hooks | Automatic composition on room end |
| Real-time captions/notes | Transcriptions | Live speech-to-text with speaker attribution |
| Phone participants | PSTN dial-in/out | Bridges voice to video room |
| Long-term storage | External Storage (S3) | Twilio default is 24-hour retention |

## Decision Frameworks

### Recording: ON vs OFF

**Turn Recording ON when:** Compliance requirements, training/playback, QA review, proctoring/monitoring.
**Keep Recording OFF when:** Privacy-sensitive (therapy, legal where recording prohibited), no retention requirements.

### Composition vs Raw Track Recordings

**Use Compositions when:** Need single MP4/WebM for playback, sharing with end users, archival, grid/speaker layout.
**Use Raw Tracks when:** Per-participant separation, post-processing/editing, ML training data, proctoring (individual student video).

### Transcription: Real-time vs None

**Use Transcription when:** Accessibility (deaf/HoH), note-taking, AI integration, healthcare documentation.
**Skip Transcription when:** Privacy concerns, cost optimization, non-verbal content (screen share only).

### PSTN Integration: Yes vs No

**Add PSTN when:** Participants may lack video devices, backup access needed, dial-out to experts.
**Skip PSTN when:** All participants have app/browser, video is required, simplicity preferred.

## Deep Validation (MANDATORY)

A 200 OK is NOT sufficient. Use `validate_video_room` MCP tool for automated validation.

```
ALWAYS CHECK (every room):
[ ] Room Resource - status = 'in-progress', type = 'group'
[ ] Participant count - expected participants connected
[ ] Published tracks - participants publishing audio/video
[ ] Subscribed tracks - participants receiving each other

WHEN USING RECORDING:    + recording resources exist, status progresses to 'completed'
WHEN USING TRANSCRIPTION: + transcription exists, status = 'started', sentences appearing
WHEN USING COMPOSITION:  + composition created after room ends, status = 'completed', media URL accessible
```

## Gotchas (Quick Reference)

- **Room lifecycle**: `in-progress` -> `completed` -> never back. Cannot reactivate a completed room.
- **Composition timing**: Compositions can ONLY be created AFTER the room ends. Creating during `in-progress` fails.
- **Recording retention**: Without external storage (S3), recordings deleted after 24 hours.
- **Empty room timeout**: Rooms auto-close after `emptyRoomTimeout` (default 5 min).
- **maxParticipantDuration minimum**: 600 seconds (10 min), not 0 as docs suggest. Values below 600 fail with error 53123.
- **PSTN participants**: Audio-only, no video track. Handle in UI with avatar/audio indicator.
- **Transcription partials**: Partial results are interim and WILL change. Only persist `final` results.
- **Track limits**: 16 video tracks max visible simultaneously in group rooms.
- **Codec compatibility**: H.264 does NOT support simulcast. Use VP8 for multiparty rooms.
- **Kick detection**: Participant removal via API produces NO error code; indistinguishable from voluntary leave.

Read `references/gotchas-and-edge-cases.md` for full details, error codes, and code patterns.

## Reference Files

| Topic | File | When to read |
|-------|------|-------------|
| Use cases & customer themes | `references/use-cases.md` | Building for healthcare, proctoring, professional consultation |
| Supervised communication | `references/supervised-communication.md` | Observer patterns, invisible participants, Track Subscriptions API |
| SDK integration | `references/sdk-integration.md` | Client-side code (JS/iOS/Android), access tokens, DataTrack, screen share |
| Network & bandwidth | `references/network-and-bandwidth.md` | Simulcast, bandwidth profiles, network quality, preflight, capture constraints |
| Recordings & compositions | `references/recordings-and-compositions.md` | Recording rules, compositions, composition hooks, external storage |
| Transcription & PSTN | `references/transcription-and-pstn.md` | Real-time transcription, PSTN dial-in/out, recording math |
| Gotchas & edge cases | `references/gotchas-and-edge-cases.md` | Room lifecycle, reconnection, disconnect error codes, edge cases |
