# Product × Use Case Matrix

Products as rows, use cases as columns. `X` = highlighted in source, `(†)` = borderline.

**Use Case Key:** Notif = Voice Notifications, IVR = Self-Service Automation, InCC = Inbound Contact Center, OutCC = Outbound Contact Center, AI-B = AI Agents (Buy/Native), AI-3P = AI Agents (Build/3PP), Sales = Sales Dialer, Track = Call Tracking, PSTN = PSTN Connectivity, Trans = AI/ML Transcription

## How to Read This Document

Products are organized into five categories matching the source grid:

| Category | What It Covers |
|----------|---------------|
| **Software Tools** | Development and orchestration platforms (Studio, Functions, TaskRouter, etc.) |
| **Core Services** | TwiML verbs and voice-specific services (Say, Gather, Conference, Recording, etc.) |
| **Connectivity** | How calls enter/exit the Twilio platform (PSTN, SIP Interface/Programmable SIP, Elastic SIP Trunking, Voice SDKs, BYOC, etc.) |
| **Features** | Capabilities that enhance calls (AMD, Branded Calling, SHAKEN/STIR, compliance, etc.) |
| **Non-Voice Products** | Adjacent Twilio products used alongside voice (Flex, Phone Numbers, etc.) |

Each product entry within a use case includes:
- **Why** this product is relevant for the specific use case
- **When** to invoke it (trigger conditions, key parameters)
- **When NOT** to invoke it (common misapplications)
- **Prereqs** — what must exist (Console config, services, infrastructure) before this product works
- **Gotcha** — critical pitfall that causes silent failure or data loss (only on products that have them)

## Software Tools

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Conversational Intelligence | X | X | X | X | X | X | X | X | X | X |
| Studio | X | X | X | X | | | X | X | | |
| Event Streams | X | X | X | X | X | X | X | | X | X |
| TaskRouter | | | X | X | | | | | | |
| Sync | | | X | X | | | | | | |
| Functions | X | X | X | X | X | X | X | X | | X |
| Assets | X | X | X | X | X | X | X | | | X |
| CLI | X | X | X | X | X | X | X | X | | X |

## Core Services

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Conference | | | X | X | | | X | X | | |
| `<Say>` | X | X | X | X | X | X | X | X | | |
| `<Gather>` | | X | X | X | X | X | | | | |
| `<Pay>` | | X | X | X | | | | | | |
| Conversation Relay | | X | X | X | X | | | | | X |
| VirtualAgent | | X | X | X | X | | | | | |
| Recording | X | X | X | X | X | X | X | X | X | X |
| `<Transcribe>` | X | X | X | X | X | X | | | | X |
| Voice Insights | X | X | X | X | X | X | X | X | X | X |
| `<Stream>` | | X | X | X | X | X | | | | X |

## Connectivity

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Voice SDKs | | X | X | X | X | X | X | X | | |
| SIP Interface | | X | X | X | X | X | | | | X |
| Elastic SIP Trunking | | | | | | | | | X | |
| PSTN | X | X | X | X | X | X | X | X | X | X |
| BYOC | | X | X | X | X | X | X | | X | X |
| Interconnect | | X | X | X | | | | | X | X |
| WhatsApp | | | X | X | | | | | | |

## Features

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Branded Calls | X | | X | X | | | X | | | |
| Enhanced Branded Calling | X | | X | X | | | X | | | |
| SHAKEN/STIR | X | X | X | X | | | X | | X | |
| CNAM | X | X | X | X | | | X | X | X | |
| Secure Media | | | X | X | | | | | X | |
| Anomaly Detection | | | X | X | | | X | | | |
| Phone Numbers (feature) | | | X | X | | | | | | |
| SIP `<Refer>` | | X | X | X | | | | | | |
| SIPREC | | X | X | X | | X | | | | X |
| SIP Registration | | X | X | X | | | | | X | |
| SIP Header Manipulation | | X | X | X | | | | | X | |
| Application Connect | | | X | X | | | | | | |
| Multimodal Realtime API | | | X | X | X | X | | | | X |
| CPS | X | | | | | | X | | | |
| AMD | X | X | X | X | | | X | | | |
| SSML TTS | X | X | X | X | X | X | X | | | X |
| Programmable Video | | | X | X | | | | | | |
| Speech Recognition | | X | X | X | X | X | | | | X |
| Segment Integration | | | X | X | | | | X | | |
| User Defined Messages | | | X | X | X | | | | | |
| `<Enqueue>`/`<Queue>` | | X | X | X | | | | | | |
| Failover & DR | X | X | X | X | | | X | | X | |
| Trust & Engagement Insights | X | X | X | X | | | X | X | | |
| Reports API | | | X | X | | | X | | | |
| Conference Insights | | | X | X | | | X | | | |
| Emergency Calling | X | X | X | X | | | | | X | |
| HIPAA | | X | X | X | X | X | | | X | X |
| GDPR | | | X | X | | | | | X | X |
| SOC2 | | | X | X | | | | | X | |
| ISO/IEC 27001 | | | X | X | | | | | X | |
| PCI | | | X | X | | | | | X | X |

## Non-Voice Products

| Product | Notif | IVR | InCC | OutCC | AI-B | AI-3P | Sales | Track | PSTN | Trans |
|---------|:-----:|:---:|:----:|:-----:|:----:|:-----:|:-----:|:-----:|:----:|:-----:|
| Flex | | | X | X | | | | | | |
| Phone Numbers | X | | X | X | | | | X | | |
