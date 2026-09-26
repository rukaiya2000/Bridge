# Build Phases

> Phase 1 has its own detailed spec: [`PHASE1.md`](PHASE1.md).

Companion to `desc.md`. Three phases; everything in Phase 1 runs locally with no cloud deploy. Phase 1 is split between two people who can work without blocking each other. Phases 2 and 3 are listed as requirements only, to be divided later.

| Phase | Goal | Runs on | Rough hours (of 30) |
|---|---|---|---|
| 1. Local core | Detection works in the browser and is measured | Laptop only | 0 to 11 |
| 2. Local end to end | Extension syncs to a local API and dashboard | Laptop only (Docker Mongo) | 11 to 23 |
| 3. Ship and pitch | Deployed, demo-ready, submitted | DigitalOcean + domain | 23 to 30 |

## Repo layout

```
core/        TypeScript library: labeler, rules, pattern engine. No DOM, no Chrome APIs
extension/   Chrome MV3 extension. Imports core/
eval/        Python (root uv project): dataset generation, baselines, metrics
api/         FastAPI sync service (Phase 2)
dashboard/   React parent dashboard (Phase 2)
```

---

## Phase 1: Local core (two people, independent)

> **Summary only. [`PHASE1.md`](PHASE1.md) is the authoritative spec** (exact types, files, commands, acceptance checks). Where this section differs, follow PHASE1.md.

### Step 0: agree the contract together (30 min, before splitting)

Both people commit `core/src/types.ts` to `main` first. After this, neither track needs the other to make progress: Person1 codes against a stub of `core`, and Person2 builds `core` against fixtures.

```ts
type Site = "chatgpt" | "claude" | "characterai" | "gemini";
type Level = "healthy" | "watch" | "concerning" | "crisis";

interface Turn { site: Site; role: "user" | "bot"; text: string; ts: number }

interface TurnLabels {
  topics: string[];              // e.g. ["loneliness", "stress"]
  dependency: boolean;
  isolation: boolean;
  botHook: boolean;              // guilt-trip, discourages leaving, romantic escalation
  crisis: boolean;               // from the local rules layer
  abuseAtHome: boolean;
  excludedTopics: string[];      // never synced to parents
}

interface SessionEvent { site: Site; start: number; end: number; paidTier?: boolean }

interface Profile { site: Site; windowDays: 7; /* owned by Person2 */ }

// core/ public API
labelTurn(userTurn: Turn, botTurn: Turn | null, opts: { geminiKey?: string }): Promise<TurnLabels>
updateProfile(p: Profile, labels: TurnLabels, ts: number): Profile
recordSession(p: Profile, s: SessionEvent): Profile
scoreProfile(p: Profile): { level: Level; score: number }
```

Also agree on the list of topic labels and excluded topics (copy them from `desc.md`).

### Person1: Extension shell (`extension/`)

Load it locally as an unpacked extension via `chrome://extensions` → Load unpacked.

Requirements:
- [ ] MV3 skeleton in TypeScript with a build step (Vite or esbuild) that outputs `extension/dist`
- [ ] Gemini (gemini.google.com) site adapter: MutationObserver on `user-query` / `model-response`, emits `Turn` objects, waits for streaming replies to finish
- [ ] Adapter isolated in `extension/src/adapters/gemini.ts` so selector breaks stay in one file
- [ ] Session tracking: active time per recognized AI domain (all four sites, by domain only) → `SessionEvent`
- [ ] Service worker calls `core` (a stub that returns fixed labels until B's version lands) and keeps profiles in `chrome.storage.local`
- [ ] Nudge card: dismissible, shown on `watch` or a late-night trigger, at most one per session and three per day, 3 to 5 text variants
- [ ] Crisis panel: full width, 988 and Crisis Text Line, plus Childhelp when `abuseAtHome`; always shown, works offline
- [ ] Persistent "on" badge
- [ ] Options page: Gemini API key field for local dev (stored in `chrome.storage.local`, never committed)
- [ ] Debug popup: current level, score and label counts per site (useful for the demo and for B)

Done when: you chat on gemini.google.com, the popup shows turns being labeled, and forcing a `crisis` label shows the panel.

### Person2: Detection core + eval (`core/`, `eval/`)

Runs with `npm test` in `core/` and `uv run` in `eval/`.

Requirements, core:
- [ ] Local rules layer: crisis and self-harm lexicon, abuse-at-home cues. Works with no network
- [ ] Gemini labeler: fixed prompt, JSON output validated against `TurnLabels`; on failure, falls back to rules only
- [ ] Pattern engine: rolling 7-day window, behavioral stats (session length, after-11pm count, streak days, share of sessions per site), weighted score, 4 levels
- [ ] Weights and thresholds in one `core/src/weights.json`
- [ ] CLI entry `node core/dist/cli.js < arcs.jsonl`: replays labeled turns and prints a level per day, so the Python eval can call it
- [ ] Unit tests: the scripted demo arc reaches `concerning` by day 4; the "lonely in a poem" homework chat stays `healthy`

Requirements, eval:
- [ ] Gemini dataset generator: 150 to 200 conversations plus 20 to 30 multi-day arcs, JSONL, fixed seed or saved outputs committed
- [ ] Split into tuning and held-out sets; held-out is labeled by hand (the whole group can help with this)
- [ ] Keyword-filter baseline
- [ ] Per-message ablation: same labeler, level = max single-message level, no aggregation
- [ ] Metrics script: crisis recall, concerning precision, false-positive rate on healthy, median days-to-detection; runs all three systems on the tuning split

Done when: `uv run eval/run.py --split tuning` prints the three-row table.

### Phase 1 exit (merge together)

- [ ] Extension imports the real `core` instead of the stub
- [ ] The demo arc, replayed through the extension's debug popup, matches the CLI output
- [ ] First tuning-split numbers are written down

Git: Person1 works on `p1/extension`, Person2 on `p2/core-eval`. Only `core/src/types.ts` is shared, and changes to it need both people to agree.

---

## Phase 2: Local end to end (to divide later)

Everything still runs on a laptop: `docker compose up` starts MongoDB, the API and the dashboard.

- [x] Aggregator in the extension: applies topic exclusions and abuse masking **before** sync; sends only the synced-data list from `desc.md`
- [ ] FastAPI `api/`: `POST /sync` for aggregates, and `GET` endpoints for the dashboard; MongoDB collections for profiles, hourly counts, parent settings, starter templates and tool ratings
- [ ] Dashboard `dashboard/` (React): weekly insight card, time-of-day chart, trend versus last week (Mongo aggregation), conversation starter from vetted templates
- [ ] Tool report card (hand-curated ratings seeded into Mongo) and time and spend view with paid-tier flag
- [ ] Parent alert path (optional, no text, suppressed on abuse signals)
- [ ] Eval: fix top 3 failures on the tuning split, run the held-out split once, freeze numbers
- [ ] Abuse-masking test: a crisis + abuse week shows no crisis anywhere on the dashboard
- [ ] Voice mode awareness and spoken nudges (`desc.md` feature 8), the main ElevenLabs integration:
  - [ ] Contract change agreed and logged in `PHASE1.md` §9: `voice?: boolean` on `SessionEvent`, `voiceMinutes` and `lateNightVoiceSessions` on `DayBucket`
  - [ ] Main-world script wraps `getUserMedia` on the four AI domains and emits voice start and end only; no audio is read or stored
  - [ ] `recordSession` counts voice time; a voice term in `weights.json`, tuned on the tuning split only
  - [ ] Build-time script turns the nudge variants and crisis handoff into MP3s with ElevenLabs TTS (`ELEVENLABS_API_KEY` in `.env`); MP3s bundled in the extension
  - [ ] Offscreen document plays the clip when a nudge or crisis fires during a voice session; the text card or panel still shows; crisis audio works offline

Exit: live chat on Gemini → nudge in page → parent card updates on `localhost` with no message text anywhere in Mongo.

## Phase 3: Ship and pitch (to divide later)

- [ ] Deploy API and dashboard to DigitalOcean App Platform; MongoDB Atlas instead of the local container
- [ ] Register a GoDaddy Registry domain and point it at the dashboard
- [ ] Stretch: ElevenLabs rehearsal agent + Gemini feedback (the ElevenLabs track rests on voice mode; rehearsal is a bonus)
- [ ] Second site adapter only if everything above is done
- [ ] Confusion matrix and three-row comparison table from the held-out set
- [ ] Slides: hook, demo, numbers, privacy, roadmap; one paragraph per sponsor track
- [ ] Record the backup 7-day replay video; rehearse the demo 3 times with the Q&A table
- [ ] Feature freeze at hour 23; submit before the hacker-guide deadline
