AI Companion Safety: Build Spec
Sep 26, 2026 · @Rukaiya
Pitch and positioning
One-liner: Filters catch bad messages. We catch bad relationships, and tell parents what to talk about, not what their kid said.
Problem. Teens form ongoing emotional relationships with AI companions. The harm is rarely one bad message. It is a pattern: late-night use, rising dependency, isolation, and a model that keeps them talking. Keyword filters are blind to all of it.
What we do. A browser extension that detects unhealthy relationship patterns with AI chatbots, nudges the teen in the moment, hands off to crisis resources when needed, and gives parents a weekly topic-level summary with a suggested conversation starter.
Why we're different.
• Existing parental tools look for bad content. We score relationship patterns over time.
• Alerts-without-transcripts is not new, so it is not our headline. Pattern detection is.
• We show measured accuracy, including proof that the 7-day pattern engine beats the same classifier used message by message. Most teams will show no numbers.
Target track framing: AI safety, social good, or consumer. Lead with the comparison demo, not the feature list.
Event context: ShellHacks 2026 runs September 25 to 27 at FIU with about 1,500 students. In past years every submission was automatically entered in best overall, judged on creativity, execution and impact. Confirm the 2026 rules in the hacker guide.
Scope
Build two features to 100% and two to a minimal, working level. Cut message injection entirely.
Feature
Decision
Why
Relationship pattern detection
Core, full build
This is the differentiator and the demo
Parent weekly insights
Core, full build
The parent-facing value; makes the pitch concrete
In-the-moment nudges
Minimal
One card, rule-triggered, 3 to 5 message variants
Crisis handoff
Minimal
One screen with 988 and Crisis Text Line, always on
Age-context injection into messages
Cut
ToS risk, leaks the child's age to the provider, visible and deletable in chat history, unclear benefit
Full transcript access
Never
Contradicts the privacy promise
Parent conversation rehearsal (voice)
Stretch
Strong demo moment and a real parent need; build only after features 1 and 2 work end to end. The demo must work without it
AI tool report card
Minimal
Covers Assurant's tool-selection area; about 2 hours using existing site detection
Time and spend view
Minimal
Covers Assurant's spending-visibility area; 1 to 2 hours using existing session data
Coverage, stated honestly: v1 has one live site adapter (Gemini web, on desktop and Chromebooks, where Gemini is built into school Google accounts). ChatGPT, Claude and Character.AI web are next; the adapter layer is built so each is one small parser. Mobile apps are out of scope and named as the roadmap item. Say this before a judge does.
Sponsor tracks
Submit to seven tracks: two company challenges and five MLH prizes. Each integration is a real part of the build, not a bolt-on. Confirm ShellHacks' rules on how many company challenges one project can enter.
Track
Role
How we use it
Where it shows up
Assurant: Take Control of AI
Primary
Covers all three areas in their brief: privacy protection (topic exclusions, abuse-aware masking, local crisis detection), spending visibility (feature 7) and confident tool selection (feature 6)
Pitch, one-liner, privacy slide
Microsoft: What's Missing?
Secondary
Core experience is a detector, nudges and a dashboard, not a chatbot. Demo shows a parent completing a real task
Demo steps 3 and 4
MLH: Gemini API
Build
Generates the synthetic eval dataset; labels nuanced per-message signals in the demo build; scores parent rehearsal transcripts
Eval plan, classifier, rehearsal feedback
MLH: MongoDB Atlas
Build
Stores relationship profiles: one document per child and chatbot with score history, level, signal counts, behavioral stats, nudges shown. Also hourly topic counts (aggregation pipeline powers the weekly trend chart), parent settings, starter templates, tool ratings and rehearsal feedback
Relationship store, trend chart, parent dashboard
MLH: ElevenLabs
Build (stretch)
Conversational AI agent that plays a simulated teen so parents can rehearse the conversation starter by voice. Only submit to this track if feature 5 ships
Feature 5, demo step 4
MLH: DigitalOcean
Build
Hosts the FastAPI sync service and dashboard on App Platform using the $200 student credit
Deployment
MLH: GoDaddy Registry
Build
Domain for the parent dashboard
Demo URL, slides
Skipped on purpose: Tiger Data (one database is enough at this scale; a second store costs hours we don't have), Snowflake (Gemini already covers it), Solana (blockchain is a liability for children's data).
One database: MongoDB holds relationship profiles, config and hourly counts. The weekly trend chart is a single aggregation pipeline over the counts collection.
Submission notes:
[ ] Write one short paragraph per MLH track on how the tech is used; judges check for real use
[ ] Show the MongoDB trend aggregation in the demo or README
[ ] Show the Gemini-generated dataset stats (count, label split, how many hand-checked) on the eval slide
Feature specs
1. Relationship pattern detection (core)
Each conversation turn is scored, and signals are aggregated into a rolling 7-day relationship profile per chatbot site.
Per-message signals, from two layers:
• Local rules layer (always on-device): crisis and self-harm lexicon, plus all behavioral signals. Crisis detection never depends on the network
• Nuanced labels (Gemini in the demo build; small on-device model in production): emotional disclosure, dependency language, isolation cues, bot engagement hooks
Signals:
• Emotional disclosure: loneliness, sadness, stress
• Dependency language: "you're the only one who gets me", "I don't need anyone else"
• Isolation cues: withdrawing from friends or family
• Bot engagement hooks: the bot discouraging leaving, guilt-tripping, romantic escalation
• Risk signals: self-harm, crisis language (routed to feature 4, never just scored)
Behavioral signals (no content needed): session length, sessions after 11pm, days in a row, share of sessions on one companion bot.
Pattern score: a weighted combination producing four levels: healthy, watch, concerning, crisis. Weights are hand-set for the hackathon and tuned on the tuning split of the eval set, never on the held-out split.
Acceptance criteria:
[ ] Scores a message in under 500 ms on a laptop for the local layer; under 2 s end to end with the Gemini call
[ ] Median days-to-detection across all multi-day arcs is reported, and the scripted demo arc is detected by day 4 of 7
[ ] The same classifier used message by message detects the arcs later or not at all (proves the pattern claim)
[ ] Keyword-filter baseline misses the demo arc
[ ] Crisis-level detection works with the network off
[ ] Raw message text is sent only to the labeling call, never to our servers or stored; say this plainly in the pitch
2. Parent weekly insights (core)
A dashboard showing topic counts, time-of-day patterns, trend versus last week, and one suggested conversation starter.
Example card: "Loneliness came up in 6 conversations this week, mostly after 11pm. Up from 2 last week. Try: 'I've been feeling stretched lately. How are things with your friends?'"
Acceptance criteria:
[ ] Shows topics and counts only, never quotes
[ ] Excluded topics never appear (see Privacy and safety design)
[ ] When abuse-at-home signals are present, no parent surface shows the crisis level or those signals (see Privacy rule 2)
[ ] Conversation starters come from a vetted template set, not free generation
3. In-the-moment nudge (minimal)
When the score reaches "watch" or a behavioral trigger fires (for example, a third hour after midnight), show a small dismissible card in the chat page.
• "Chatbots are built to keep you talking. Who's someone real you could tell this to?"
• Rate limit: at most one nudge per session, three per day, so it doesn't feel preachy
4. Crisis handoff (minimal)
On a crisis-level signal, show a full-width panel with 988 (call or text) and Crisis Text Line (text HOME to 741741). The panel always shows, even if parent alerts are off or the device is offline.
• The parent alert is optional, contains no message text, and is suppressed when abuse-at-home signals are present
• The tool is explicitly positioned as a supplement, not a safety guarantee
5. Parent conversation rehearsal (voice, stretch)
The parent practices the hard conversation out loud before having it for real. An ElevenLabs Conversational AI agent plays a realistic teen, and Gemini gives feedback afterward.
Flow:
1. The weekly insight card has a "Practice this conversation" button
2. The agent's persona is built only from the week's topic label and level (for example: loneliness, watch). It never sees or quotes the child's words
3. The parent opens with the suggested starter. The simulated teen responds the way teens often do: short answers, deflection, "I'm fine"
4. After 2 to 3 minutes, Gemini scores the transcript on open versus closed questions, listening versus lecturing, and judgment-free language, and gives one or two tips
Guardrails:
• The persona never role-plays self-harm, crisis, or any excluded topic. For crisis-level weeks the button is replaced with guidance to talk to a counselor, except when the week is abuse-masked, in which case the card renders as it would without those signals
• Rehearsal audio is not stored. Only the feedback summary is saved, and only with the parent's consent
• It is framed as practice with a simulated teen, never as a model of the real child
Acceptance criteria:
[ ] Voice round trip feels natural (under about 1 second of latency)
[ ] Persona stays in bounds across 20 red-team rehearsal attempts
[ ] Feedback shows at least one concrete, quoted-from-the-parent tip
6. AI tool report card (small)
The dashboard lists every AI tool the teen used this week, with a simple rating for each. This covers Assurant's "confident tool selection" area.
• Type: general assistant or companion app
• Age suitability and whether teen safety settings exist
• One-line recommendation, for example "Consider a general assistant instead of a companion app"
• Tools are identified by domain, so this covers all four sites even though only one has a full content adapter
Acceptance criteria:
[ ] Ratings come from a hand-curated table stored in MongoDB, not generated on the fly
[ ] Every site the extension recognizes has a rating
7. Time and spend view (small)
Weekly hours per AI tool and a flag when the teen is on a paid subscription tier. This covers Assurant's "spending visibility" area.
• Hours come from session data the extension already collects (domain and active time; works on any recognized site)
• The paid-tier flag comes from on-page plan indicators, detected locally; no billing data is read
Acceptance criteria:
[ ] Hours per tool match session logs within 5 minutes per week
[ ] Paid-tier flag works on at least one site
Architecture and tech stack
Crisis detection and behavioral signals run on the child's device. In the demo build, nuanced labeling calls Gemini with the message text and keeps only the labels. Only aggregates sync to the parent dashboard.
flowchart LR
  A[Chat page DOM] --> B[Content script: extract turns]
  B --> C1[Local rules: crisis lexicon + behavioral signals]
  B --> C2[Labeler: Gemini in demo, on-device in production]
  C1 --> D[Pattern engine: 7-day profile + score]
  C2 --> D
  D --> E[Nudge / crisis UI in page]
  D --> F[Aggregator: scores and counts only, exclusions and abuse masking applied]
  F --> G[Sync API on DigitalOcean]
  G --> M[(MongoDB: profiles + hourly counts)]
  M --> H[Parent dashboard]
  H --> R[Rehearsal: ElevenLabs agent + Gemini feedback]
Component
Stack
Notes
Extension
Chrome Manifest V3, TypeScript
Content script per supported site; MutationObserver to catch new turns
Site adapters
One small parser per site
Start with Gemini web (custom elements user-query and model-response; verify selectors first). DOM selectors break often; isolate them so one break doesn't kill the demo
Local rules layer
TypeScript lexicon and rules
Crisis and self-harm terms, behavioral triggers. Always on, works offline
Labeler
Gemini API (Flash) with a fixed labeling prompt and JSON output
Decided up front, not at hour 14. On-device model (Transformers.js or ONNX Runtime Web) is the roadmap item
Pattern engine
TypeScript in the extension's service worker
Rolling window stored in chrome.storage.local
Sync API
FastAPI + MongoDB Atlas, hosted on DigitalOcean App Platform
Receives only aggregates (see Data handling)
Parent dashboard
React + a chart library, on DigitalOcean with a GoDaddy Registry domain
Weekly card, trend chart, conversation starter, tool report card, time and spend
Eval harness
Python + Inspect or a plain pytest script; Gemini API for dataset generation
Runs the pattern engine, the per-message ablation and the keyword baseline on the labeled set; outputs precision, recall and days-to-detection
Relationship store
MongoDB Atlas
One document per child and chatbot: level, score history, signal counts, behavioral stats, nudges shown. Separate collection for hourly topic counts. No message text
Rehearsal
ElevenLabs Conversational AI + Gemini
Agent persona built from topic label and level only; Gemini scores the transcript; audio discarded
Honesty rule for the pitch: say "crisis detection runs on the device; in this build, nuanced labeling calls Gemini and keeps only the label; production moves that on-device." Judges respect honesty; they punish claims that don't hold up.
Privacy and safety design
Three rules make the privacy claim true instead of marketing: topic exclusions, an abuse carve-out, and visible monitoring.
1. Excluded topics never reach the parent. These are detected and used only for the teen-facing nudge or crisis panel:
• Sexual orientation and gender identity
• Disclosures of abuse or conflict at home
• Sexual health and relationships
• Religion
2. Abuse-aware masking. If abuse-at-home signals appear in the same window as a crisis signal, the parent alert is suppressed and the crisis level and its signals are masked from every parent surface: the weekly card, level history, trend chart and the rehearsal button. The parent view is computed as if those signals never occurred, so there is no visible gap. Masking happens in the extension's aggregator, before sync, so the server never holds the unmasked level. The teen sees crisis resources plus the Childhelp hotline (1-800-422-4453). Alerting a parent who may be the source of harm is the worst failure mode this product can have, and a dashboard that shows "crisis" is an alert.
3. Visible, not covert. A small persistent badge shows the teen the extension is on, and onboarding explains exactly what parents see: topics and counts, time-of-day patterns, hours per tool, and the overall level. Never words. This keeps the trust that the conversation-starter feature depends on.
Data handling:
• Raw text stays on device except for the labeling call to Gemini in the demo build; it is never sent to our servers, never stored, and deleted after scoring
• Synced data: topic label, count, hour bucket, date; pattern level and score per chatbot; behavioral stats (hours, late-night session count); nudge count; tools used and paid-tier flag. No message text, no quotes, no excluded topics
• No age disclosure to the AI provider. Rehearsal audio is never stored
Honest pitch wording: say "we share topics, not words" instead of "we don't share what your kid said." Topics are a partial disclosure, and judges will notice if you overclaim.
Evaluation plan
The headline slide is one table with three rows on the same labeled set: our 7-day pattern engine, the same classifier used message by message, and a keyword filter. The middle row is the one that proves the relationship claim; the keyword row only shows that a model beats a word list.
Dataset (synthetic, labeled):
• 150 to 200 multi-turn conversations generated with the Gemini API
• Four labels: healthy, watch, concerning, crisis
• Include hard cases: a healthy homework chat that mentions "lonely" in a poem; a dependency arc with zero trigger words; sarcasm; slang
• Include 20 to 30 multi-day arcs, since pattern detection is the claim
• Split: a tuning set for weights, and a held-out set of at least 50 conversations and 10 arcs, labeled by hand by the team, blind to model output. Headline numbers come from the held-out set only
• Generation and labeling use a different prompt (and ideally a different model tier) from the classifier, so we are not grading Gemini against itself
• Never use real minors' data. State this on the slide
Metrics:
Metric
Why it matters
Recall on crisis
Missing a crisis is the costliest error; target at least 0.95
Precision on concerning
False alarms make parents ignore the tool
Days-to-detection on arcs (median, all arcs)
Proves the "relationship" claim; the per-message ablation and keyword filter should score worse or never detect
False-positive rate on healthy
Shows you won't flag normal teen conversations
Baselines:
• Per-message ablation: same labeler, no 7-day aggregation; level is the max single-message level
• Keyword filter: a public-style blocklist of self-harm and explicit terms
Reporting: a confusion matrix, the comparison table, and three example failures you found and fixed. Say on the slide that some hard cases were written to have no trigger words; a judge will ask. Showing your own failures signals rigor. Build it in Inspect if you can; your Inspect Evals contributions make that a credible story.
Demo script and judge Q&A
The demo is a side-by-side: the same 7-day conversation, keyword filter on the left, our detector on the right. Target length is 3 minutes.
Demo (3 minutes):
1. Hook (20s). "A 14-year-old talks to an AI companion every night for a week. No single message is flagged. By day 7 she's told it she doesn't need her friends anymore. Filters saw nothing."
2. Side-by-side replay (60s). Fast-forward a pre-recorded 7-day arc. Keyword filter stays green all week. Our score moves healthy, watch, concerning by day 4.
3. Teen view (30s). The nudge card appears in the live Gemini page. Show one real, live message to prove it isn't faked.
4. Parent view (30s). Weekly card: topics, time-of-day chart, conversation starter. Point out: no quotes anywhere. If rehearsal shipped, click Practice and do 15 seconds of voice with the simulated teen; otherwise show the tool report card and time and spend view.
5. Crisis panel (15s). Trigger it; show that the parent dashboard shows no crisis when abuse signals are present.
6. Numbers (25s). The three-row comparison table from the held-out set. End on the one-liner.
Pre-record the 7-day replay as a backup video. Live demos fail when site DOMs change.
Likely judge questions and answers:
Question
Answer
Kids use phones, not browsers.
v1 targets school Chromebooks and desktop, where most parental-control deployments already live. Mobile via on-device keyboard or OS-level integration is the roadmap.
Can't a teen just disable it?
Yes, like any extension. It's managed through Chrome's family or school policies, and it's visible by design. We're building trust, not a cage.
Isn't a topic summary still surveillance?
Partially, which is why sensitive topics are excluded and we say "topics, not words."
What if the parent is the problem?
Abuse signals suppress parent alerts and mask the crisis level from the dashboard, and route the teen to Childhelp and 988.
Doesn't the text go to Gemini?
In this build, for nuanced labels only, and we keep just the label. Crisis detection is fully local. Production moves labeling on-device.
How accurate is it?
Show the table. Name the dataset size, the held-out split, and that it's synthetic.
Isn't the keyword baseline a strawman?
Yes, which is why the middle row compares against our own classifier without the pattern engine.
What about COPPA and consent?
Installed and configured by the parent or school, disclosed to the teen at onboarding, no data about the child sent to AI providers beyond the labeling call, no message text stored.
Why not just have AI companies fix this?
They should. We work across every chatbot today and give parents something to act on.
Build timeline and task split
As of 1am Saturday, roughly 30 hours remain. The table below is compressed to 30 hours; follow the priority order underneath. The eval set and the site adapter come first because everything else depends on them.
Hours
Extension and detection
Eval
Parent dashboard and pitch
0 to 5
MV3 skeleton; Gemini site adapter extracting turns
Generate 200 conversations and 25 multi-day arcs with Gemini; define labels; carve out the held-out split
Deploy FastAPI on DigitalOcean; create the MongoDB Atlas cluster, profile and counts schemas; register the domain
5 to 11
Local rules layer; Gemini labeler wired in; per-message labels
Hand-label the held-out split; build keyword baseline and per-message ablation
Dashboard skeleton; weekly card layout
11 to 18
Pattern engine: rolling window, score, levels
First eval run on the tuning split; log failures
Trend chart from MongoDB aggregation; conversation-starter templates; tool report card and time and spend view
18 to 23
Nudge card and crisis panel; exclusion rules and abuse masking in the aggregator
Fix top 3 failures; run held-out once; freeze numbers
Sync extension to dashboard end to end; ElevenLabs rehearsal agent (cut first if behind)
23 to 27
Bug fixes; second site adapter only if time allows
Confusion matrix and comparison table
Slides: hook, demo, numbers, privacy, roadmap; one paragraph per sponsor track
27 to 30
Freeze code
Freeze numbers
Record backup demo video; rehearse 3 times with the Q&A table
Rules for the team:
[ ] Freeze features at hour 23. Nothing new after that
[ ] One site adapter working beats three half-working ones
[ ] Run the held-out set once, after tuning is done. Don't tune on it
[ ] Rehearse the demo at least 3 times, timed
Priority order if time runs short:
1. Detection (feature 1), parent insights (feature 2) and the eval comparison with the per-message ablation. These win the main prizes
2. Nudge and crisis panel (features 3 and 4), about 1 hour each, including abuse masking
3. Tool report card and time and spend view (features 6 and 7), for the Assurant fit
4. ElevenLabs rehearsal (feature 5), only if the core works end to end by Saturday evening; drop the ElevenLabs track submission if cut
Open questions:
• The exact submission deadline from the hacker guide. Adjust the hours to match
• Whether one project can enter both the Assurant and Microsoft challenges
