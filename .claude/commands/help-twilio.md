---
description: Find the right Twilio skill for your use case. Use when unsure which skill to invoke, building a new feature, or exploring available capabilities.
---

# Twilio Skill Navigator

Help the user find the right skill(s) for their use case.

## How to Use

If the user provided a use case or question, match it to the relevant skills below and invoke them. If no arguments, show the full index.

## Skill Index

### Voice & Calling
| Skill | Use When |
|-------|----------|
| `/voice` | Building IVR, call routing, TwiML flows, outbound calls |
| `/voice-use-case-map` | Choosing between Twilio voice products (Programmable Voice, Elastic SIP, Voice AI) |
| `/conversation-relay` | Building real-time voice AI with LLM integration, WebSocket audio |
| `/media-streams` | Real-time audio processing, transcription, bidirectional streaming |
| `/sip-byoc` | SIP trunking, Bring Your Own Carrier, Elastic SIP Trunking |

### Messaging
| Skill | Use When |
|-------|----------|
| `/messaging` | SMS/MMS sending, receiving, webhooks, carrier behavior |
| `/messaging-services` | Campaign management, A2P 10DLC, messaging templates, sender pools |

### Identity & Security
| Skill | Use When |
|-------|----------|
| `/verify` | Phone/email OTP verification, fraud prevention |
| `/compliance-regulatory` | GDPR, TCPA, PCI, HIPAA, A2P 10DLC compliance |

### Data & Orchestration
| Skill | Use When |
|-------|----------|
| `/sync` | Real-time state sync (documents, lists, maps), live dashboards |
| `/taskrouter` | Skills-based routing, contact center queuing, worker management |
| `/callbacks` | Status webhooks, delivery receipts, event handling |

### Payments & Privacy
| Skill | Use When |
|-------|----------|
| `/payments` | Choosing between Pay, Pay Connectors, and custom payment flows |
| `/pay` | PCI-compliant payment collection during voice calls |
| `/proxy` | Phone number masking, anonymous communications |

### Video
| Skill | Use When |
|-------|----------|
| `/video` | Video rooms, participants, tracks, use case selection |
| `/video-patterns` | Compositions, recordings, network optimization, SDK integration |

### Infrastructure & Tools
| Skill | Use When |
|-------|----------|
| `/twilio-cli` | CLI flags, profiles, deployment patterns, troubleshooting |
| `/tool-boundaries` | Deciding between MCP tools, CLI, and Serverless Functions |
| `/twilio-invariants` | Architectural rules that prevent subtle bugs (credential patterns, FriendlyName limits, etc.) |
| `/env-doctor` | Environment validation, credential troubleshooting |
| `/deep-validation` | Validating beyond HTTP 200 — Voice Insights, debugger alerts, status checks |
| `/operational-gotchas` | Common debugging pitfalls, cross-cutting failure patterns |

### Development Methodology
| Skill | Use When |
|-------|----------|
| `/getting-started` | First time using the plugin, bootstrapping a new Twilio project |
| `/tdd-workflow` | Test-driven development cycle, red/green/refactor |
| `/multi-agent-patterns` | Orchestrating multiple Claude agents, parallel workflows |
| `/context-engineering` | Managing context window, compression techniques |
| `/context-hub` | Fetching external API docs (OpenAI, Stripe, SendGrid) |
| `/memory-systems` | Session memory, project state, cross-session persistence |
| `/brainstorm` | Feature ideation, design space exploration |
| `/workflows` | Pipeline overview (architect → spec → test-gen → dev → review → docs) |

## Use Case Quick Reference

| I want to... | Start with |
|--------------|------------|
| Build an IVR | `/voice` then `/voice-use-case-map` |
| Add phone verification | `/verify` |
| Send SMS/MMS | `/messaging` |
| Build a voice AI agent | `/conversation-relay` |
| Process real-time audio | `/media-streams` |
| Handle payments over the phone | `/pay` |
| Build a contact center | `/taskrouter` then `/voice` |
| Add video to my app | `/video` |
| Mask phone numbers | `/proxy` |
| Sync real-time state | `/sync` |
| Connect my SIP infrastructure | `/sip-byoc` |
| Set up A2P 10DLC | `/messaging-services` then `/compliance-regulatory` |
| Debug a failing call | `/deep-validation` then `/operational-gotchas` |
| Understand what MCP tools to use | `/tool-boundaries` |
| Start a new Twilio project | `/getting-started` |

## Arguments

<user_request>
$ARGUMENTS
</user_request>

If the user described a use case, identify the 1-3 most relevant skills and invoke them in sequence. If the user said a specific skill name, invoke that skill directly.
