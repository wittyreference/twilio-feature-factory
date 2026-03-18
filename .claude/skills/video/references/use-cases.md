# Video Use Cases & Customer Themes

## The Use Case Ladder

Video development follows a progression pattern. Customers typically start simple and add capabilities.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Supervised Communication                         │
│  Proctoring, compliance recording, audit trails                     │
├─────────────────────────────────────────────────────────────────────┤
│                    Professional Consultation                        │
│  Recorded sessions, compositions, PSTN integration                  │
├─────────────────────────────────────────────────────────────────────┤
│                    Healthcare Consultation                          │
│  HIPAA-eligible, real-time transcription, accessibility             │
├─────────────────────────────────────────────────────────────────────┤
│                    Basic Video Calling                              │
│  Simple 1:1 video calling - the starting point                      │
└─────────────────────────────────────────────────────────────────────┘
              ↑ Most common starting point

PSTN Integration can be added at any level for phone dial-in/dial-out.
```

**Key insight:** Customers can enter at any point. A customer with basic video might add recording for compliance. A telehealth customer might add PSTN for patients without video capability.

---

## Use Case Details

### 1. Healthcare Consultation

**Goal:** HIPAA-compliant video visits between patients and providers with accessibility support.

**Configuration:**

| Setting | Value | Why |
|---------|-------|-----|
| Room type | `group` | HIPAA-eligible |
| Max participants | 2-5 | Provider + patient + interpreters/family |
| Recording | OFF (default) | HIPAA - enable only with BAA + consent |
| Transcription | ON | Accessibility, AI-assisted notes |
| PSTN | Optional | Backup for connectivity issues |
| Screen share | Rare | Reviewing test results, images |

**Transcription Pattern:**
1. Create room with transcription enabled
2. Transcription starts automatically when participants join
3. Sentences stream in real-time with speaker attribution
4. Handle both `partial` and `final` sentence types
5. Transcription ends when room ends

**HIPAA Note:** All Twilio Video features HIPAA-eligible except P2P and Go rooms. Requires BAA with Twilio. Link: https://www.twilio.com/docs/security

### 2. Professional Consultation

**Goal:** Recorded business consultations with shareable video output.

**Configuration:**

| Setting | Value | Why |
|---------|-------|-----|
| Room type | `group` | Full features |
| Max participants | 2-10 | Consultant + client team |
| Recording | ON | Compliance, reference |
| Composition | Auto via Hook | Single MP4 for sharing |
| Transcription | OFF | Recording suffices |
| PSTN | Typical | Phone access for executives |
| Screen share | Common | Presentations, documents |

**Composition Pattern:**
1. Create Composition Hook (one-time setup)
2. Rooms auto-compose when they end
3. Poll composition status until `completed`
4. Retrieve media URL for download/sharing
5. Configure external storage (S3) for long-term retention

### 3. Online Exam Proctoring

**Goal:** Monitor exam-takers with individual recordings per student.

**Configuration:**

| Setting | Value | Why |
|---------|-------|-----|
| Room type | `group` | One student per room |
| Max participants | 2 | Student + optional proctor |
| Recording | ON | Audit trail |
| Composition | OFF | Need raw per-student video |
| Transcription | OFF | Not relevant |
| PSTN | OFF | Video required for identity |
| Screen share | Required | Monitor exam application |

**Proctor Participation Modes:**

Proctors can join a student's room in two modes:

| Mode | Audio/Video | Use Case |
|------|-------------|----------|
| **Observer** | None published | Silent monitoring - student unaware of live observation |
| **Active** | Published | Intervention - proctor can speak to student (e.g., warnings, instructions) |

**Observer Pattern:**
- Proctor connects with `audio: false, video: false`
- Subscribes to student's tracks (camera, screen share)
- Student sees participant count but proctor publishes nothing
- Useful for scalable monitoring (one proctor cycling through many rooms)

**Active Intervention Pattern:**
- Proctor connects with audio enabled
- Can unmute to speak to student
- Student sees and hears proctor
- Use for warnings, clarifications, or ending exam early

**Proctoring Pattern:**
1. Create room per student with unique name (exam-{studentId}-{timestamp})
2. Enable recording at room creation
3. Require screen share track publication
4. Monitor for track unpublish events (cheating indicator)
5. Proctor joins as observer or active participant as needed
6. Download raw track recordings after room ends

---

## 2026 Customer Problem Themes

### Theme 1: Telehealth Accessibility
"Patients can't access video visits"
-> PSTN dial-in, transcription for deaf/HoH, browser-based (no app install)

### Theme 2: Compliance Recording
"We need records of every consultation"
-> Automatic recording, compositions, external S3 storage, retention policies

### Theme 3: Remote Proctoring Scale
"We have 10,000 exams to monitor"
-> Per-student rooms, raw recordings, screen share detection, efficient storage

### Theme 4: Professional Meeting Quality
"Our video calls look terrible"
-> Bandwidth profiles, simulcast, network quality monitoring, adaptive streaming

### Theme 5: Integration Simplicity
"We just want video in our app"
-> Access tokens, SDK quickstarts, composition hooks (automatic)
