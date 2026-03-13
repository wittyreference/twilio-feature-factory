# MC's Technical Writing Style Guide

> **What this is**: A codified version of how I write — distilled from years of published blog posts, internal docs, and more corrections from editors than I'd like to admit. I wrote this down so I'd stop being inconsistent, and so anyone collaborating on content with me knows what to expect (and what I'll redline).

---

## 1. Core Voice

**Who I am in print**: A telecom API lifer who has been making phones ring with software since 2001. That "I've been doing this since before smartphones existed" energy is authentic and should come through naturally — not as credential-waving, but as seasoned confidence.

**Tone**: Confident colleague at a whiteboard. Never professor at a lectern. Peer-to-peer. I'm explaining something I built or care about to someone I respect.

**POV**: First person singular dominant ("I built", "I hit a weird bug", "I chose"). Direct second-person address to the reader ("you", "your"). It's a conversation, not a lecture.

**Confidence**: State things directly. Never hedge. Never weasel. If you think it, say it. "This is the best approach" not "this could arguably be considered a viable approach."

**Self-deprecation**: Light and dry. Used sparingly for humor, never for genuine self-doubt.
- YES: "Because I'm not a monster, this has tests."
- YES: "(This prevents surprise bills. You're welcome.)"
- NO: "I'm probably wrong about this, but..."

---

## 2. The High-Low Lexicon Mix

This is the single most distinctive thing about my writing. I casually alternate between high-register vocabulary and street slang — sometimes within the same sentence. The juxtaposition is the point. It signals: "I'm smart enough to use big words AND cool enough not to be precious about it."

### How It Works

Drop a $10 word, then follow it with slang. Or vice versa. The transition should feel effortless, never forced.

**Examples from my published work:**
- "de rigueur" in the same article as "vibe check"
- "config deets" alongside "opaqueness"
- "onesie-twosie" next to "programmatically"
- "peep the updated profiles" after a deep technical deep dive
- "shunt this first-party data around" (colorful verb where "send" would do)
- "brass tacks" (old-school idiom) next to current slang

### The Generational Mashup

The slang mixing across eras is intentional. Gen Z terms, millennial slang, boomer idioms — they all coexist. The anachronism IS the vibe. There is no era floor or ceiling.

### Colorful Verb Choices

Prefer vivid, physical verbs over generic ones:
- "shunt" over "send"
- "pour" over "direct"
- "rip out" over "remove"
- "blow up" over "scale rapidly"
- "tease out" over "determine"

### High-Register Words I Actually Use
de rigueur, opaqueness, prescriptive, aggregate, traverse, articulate, granularity, ephemeral, venerable, subjective, correlate, programmatically, provisioning

### Slang/Casual Terms I Actually Use
deets, onesie-twosie, vibe check, peep (as "look at"), cool, brass tacks, don't sweat it, blowing up, pretty much, shiny new, rattling around, voila

---

## 3. Sentence Architecture

### Rhythm: The Long-Short Punch

My sentences vary dramatically in length. A long, complex explanatory sentence is followed by a short punchy fragment. This rhythm is load-bearing — it creates momentum and emphasis.

**Pattern**: Build context with a longer sentence. Then punch. Like this. Short fragments hit harder after a long setup; they're the rimshot after the joke.

### Fragment Sentences

Used for emphasis and impact. Not accidental — deliberate stylistic choice.
- "Just data."
- "No real customer PII."
- "Like Ash from Alien, just less *murderous*."
- "That's realistic customer service data."

### Rhetorical Questions

Used to set up sections and create reader engagement. The question frames the problem, the answer follows.
- "But how do you *test* it?"
- "*But will it handle 100 concurrent conferences? 500?*"
- "What if instead you make robots do it?"

### Conjunction-Initial Sentences

I start sentences with But, And, Or freely. This is intentional voice, not a grammar error.
- "But how do you test it?"
- "And with that, let me walk you through the application."
- "Or... just generate a thousand calls."

### Punctuation Patterns

- **Semicolons**: Used correctly and frequently. Shows comfort with complex sentence construction. Don't avoid them.
- **Em dashes**: For parenthetical thoughts — like this — never en dashes.
- **Ellipsis**: For trailing off or dramatic pause ("Or... just generate a thousand calls.")
- **Period-separated words**: For staccato emphasis ("every. Single. Time.")
- **Comma splices**: Occasional, intentional, for rhythm.
- **Oxford comma**: YES. Always. Non-negotiable.
- **Italics**: For emphasis on individual words (*test*, *their*, *real*).
- **Bold**: For key phrases within body paragraphs, and for list item labels.

---

## 4. Humor & Pop Culture References

### Scope: Era-Agnostic Chaos

Anything from Kubrick to TikTok memes to anime to reality TV. If it's funny and fits the context, it's in play. References are never limited to a single era or genre.

### How I Deploy Them

1. **Parenthetical asides** — Quick editorial comments dropped mid-paragraph:
   - "(This prevents surprise bills. You're welcome.)"
   - "(and boring)"

2. **Dry understatement** — State absurd things deadpan. Let the reader figure out it's funny:
   - "Like Ash from Alien, just less *murderous*."
   - "By default, the system randomly pairs customers with agents (no intelligent matching — we want diverse scenarios)."

3. **Section-break images** — In longer blog posts, movie stills with captions serve as visual humor between sections. The Alien franchise is a heavy favorite.

### Reference Rules

- **Never explain the joke.** If the reader gets it, it's a moment. If they don't, they move on. No footnotes, no "for those unfamiliar."
- **Specificity over generality.** "Like Ash from Alien" is better than "like a robot from a movie."
- **The reference should ADD meaning**, not just signal nerdiness. A Dr. Strangelove title homage ("How I Learned to Stop Worrying and Use the PSTN") works because the original title IS about learning to accept something scary.

### Reference Domains I Draw From

Alien franchise, Star Trek (specifically TNG), Twin Peaks & David Lynch, Dr. Strangelove, Blade Runner, The Matrix, Kubrick films, Coen Brothers, Tarantino, Office Space, anime, hoity-toity European art cinema of the 1960s (Bergman, Fellini, Godard, Tarkovsky, Resnais, Tati, etc.), lowbrow TikTok memes — genuinely anything. The only rule is it has to be *good* and *apt*.

### Profanity Gradient

- **Published/external writing**: PG-13 always. No f-bombs, no s-words. "Damn" and "hell" are fine if they fit.
- **Internal docs, Slack, READMEs**: Can swear. Match the energy of the context.
- **When in doubt**: Keep it clean. The humor doesn't depend on profanity.

---

## 5. Music Identity

My music taste is eclectic but alternative-leaning. The core principle: **slightly outside mainstream, authentic over commercial.**

### Bands/Artists in My Orbit
Depeche Mode, The Cure, Radiohead, Outkast, Kraftwerk, Norwegian Black Metal (Mayhem, Burzum, Darkthrone), Charli XCX, Phoebe Bridgers, ABBA, Nirvana, 80s synthpop broadly, 90s gangsta rap, 2000s heavy metal

### The Litmus Test
- Nirvana, not Creed
- Radiohead, not Coldplay
- ABBA, not Taylor Swift
- Outkast, not generic pop-rap

### What NOT to Reference
Taylor Swift, Justin Bieber, Creed, Coldplay, Ed Sheeran — anything that reads as mainstream-commercial or inauthentic. I have never heard a Justin Bieber song. Act accordingly.

### How Music Shows Up

- Subtle lyric allusions that music nerds catch
- Band name-drops where they fit naturally
- Song or album titles as section headers if apt
- Never forced — if a music reference doesn't serve the paragraph, skip it

---

## 6. Structural Patterns

### Opening: Never Bury the Lede

The first paragraph states what this thing is and why the reader should care. No throat-clearing, no "In today's world of..." preamble. Hit them with the premise.

**YES**: "I built a system where AI-powered customers and agents have realistic phone conversations — complete with recordings, transcripts, and Conversational Intelligence analytics."

**NO**: "In the ever-evolving landscape of customer engagement, testing voice applications presents unique challenges..."

### Explanation Order: Complexity-Dependent

- **Simple concepts**: State what it is. Don't over-motivate.
- **Complex concepts**: Lead with the WHY (the problem, the pain). Make the reader care. Then deliver the WHAT (the solution).

### Code Examples

Always real, working code. Never pseudo-code, never simplified-to-the-point-of-uselessness. If you show code, it should be copy-pasteable.

### Use Cases

Present as real-world scenarios with narrative context. Not abstract bullet points, but mini-stories:

**YES**: "You've refactored your conference webhook. Or updated your Event Streams sink configuration. You need to verify the *entire pipeline* works, but you're not about to test this with production customer calls."

**NO**: "Use Case 2: Pipeline validation after infrastructure changes."

### Section Headers

Mix of clever/punchy and descriptive. Sometimes questions, sometimes references, sometimes just clean and functional.
- "The turn-taking problem" (descriptive, intriguing)
- "The synthetic assembly line" (metaphorical)
- "What now?" (conversational question)
- "One more SUPER advanced feature..." (teasing)

### Narrative Arc

Even in dry technical content, there's a story: problem → attempt → obstacle → solution → result. Technical writing doesn't have to read like a manual.

---

## 7. Signature Closings

These are part of the brand. I rotate between them depending on the energy of the piece.

- **"Onward!"** — Closes a section or an article. Sometimes standalone, sometimes the final word of a paragraph.
- **"We can't wait to see what you build!"** — Recurring closing for articles and blog posts. Genuine invitation, not performative.
- **"Let's make it happen."** — Transition phrase, shifts from motivation to implementation.

---

## 8. Metaphor Style

I make abstract technical concepts tangible through physical, sensory metaphors. This isn't decoration — it's how I think. Always look for the physical analogue of an abstract process.

### Examples from Published Work
- "rattling around inside the conference mixer" (packets in a buffer)
- "pour our call data into the pipeline" (data flow)
- "kicks open the telecom black box" (visibility into opaque systems)
- "shunt this first-party data around" (data routing)
- "tap into a unified stream" (Event Streams subscription)

### How to Do This
1. Identify the abstract concept (data buffering, event routing, API integration)
2. Find a physical process that behaves similarly (pouring liquid, opening a box, rattling objects)
3. Use the physical language naturally — don't call attention to the metaphor with "think of it like..." Just say it as if it's the literal process.
4. One metaphor per concept. Don't mix metaphors in the same paragraph. (Exception: mixing metaphors for comedic effect, but only if it *kills*.)

---

## 9. Formality Gradient

The voice stays consistent but the volume knobs adjust by audience.

### Level 1: Dev Tutorials & Best Practices (Most Casual)
Full personality. Maximum slang, pop culture references, humor, parenthetical asides. Movie stills as section breaks. This is me at my most me.

### Level 2: Product Announcements & Launches (Moderate)
Personality present but measured. Fewer movie stills, same voice. Slightly more structured. The reader might be a VP of Engineering, not just a dev. Still direct, still opinionated.

### Level 3: Executive-Facing & Business Docs (Dialed Back)
Expertise shows through analysis, not jokes. Still direct, still opinionated, but the humor is subtler — dry observation rather than Alien references. No slang. The authority comes from depth of knowledge, not personality.

---

## 10. The Cringe List (Forbidden Words & Phrases)

These words and phrases are dead giveaways of corporate-committee writing. I will redline every one of them.

### Corporate Speak
~~leverage~~ (as a verb) → "use"
~~utilize~~ → "use"
~~synergize~~ → don't even
~~action~~ (as a verb) → "do" / "handle" / "address"
~~circle back~~ → "revisit" or just "come back to"
~~move the needle~~ → "make a difference" or be specific about what changes
~~align on~~ → "agree on"
~~cadence~~ (meaning interval) → "frequency" / "schedule" / "rhythm"
~~bandwidth~~ (meaning capacity) → "capacity" / "time" / "cycles"

### Overused Buzzwords
~~delve into~~ → "dig into" / "look at" / "explore"
~~it's important to note~~ → just note it, or don't
~~let's dive in~~ → just start
~~in today's fast-paced world~~ → delete the entire sentence and start over
~~robust~~ → "solid" / "reliable" / or be specific
~~seamless~~ → describe what actually happens
~~cutting-edge~~ → "new" / or describe what makes it novel
~~game-changer~~ → explain the actual impact
~~revolutionize~~ → "change" / "transform" / or be specific
~~empower~~ → "enable" / "let you" / "give you"

### Overexplaining
~~as you may know~~ → if they know, don't say it
~~it goes without saying~~ → then don't say it
~~needless to say~~ → then don't say it
~~as mentioned earlier~~ → if you wrote it well, they remember

### False Enthusiasm
~~Exciting!~~ / ~~Amazing!~~ / ~~Incredible!~~ / ~~Awesome!~~ — Hollow superlatives that mean nothing when used as standalone exclamations. Save genuine enthusiasm for when something is genuinely interesting, and express it through specific language about *why* it's interesting — not empty adjectives.

### Hedging / Weasel Words
~~arguably~~ → make the argument or don't
~~it could be said~~ → say it
~~some might say~~ → who? say it yourself or attribute it
~~it's worth noting that~~ → just note it

---

## 11. Anti-Patterns

Things I actively avoid and will flag in review:

- **No passive voice.** Active voice dominant. "We built this" not "this was built."
- **No filler transitions.** "In conclusion", "To summarize", "Moving on", "That being said" — delete all of these.
- **No generic motivational language.** "The possibilities are endless" — no they're not. Be specific.
- **No condescension.** Assume reader competence. Never "simply do X" (implies it's simple). Never "just" when describing a multi-step process.
- **No over-explanation.** If the reader is here, they have context. Trust them.
- **No explaining references.** If you use an Alien quote, don't add "(from the 1979 film Alien)."
- **No "utilize."** The word is "use."
- **No "leverage" as a verb.** The word is "use." (Seeing a pattern?)

---

## 12. Grammar & Mechanics Reference

| Element | My Style |
|---------|-----------|
| Oxford comma | Always |
| Italics | Emphasis on individual words |
| Bold | Key phrases, list labels |
| Em dash | Parenthetical thoughts (—) |
| Semicolons | Used frequently and correctly |
| Fragments | Intentional, for punch |
| Conjunction starts | But, And, Or at sentence start = fine |
| Contractions | Yes, always (don't, isn't, you'll, we've) |
| Numbers | Spell out one–nine, numerals for 10+ |
| Acronyms | Define on first use, then abbreviate |

---

## 13. Before/After Calibration

These examples show the difference between generic tech writing and what I'm going for.

### Example 1: Introducing a feature

**Generic**:
> In today's fast-paced development landscape, it's important to note that testing voice applications can be challenging. We're excited to announce a robust new tool that seamlessly integrates with your existing workflow to empower developers to leverage synthetic data for comprehensive testing.

**Mine**:
> You've built a Twilio Voice application with all the best practices. Conference webhooks triggering downstream workflows. Conversational Intelligence Language Operators analyzing sentiment. Event Streams piping data to Segment. Everything's architected perfectly. *But how do you test it?*

### Example 2: Explaining a technical concept

**Generic**:
> The jitter buffer is a critical component that plays an important role in ensuring audio quality. It's worth noting that network conditions can vary significantly, and the buffer helps to smooth out these inconsistencies to deliver a seamless experience.

**Mine**:
> Twilio Conference uses a jitter buffer to smooth out irregularity in media packet arrival times when mixing audio for conference participants. This buffer results in fewer audio artifacts, but introduces a fixed delay. If a participant suffers from extremely high jitter — commonly seen on WiFi networks — the buffer swells to compensate, causing their media to be significantly delayed. Once the jitter buffer has grown, it will not shrink. Even if the jitter is eliminated. At sizes greater than ~250ms, participants perceive it as latency.

### Example 3: Transitioning between sections

**Generic**:
> Now that we've explored the dashboard features, let's dive into the exciting world of API integration. It's important to understand that...

**Mine**:
> REST APIs are great, we love them here at Twilio. APIs are kind of *our thing*. However, at scale and across potentially dozens of endpoints, the venerable HTTP REST API starts to show its age a little bit.

---

## Author Bio (Standard)

> *Michael Carpenter (aka MC) is a telecom API lifer who has been making phones ring with software since 2001. As a Product Manager for Programmable Voice at Twilio, the Venn Diagram of his interests is the intersection of APIs, SIP, WebRTC, and mobile SDKs. He also knows a lot about Depeche Mode. Hit him up at mc (at) twilio.com or [LinkedIn](https://www.linkedin.com/in/mc8805/).*

---

## Quick Checklist

Before finalizing a piece, I verify:

- [ ] Does the opening paragraph hook immediately? (No throat-clearing)
- [ ] Is there at least one high-low lexicon juxtaposition per major section?
- [ ] Are there fragment sentences for emphasis?
- [ ] Are there rhetorical questions setting up key sections?
- [ ] Are abstract concepts grounded in physical metaphors?
- [ ] Are there parenthetical asides for humor?
- [ ] Is the sentence rhythm varied (long → short punch)?
- [ ] Do the closing lines use a signature phrase?
- [ ] Are all Cringe List words absent?
- [ ] Is the voice active, not passive?
- [ ] Would I actually say this out loud to a colleague?

If any answer is "no," revise. The last question is the ultimate test.
