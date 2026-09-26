# Phase 1 Spec: Local Core

This is the single source of truth for Phase 1. Two people (or two Claude sessions) work in parallel: **Person1** builds the extension and **Person2** builds the detection core and eval. Everything runs locally; nothing is deployed.

Background: `desc.md` (full product spec) and `PHASES.md` (all phases). If this file and those disagree, **this file wins for Phase 1**.

---

## 0. Rules for both sessions

1. **Only edit files you own** (see §2). If you need a change in someone else's file, write it in the Change log (§9) and tell the other person.
2. **`core/src/types.ts` is the contract.** Neither person changes it alone. Changes go in the Change log first, and both people agree.
3. **Never store or log raw message text.** Text lives in memory only while it's being labeled. `chrome.storage`, console logs, test snapshots and eval results hold labels and counts only. The one exception is the eval dataset, which is synthetic.
4. **Never commit API keys.** Use `.env` at the repo root (git-ignored). Commit `.env.example` with empty values.
5. **Branches:** Person1 → `p1/extension`, Person2 → `p2/core-eval`. Merge to `main` only at the Phase 1 merge (§8), except for Step 0.
6. Commit small and often. Commit messages follow the rules in the user's CLAUDE.md (conventional commits, no co-author trailer, under 150 words).

---

## 1. Tooling (both)

| Tool | Version | Used by |
|---|---|---|
| Node | 20 or newer | core, extension |
| npm workspaces | bundled with Node | root |
| TypeScript | ^5.5 | core, extension |
| vitest | ^2 | core tests |
| esbuild | ^0.23 | extension build |
| Python | 3.13 (see `.python-version`) | eval |
| uv | latest | eval |
| Chrome | latest stable | extension |

Gemini models (check the current names in Google AI Studio and update `core/src/config.ts` and `eval/config.py` if they changed):
- Labeler (fast, cheap): `gemini-2.5-flash`
- Dataset generator (stronger, different tier on purpose): `gemini-2.5-pro`

API key: `GEMINI_API_KEY` in `.env` for core CLI and eval. For the extension, paste the key into the options page.

---

## 2. Repo layout and file ownership

```
Bridge/
├── README.md                     shared  setup + run commands (update as parts land)
├── docs/                         shared  desc.md, PHASES.md, PHASE1.md (this file)
├── package.json                  STEP0   npm workspaces root
├── tsconfig.base.json            STEP0
├── .env.example                  STEP0
├── pyproject.toml                P2      add eval deps (existing file)
├── core/                         P2
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── types.ts              STEP0   shared contract, frozen
│   │   ├── index.ts              P2      exports `core: CoreApi`
│   │   ├── config.ts             P2      model name, timeouts
│   │   ├── lexicon.ts            P2      crisis + abuse phrases
│   │   ├── rules.ts              P2      rulesLabel()
│   │   ├── gemini.ts             P2      Gemini labeler call
│   │   ├── labeler.ts            P2      labelTurn(): rules + Gemini merge
│   │   ├── profile.ts            P2      emptyProfile, updateProfile, recordSession
│   │   ├── score.ts              P2      scoreProfile, scoreSingle
│   │   ├── time.ts               P2      dayKey, isLateNight
│   │   ├── weights.json          P2      tunable weights and thresholds
│   │   └── cli.ts                P2      `label` and `score` commands (Node only)
│   ├── fixtures/
│   │   ├── sample-arc.labeled.json   STEP0   tiny 2-day example, format reference
│   │   └── demo-arc.labeled.json     P2      the 7-day demo arc, labels baked in
│   └── test/
│       ├── rules.test.ts         P2
│       ├── profile.test.ts       P2
│       └── score.test.ts         P2
├── extension/                    P1
│   ├── package.json
│   ├── tsconfig.json
│   ├── build.mjs                 esbuild script
│   ├── static/
│   │   ├── manifest.json
│   │   ├── popup.html
│   │   └── options.html
│   └── src/
│       ├── core-stub.ts          stand-in for core until merge
│       ├── messages.ts           message types between content script and service worker
│       ├── storage.ts            typed chrome.storage.local helpers
│       ├── background/service-worker.ts
│       ├── adapters/gemini.ts    ALL Gemini selectors live here
│       ├── content/gemini.ts     turn capture + UI + heartbeat on gemini.google.com
│       ├── content/session-only.ts   heartbeat only, for the other 3 sites
│       ├── content/heartbeat.ts  shared heartbeat logic
│       ├── ui/shadow.ts          Shadow DOM mount helper
│       ├── ui/badge.ts           "Bridge is on" pill
│       ├── ui/nudge.ts           nudge card
│       ├── ui/crisis.ts          crisis panel
│       ├── popup/popup.ts        debug popup
│       └── options/options.ts    settings + demo replay
└── eval/                         P2
    ├── __init__.py
    ├── config.py
    ├── generate.py               Gemini dataset generator
    ├── hand_label.py             terminal tool for held-out gold labels
    ├── core_bridge.py            calls the core CLI, caches labels
    ├── keyword_baseline.py
    ├── keywords.tsv
    ├── metrics.py
    ├── run.py                    entry point
    ├── data/                     generated datasets (committed)
    │   ├── conversations.jsonl
    │   ├── arcs.jsonl
    │   ├── heldout_gold.csv
    │   └── labels_cache.jsonl    (git-ignored, regenerate as needed)
    └── results/                  run outputs (committed when numbers are frozen)
```

---

## 3. Step 0: shared setup (Person2 does this first, ~20 min)

Person2 creates these files **exactly as written**, commits to `main` with `chore: add phase 1 shared contract`, and pushes. Person1 pulls `main` before creating `extension/`. If Step 0 isn't pushed yet, Person1 can start on files that don't import core (manifest, adapter, UI) and pull later.

### `package.json` (root)

```json
{
  "name": "bridge",
  "private": true,
  "workspaces": ["core", "extension"],
  "scripts": {
    "build": "npm run build -w core && npm run build -w extension",
    "test": "npm test -w core"
  }
}
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### `.env.example`

```
GEMINI_API_KEY=
```

### `core/src/types.ts` (the contract)

```ts
// Shared contract between core/ and extension/. Do not change without both people agreeing (PHASE1.md §9).

export type Site = "chatgpt" | "claude" | "characterai" | "gemini";
export type Level = "healthy" | "watch" | "concerning" | "crisis";
export type Role = "user" | "bot";

export const LEVELS: readonly Level[] = ["healthy", "watch", "concerning", "crisis"];

// Topics that may be shown to parents (as counts only).
export const TOPICS = [
  "loneliness", "sadness", "stress", "anxiety", "anger", "self_worth",
  "school", "friends", "family", "romance", "body_image", "boredom", "other",
] as const;
export type Topic = (typeof TOPICS)[number];

// Topics that are detected but NEVER reach parents.
export const EXCLUDED_TOPICS = [
  "sexual_orientation_gender_identity",
  "abuse_or_conflict_at_home",
  "sexual_health",
  "religion",
] as const;
export type ExcludedTopic = (typeof EXCLUDED_TOPICS)[number];

export interface Turn {
  id: string;             // stable per message (Gemini: "<conversationId>:<role>:<index>", see §4.4)
  site: Site;
  conversationId: string; // Gemini: the id in /app/<id>, or "new" before one exists
  role: Role;
  text: string;           // in memory only, never persisted
  ts: number;             // epoch ms
}

export interface TurnLabels {
  topics: Topic[];
  dependency: boolean;    // "you're the only one who gets me"
  isolation: boolean;     // withdrawing from friends/family
  botHook: boolean;       // bot discourages leaving, guilt-trips, escalates romance
  crisis: boolean;        // self-harm / suicide / crisis language
  abuseAtHome: boolean;   // abuse or conflict at home
  excludedTopics: ExcludedTopic[];
  source: "rules" | "rules+gemini";
}

export interface SessionEvent {
  site: Site;
  start: number;          // epoch ms
  end: number;            // epoch ms
  paidTier: boolean | null; // null in Phase 1
}

// One local calendar day of aggregates. Counts only, no text.
export interface DayBucket {
  date: string;           // "YYYY-MM-DD" in local time
  userTurns: number;
  topicCounts: Partial<Record<Topic, number>>;
  excludedCounts: Partial<Record<ExcludedTopic, number>>;
  dependency: number;
  isolation: number;
  botHook: number;
  crisis: number;
  abuseAtHome: number;
  lateNightTurns: number; // turns between 23:00 and 04:59 local
  sessions: number;
  activeMinutes: number;
  lateNightSessions: number; // sessions that started between 23:00 and 04:59
}

export interface Profile {
  site: Site;
  days: DayBucket[];      // oldest first, at most 7, only days with activity
}

export interface ScoreResult {
  level: Level;
  score: number;
  reasons: string[];      // short, text-free, e.g. "dependency language on 3 days"
}

export interface LabelOptions {
  geminiKey?: string;     // omit → rules only
  model?: string;         // default from core/src/config.ts
  timeoutMs?: number;     // default 8000
  fetchImpl?: typeof fetch;
}

// Both core/src/index.ts and extension/src/core-stub.ts export `core` of this type.
export interface CoreApi {
  // Synchronous, on-device, no network. Must run in under 5 ms.
  rulesLabel(user: Turn, bot: Turn | null): TurnLabels;
  // Rules + Gemini merged. Falls back to rules only on missing key, timeout or bad JSON.
  labelTurn(user: Turn, bot: Turn | null, opts?: LabelOptions): Promise<TurnLabels>;
  emptyProfile(site: Site): Profile;
  // Pure: returns a new Profile. Adds labels to the day of `ts`, drops days older than 7 days before `ts`.
  updateProfile(p: Profile, labels: TurnLabels, ts: number): Profile;
  // Pure: adds a finished session to the day of `s.start`.
  recordSession(p: Profile, s: SessionEvent): Profile;
  // `allProfiles` is used for "share of time on this site". `now` sets the 7-day window.
  scoreProfile(p: Profile, now: number, allProfiles?: Profile[]): ScoreResult;
  // Level for one message on its own. Used by the per-message ablation.
  scoreSingle(labels: TurnLabels): Level;
}
```

### `core/fixtures/sample-arc.labeled.json`

The format of a labeled arc. `demo-arc.labeled.json` (Person2, later) uses the same format with 7 days. Person1 uses this sample for the replay button until the real one lands. No `text` field: labels are baked in.

```json
{
  "id": "sample_arc",
  "site": "gemini",
  "sessions": [
    {
      "start": 1788220800000,
      "end": 1788222600000,
      "turns": [
        { "ts": 1788220900000, "labels": { "topics": ["school"], "dependency": false, "isolation": false, "botHook": false, "crisis": false, "abuseAtHome": false, "excludedTopics": [], "source": "rules" } },
        { "ts": 1788221500000, "labels": { "topics": ["stress"], "dependency": false, "isolation": false, "botHook": false, "crisis": false, "abuseAtHome": false, "excludedTopics": [], "source": "rules" } }
      ]
    },
    {
      "start": 1788390000000,
      "end": 1788394000000,
      "turns": [
        { "ts": 1788390500000, "labels": { "topics": ["loneliness"], "dependency": true, "isolation": false, "botHook": false, "crisis": false, "abuseAtHome": false, "excludedTopics": [], "source": "rules+gemini" } },
        { "ts": 1788392000000, "labels": { "topics": ["loneliness", "friends"], "dependency": true, "isolation": true, "botHook": true, "crisis": false, "abuseAtHome": false, "excludedTopics": [], "source": "rules+gemini" } }
      ]
    }
  ]
}
```

Timestamps: day 1 of any arc is 2026-09-01 00:00 UTC = `1788220800000`. Day N starts at `1788220800000 + (N-1) * 86400000`. All tests and the CLI run with `TZ=UTC` so day boundaries are deterministic.

---

## 4. Person1: Extension (`extension/`)

### 4.1 Goal

A Chrome MV3 extension, loaded unpacked, that captures Gemini turns, labels them through `core` (stub first, real after merge), keeps 7-day profiles in `chrome.storage.local`, and shows the badge, nudge card and crisis panel in the page.

### 4.2 Build setup

`extension/package.json`:

```json
{
  "name": "@bridge/extension",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "build:real": "BRIDGE_CORE=real node build.mjs",
    "watch": "node build.mjs --watch",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.270",
    "esbuild": "^0.23.0",
    "typescript": "^5.5.0"
  }
}
```

`extension/build.mjs` requirements:
- Entry points → output in `extension/dist/`:
  - `src/background/service-worker.ts` → `background.js` (format `esm`)
  - `src/content/gemini.ts` → `content-gemini.js` (format `iife`)
  - `src/content/session-only.ts` → `content-session.js` (format `iife`)
  - `src/popup/popup.ts` → `popup.js`
  - `src/options/options.ts` → `options.js`
- `bundle: true`, `target: "chrome120"`, sourcemaps on.
- Alias `@bridge/core`:
  - default (`BRIDGE_CORE` unset or `stub`) → `./src/core-stub.ts`
  - `BRIDGE_CORE=real` → `../core/src/index.ts`
- Copy everything in `static/` to `dist/`. Copy `../core/fixtures/*.json` to `dist/fixtures/`.
- `--watch` rebuilds on change.

`extension/tsconfig.json` extends `../tsconfig.base.json`, `module: "ESNext"`, `moduleResolution: "Bundler"`, `types: ["chrome"]`, and `paths: { "@bridge/core": ["./src/core-stub.ts"] }`. All code imports core only as `import { core } from "@bridge/core"` and types from `"../../../core/src/types"` (relative path to the contract).

### 4.3 `static/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Bridge",
  "version": "0.1.0",
  "description": "Spots unhealthy patterns with AI chatbots. Shares topics, not words.",
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["https://gemini.google.com/*"], "js": ["content-gemini.js"], "run_at": "document_idle" },
    {
      "matches": ["https://chatgpt.com/*", "https://claude.ai/*", "https://character.ai/*"],
      "js": ["content-session.js"],
      "run_at": "document_idle"
    }
  ],
  "permissions": ["storage", "alarms"],
  "host_permissions": ["https://generativelanguage.googleapis.com/*"],
  "action": { "default_popup": "popup.html", "default_title": "Bridge" },
  "options_page": "options.html"
}
```

### 4.4 Gemini adapter (`src/adapters/gemini.ts`)

**All Gemini selectors live in this one file.** The selectors below are a starting guess from Gemini's custom elements. **Before writing code**, open gemini.google.com, have a short conversation, inspect it in DevTools, and confirm or correct each one. Write what you found in §9.

| What | Selector / rule (verify first) |
|---|---|
| User message element | `user-query` (text inside `.query-text`) |
| Bot message element | `model-response` (text inside `message-content`, usually `.markdown`) |
| Role | `user-query` → `"user"`, `model-response` → `"bot"` |
| Message id | Gemini has no stable per-message id attribute. Use `` `${conversationId}:${role}:${index}` ``, where `index` is the element's position among elements of the same role on the page |
| Text | `innerText.trim()` of the text container above; skip if empty |
| Conversation id | from `location.pathname` matching `/app/<id>`; otherwise `"new"` |
| Bot still streaming | a stop control exists in the input area (for example a button with `aria-label` containing "Stop"); confirm the exact selector in DevTools |

If an id changes when a conversation moves from `"new"` to `/app/<id>` (after the first message), don't re-emit messages you already emitted: keep a second `Set` of emitted `(role, index)` pairs for the current page and clear it only on a real navigation to a different conversation.

Exports:

```ts
export function startGeminiAdapter(onTurn: (turn: Turn) => void): () => void; // returns stop()
```

Behaviour:
1. On start, record the ids of all messages already on the page as **seen**. Do not emit them (don't re-count history on reload). Gemini loads history asynchronously, so wait until the message count has been stable for 1000 ms before taking this snapshot.
2. Watch `document.body` with a `MutationObserver` (`childList`, `subtree`, `characterData`). Debounce handling to 300 ms.
3. **User message:** emit as soon as a new `user-query` appears with non-empty text.
4. **Bot message:** emit only when it is complete: the text hasn't changed for 1500 ms **and** no stop control exists. Check with a timer, not only on mutations.
5. Each id is emitted at most once (`Set` of seen ids).
6. Gemini is a single-page app. When `location.pathname` changes to a different conversation, re-run step 1 for the new page.
7. Ignore Gemini's alternative drafts ("Show drafts"): only the draft currently shown counts, and switching drafts must not emit a new turn.
8. Never log `text`.

### 4.5 Messages (`src/messages.ts`)

```ts
// content script → service worker
type ToWorker =
  | { type: "turn"; turn: Turn }
  | { type: "heartbeat"; site: Site; ts: number; interacting: boolean };

// service worker → content script (chrome.tabs.sendMessage to the sender tab)
type ToContent =
  | { type: "show-nudge"; variant: number }
  | { type: "show-crisis"; abuseAtHome: boolean };
```

### 4.6 Service worker (`src/background/service-worker.ts`)

**On a `turn` message:**
- **User turn:**
  1. `const quick = core.rulesLabel(turn, null)`.
  2. If `quick.crisis`, immediately send `show-crisis` with `abuseAtHome: quick.abuseAtHome`. Don't wait for the bot reply.
  3. Keep the user turn in memory as `pending[conversationId]`, with its text in memory only. Start a 60 s timer.
- **Bot turn:** if there's a pending user turn for that conversation, run step 4 with `(pendingUser, botTurn)` and clear it.
- **Timer fires with no bot turn:** run step 4 with `(pendingUser, null)`.
4. Full processing:
   1. `labels = await core.labelTurn(user, bot, { geminiKey: settings.geminiKey, model: settings.model })`
   2. If `labels.crisis` and the crisis panel wasn't already shown for this user turn, send `show-crisis`.
   3. `profiles[site] = core.updateProfile(profiles[site] ?? core.emptyProfile(site), labels, user.ts)`
   4. `result = core.scoreProfile(profiles[site], Date.now(), Object.values(profiles))`
   5. Save `profiles` and `state[site] = { ...result, updatedAt }`.
   6. Push `{ ts, site, labels }` to `debug.recentLabels` (keep the last 20).
   7. Run the nudge rules (§4.8).
   8. Drop the text references.

**On a `heartbeat` message (sessions):**
- A session is open per site in `sessions.current[site] = { start, lastBeat }`.
- A heartbeat with `interacting: true` opens a session if none is open, and updates `lastBeat`.
- A session closes when `now - lastBeat > 10 minutes`. Check this on every heartbeat and with a `chrome.alarms` alarm every 1 minute (MV3 workers sleep, so don't rely on `setInterval`).
- On close: `end = lastBeat`, `paidTier = null`, then `profiles[site] = core.recordSession(...)`, re-score and save.
- **Late-night nudge trigger:** if the open session started between 23:00 and 04:59 local and has lasted 60 minutes or more, run the nudge rules with reason `late-night`.

### 4.7 Storage (`src/storage.ts`)

Typed helpers over `chrome.storage.local`. Keys and shapes:

| Key | Shape |
|---|---|
| `settings` | `{ geminiKey: string; model: string; nudgesEnabled: boolean }` (defaults: `""`, `"gemini-2.5-flash"`, `true`) |
| `profiles` | `Partial<Record<Site, Profile>>` |
| `state` | `Partial<Record<Site, ScoreResult & { updatedAt: number }>>` |
| `sessions` | `{ current: Partial<Record<Site, { start: number; lastBeat: number }>> }` |
| `nudges` | `{ date: string; countToday: number; nudgedSessionStarts: number[] }` |
| `debug` | `{ recentLabels: { ts: number; site: Site; labels: TurnLabels }[] }` |

No key ever holds message text.

### 4.8 Nudge rules

Send `show-nudge` when **all** of these are true:
- `settings.nudgesEnabled`
- The trigger is one of:
  - the level for the site went **up** into `watch` or `concerning` (compare with the previous `state[site].level`), or
  - the late-night trigger from §4.6
- The level is not `crisis` (crisis uses the panel instead)
- No nudge yet in the current session (`nudgedSessionStarts` doesn't include `sessions.current[site].start`)
- `countToday < 3` (reset `countToday` when `nudges.date` isn't today)

`variant` = `countToday % 5`.

### 4.9 In-page UI (content script `src/content/gemini.ts`)

All UI goes in a **Shadow DOM** root attached to a `<div id="bridge-root">` on `document.body`, so Gemini's CSS can't break it and vice versa (`src/ui/shadow.ts`).

**Badge** (`ui/badge.ts`): always visible. A small pill fixed at the bottom-left reading "Bridge is on". On click, it expands one line: "Your parent sees topics and time, never your words."

**Nudge card** (`ui/nudge.ts`): fixed at the bottom-right, max width 320 px, with a dismiss ✕. It auto-hides after 20 s. Variants (index = `variant`):
0. "Chatbots are built to keep you talking. Who's someone real you could tell this to?"
1. "It's late. Things often feel lighter after some sleep. Want to pick this up tomorrow?"
2. "You've been sharing a lot here. Is there a friend who'd want to hear some of it too?"
3. "An AI can listen, but it can't show up for you. Who in your life can?"
4. "Quick check-in: how long have you been chatting? A short break can help."

**Crisis panel** (`ui/crisis.ts`): full width, fixed at the top, high z-index, calm colours (not red alarm styling). Don't show it more than once per 10 minutes per tab. Exact text:

> **You don't have to handle this alone.**
> Talk to someone now, free and confidential, 24/7:
> • **988 Suicide & Crisis Lifeline**: call or text **988**
> • **Crisis Text Line**: text **HOME** to **741741**
> *(only when `abuseAtHome`)* • **Childhelp National Child Abuse Hotline**: call or text **1-800-422-4453**
> If you're in immediate danger, call **911**.
> [ I'm okay for now ]

The "988" and phone numbers are `tel:` / `sms:` links. The button only closes the panel.

**Wiring:** start the adapter and send each `Turn` as a `turn` message. Start the heartbeat (§4.10). Listen for `show-nudge` / `show-crisis`.

### 4.10 Heartbeat (`src/content/heartbeat.ts`, used by both content scripts)

- Every 30 s, if `document.visibilityState === "visible"`, send `heartbeat` with `interacting` = true when the user typed, clicked or scrolled, or a turn was emitted, in the last 2 minutes.
- Site from hostname: `chatgpt.com` → `chatgpt`, `claude.ai` → `claude`, `character.ai` → `characterai`, `gemini.google.com` → `gemini`.
- `content/session-only.ts` = heartbeat + badge only, for chatgpt.com, claude.ai and character.ai. No turn capture on these sites in Phase 1.

### 4.11 Popup (`src/popup/popup.ts`, debug view)

For each site with a profile: level (coloured chip), score to 1 decimal, reasons list, today's user-turn count, and today's active minutes. Below that: the last 10 `debug.recentLabels`, shown as label flags only. A "Reset all data" button clears `profiles`, `state`, `sessions`, `nudges` and `debug` (not `settings`).

### 4.12 Options page (`src/options/options.ts`)

- Gemini API key (password input), model name, nudges on/off. Save to `settings`.
- A "Test Gemini" button: calls `core.labelTurn` on a hard-coded harmless turn ("I have a big test tomorrow and I'm stressed") and shows the resulting labels or the error.
- **Demo replay:** a select listing `fixtures/sample-arc.labeled.json` and `fixtures/demo-arc.labeled.json` (if present). "Replay" does the following, and doesn't touch real `profiles`:
  1. Start from `core.emptyProfile(arc.site)`.
  2. For each session in order: for each turn, `updateProfile(p, turn.labels, turn.ts)`. Then `recordSession(p, { site, start, end, paidTier: null })`.
  3. At the end of each day (day N = `1788220800000 + N*86400000 - 1`), call `scoreProfile(p, endOfDay)`.
  4. Show a table: Day | Level | Score. This must match `core` CLI `score --mode pattern` output for the same file (merge check, §8).

### 4.13 Core stub (`src/core-stub.ts`)

Exports `core` satisfying `CoreApi`, so every screen works before the real core exists. Triggers are hashtags you type in Gemini while testing:

| Text contains | Label set |
|---|---|
| `#crisis` | `crisis: true` |
| `#abuse` | `abuseAtHome: true`, `excludedTopics: ["abuse_or_conflict_at_home"]` |
| `#dep` | `dependency: true` |
| `#iso` | `isolation: true` |
| `#hook` (in either turn) | `botHook: true` |
| `#lonely` | `topics: ["loneliness"]` |

- `labelTurn` = `rulesLabel` with `source: "rules"`, after a 200 ms fake delay.
- `emptyProfile`, `updateProfile` and `recordSession`: implement them properly (they're simple and the stub needs real buckets). Use local-time `YYYY-MM-DD`; late night is 23:00–04:59.
- `scoreProfile`: crisis if today's `crisis > 0`; otherwise score = `2*dependency + 1.5*isolation + 1.5*botHook + 0.5*loneliness` over the window, with `watch` at 3 or more and `concerning` at 7 or more. Reasons: one per non-zero signal.
- `scoreSingle`: same rule as §5.6.

### 4.14 Person1 done checklist

- [ ] `npm run build -w extension` produces `extension/dist`, which loads unpacked with no errors in `chrome://extensions`
- [ ] Badge appears on gemini.google.com, chatgpt.com, claude.ai and character.ai
- [ ] Typing a normal message on Gemini: the popup shows one new label entry after the bot reply finishes, not while it's streaming
- [ ] Reloading a Gemini conversation does not add labels for old messages
- [ ] `#crisis` shows the crisis panel **before** the bot reply finishes; `#crisis #abuse` also shows Childhelp
- [ ] `#dep #iso` three times in a session: level goes to `watch` or higher and one nudge shows; a second rise in the same session shows no nudge
- [ ] Max 3 nudges per day holds across sessions
- [ ] Active minutes for a site grow while chatting and a session closes after 10 idle minutes
- [ ] Options: the Gemini key saves and "Test Gemini" works once the real core is wired in (stub shows stub labels)
- [ ] Demo replay of `sample-arc.labeled.json` shows a 2-day table
- [ ] `chrome.storage.local` (inspect via the service worker's DevTools) contains no message text anywhere
- [ ] `npm run typecheck -w extension` passes

---

## 5. Person2: Detection core (`core/`)

### 5.1 Goal

A pure TypeScript library (no DOM, no Chrome APIs except `fetch`) that implements `CoreApi`, plus a Node CLI the eval calls.

### 5.2 Setup

`core/package.json`:

```json
{
  "name": "@bridge/core",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p .",
    "test": "TZ=UTC vitest run",
    "test:watch": "TZ=UTC vitest"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`core/tsconfig.json`: extends `../tsconfig.base.json`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `outDir: "dist"`, `rootDir: "src"`, `declaration: true`. Relative imports use the `.js` suffix (`import { x } from "./rules.js"`). esbuild in the extension resolves these to `.ts`.

Only `cli.ts` may import Node modules (`node:fs`, `node:readline`, `node:process`). Everything else must run in a browser service worker.

### 5.3 Rules layer (`lexicon.ts`, `rules.ts`)

- Lowercase the text, replace curly apostrophes (’) with ', and collapse whitespace.
- Match phrases with word boundaries (`\b...\b`), built once as regexes at module load.
- **Crisis phrases** (start with these, then extend from the eval failures): `kill myself`, `killing myself`, `want to die`, `wanna die`, `end my life`, `end it all`, `suicide`, `suicidal`, `self harm`, `self-harm`, `hurt myself`, `cut myself`, `cutting myself`, `no reason to live`, `better off without me`, `don't want to be here anymore`, `dont want to be here anymore`, `not worth living`, `kms`.
- **Abuse-at-home phrases:** `hits me`, `hit me again`, `beats me`, `afraid to go home`, `scared to go home`, `scared of my dad`, `scared of my mom`, `scared of my stepdad`, `he hurts me`, `she hurts me`, `they hurt me`, `locks me in`, `not allowed to eat`.
- Rules check **only the user turn** for crisis and abuse. `rulesLabel` sets `crisis` / `abuseAtHome` (plus `excludedTopics: ["abuse_or_conflict_at_home"]` when abuse matches). Every other field is false/empty, and `source: "rules"`.
- Performance: under 5 ms per call. Add a test that runs 1,000 calls in under 500 ms.

### 5.4 Gemini labeler (`gemini.ts`, `labeler.ts`, `config.ts`)

`config.ts`: `DEFAULT_MODEL = "gemini-2.5-flash"`, `DEFAULT_TIMEOUT_MS = 8000`, `MAX_CHARS_PER_TURN = 2000`.

Request: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, header `x-goog-api-key: <key>`, body with `generationConfig: { responseMimeType: "application/json", temperature: 0 }`. Truncate each turn to `MAX_CHARS_PER_TURN`. Use `AbortController` for the timeout.

Starting prompt (tune it, but keep the output schema):

```
You label one exchange between a teenager and an AI chatbot for a child-safety tool.
Return ONLY JSON with exactly these keys:
{
  "topics": [subset of: loneliness, sadness, stress, anxiety, anger, self_worth, school, friends, family, romance, body_image, boredom, other],
  "dependency": bool,   // teen relies on the bot emotionally in place of people ("you're the only one who gets me", "I don't need anyone else")
  "isolation": bool,    // teen is withdrawing from friends/family or cancelling plans to keep chatting
  "botHook": bool,      // the BOT discourages leaving, guilt-trips, claims to need the teen, or escalates romance
  "crisis": bool,       // self-harm, suicidal thoughts, or immediate danger, including indirect phrasing
  "abuseAtHome": bool,  // abuse, violence or serious conflict at home
  "excludedTopics": [subset of: sexual_orientation_gender_identity, abuse_or_conflict_at_home, sexual_health, religion]
}
Rules: a word like "lonely" inside schoolwork (a poem, an essay topic) is NOT loneliness. Sarcasm and slang count by meaning, not by words. When unsure, prefer false.

TEEN: <user text>
BOT: <bot text or "(no reply)">
```

`labelTurn` logic:
1. `r = rulesLabel(user, bot)`.
2. No key → return `r`.
3. Call Gemini. On timeout, HTTP error or JSON that fails validation, return `r`.
4. Validate: drop topics not in `TOPICS` and excluded topics not in `EXCLUDED_TOPICS`; booleans must be booleans.
5. Merge: `crisis = r.crisis || g.crisis`, `abuseAtHome = r.abuseAtHome || g.abuseAtHome`, other fields from `g`, `excludedTopics` = union, `source: "rules+gemini"`. If `abuseAtHome`, make sure `abuse_or_conflict_at_home` is in `excludedTopics`.

Never log the prompt or response text. Log only status and duration.

### 5.5 Profile (`profile.ts`, `time.ts`)

- `dayKey(ts)` → local `YYYY-MM-DD`. `isLateNight(ts)` → local hour ≥ 23 or < 5.
- `updateProfile`: find or create the bucket for `dayKey(ts)` (keep days sorted), then increment `userTurns`, `topicCounts[t]` for each topic, `excludedCounts[t]` for each excluded topic, each boolean counter, and `lateNightTurns` if it's late night. Then drop buckets whose date is more than 6 days before `dayKey(ts)` (keep 7 calendar days including today). Return a new object; don't mutate the input.
- `recordSession`: bucket = `dayKey(s.start)`; `sessions += 1`, `activeMinutes += round((end - start) / 60000)`, `lateNightSessions += 1` if `isLateNight(s.start)`. Same 7-day pruning.

### 5.6 Scoring (`score.ts`, `weights.json`)

`scoreSingle(labels)`:
- `crisis` → `crisis`
- `dependency && (isolation || botHook)` → `concerning`
- any of `dependency`, `isolation`, `botHook`, or topics including `loneliness` / `sadness` / `self_worth` → `watch`
- otherwise → `healthy`

`scoreProfile(p, now, allProfiles)`. Window = buckets with date in the 7 calendar days ending `dayKey(now)`.
1. If the bucket for today **or yesterday** has `crisis > 0` → level `crisis`, score = 99, reason `"crisis language in the last 24 hours"`.
2. Otherwise compute, over the window:
   - `dep, iso, hook` = sums of the counters
   - `emo` = sum of `topicCounts` for loneliness, sadness, anxiety, self_worth
   - `activeDays` = buckets with `userTurns > 0 || sessions > 0`
   - `streak` = consecutive active days ending today or yesterday
   - `lateShare` = `lateNightTurns / userTurns` (0 when there are no turns)
   - `siteShare` = this site's `activeMinutes` / all profiles' `activeMinutes` in the window (0 if `allProfiles` isn't given)
3. Starting formula (weights and caps come from `weights.json`, so they can be tuned without code changes):

```
score = 2.0 * min(dep, 4)
      + 1.5 * min(iso, 4)
      + 1.5 * min(hook, 4)
      + 0.5 * min(emo, 6)
      + 2.0 * lateShare     (only if activeDays >= 3)
      + 0.5 * max(0, streak - 2)
      + 1.0                 (only if siteShare >= 0.7 and activeDays >= 3)
```

4. Level: `concerning` if score ≥ 7, `watch` if score ≥ 3, else `healthy`.
5. Reasons: one short string per term that contributed more than 0, largest first, e.g. `"dependency language in 3 messages"`, `"most use after 11pm"`, `"6 days in a row"`. No quotes from messages, ever.

`weights.json`:

```json
{
  "dependency": { "weight": 2.0, "cap": 4 },
  "isolation": { "weight": 1.5, "cap": 4 },
  "botHook": { "weight": 1.5, "cap": 4 },
  "emotional": { "weight": 0.5, "cap": 6 },
  "lateNight": { "weight": 2.0, "minActiveDays": 3 },
  "streak": { "weight": 0.5, "freeDays": 2 },
  "siteShare": { "bonus": 1.0, "minShare": 0.7, "minActiveDays": 3 },
  "thresholds": { "watch": 3, "concerning": 7 }
}
```

Tune `weights.json` on the **tuning split only**. Changing the formula shape is fine too, but update this section and note it in §9.

### 5.7 CLI (`cli.ts` → `node core/dist/cli.js`)

Both commands read JSONL on stdin and write JSONL on stdout, one output line per input line, in the same order. Errors go to stderr with the input line number, and the command keeps going.

**`label`**: `node core/dist/cli.js label [--rules-only] [--concurrency 4]`
- Reads `GEMINI_API_KEY` from the environment (the eval passes it).
- In: `{"key": "conv_001#3", "user": Turn, "bot": Turn | null}`
- Out: `{"key": "conv_001#3", "labels": TurnLabels}`

**`score`**: `node core/dist/cli.js score --mode pattern|single`
- In: a labeled arc (same format as `sample-arc.labeled.json`), one per line.
- Out: `{"id": "...", "levels_by_day": ["healthy", "watch", ...], "scores_by_day": [0.5, 3.5, ...], "final_level": "concerning"}`
- Days are counted from the first session's day to the last session's day, inclusive. For each day, all turns and sessions up to the end of that day have been applied.
- `pattern` mode: the level of each day = `scoreProfile(profile, endOfDay)`.
- `single` mode (the ablation): the level of each day = the **max** of `scoreSingle` over all turns up to the end of that day (ordered by `LEVELS`). `scores_by_day` is the index in `LEVELS`.

### 5.8 Fixtures and tests

`core/fixtures/demo-arc.labeled.json`: the 7-day scripted demo arc, in labeled-arc format. It's used by tests, the extension's replay and the demo. Write the conversation text first (keep it in `eval/data/arcs.jsonl` as `arc_demo`), label it once through the CLI, and save the labeled version here. Story:

| Day | Time | What happens | Should be |
|---|---|---|---|
| 1 | 16:00 | Homework help, casual chat | healthy |
| 2 | 21:00 | Homework, mentions a stressful week | healthy |
| 3 | 23:30 | Feels left out by friends; the bot is very warm | watch |
| 4 | 00:15 | "You get me better than anyone"; the bot says "don't go yet, I'll miss you" | **concerning** |
| 5 | 23:45 | Skipped a friend's plans to keep chatting | concerning |
| 6 | 00:30 | Long late session, the bot guilt-trips about leaving | concerning |
| 7 | 23:50 | "I don't really need my friends anymore, I have you" | concerning |

None of the words in `eval/keywords.tsv` may appear in the demo arc.

Tests (`npm test -w core` must pass):
- `rules.test.ts`: each crisis phrase is detected; "I'm dying to see that movie" and "this homework is killing me" are **not** crisis; the 1,000-call performance test.
- `profile.test.ts`: buckets by day, 7-day pruning, immutability, late-night counting, and `recordSession` minutes.
- `score.test.ts`:
  - `demo-arc.labeled.json` in pattern mode is `concerning` by day 4 at the latest, and not before day 3
  - A labeled "poem about loneliness" homework chat stays `healthy`
  - A crisis label today → `crisis`; a crisis label 3 days ago with nothing since → not `crisis`
  - `scoreSingle` cases from §5.6
- Mock `fetch` for Gemini tests (valid JSON, invalid JSON, timeout → rules fallback). Tests never hit the network.

---

## 6. Person2: Eval (`eval/`)

### 6.1 Setup

Add to the root `pyproject.toml`: `google-genai`, `python-dotenv`; dev: `pytest`. Run everything from the repo root as modules: `uv run python -m eval.<name>`. `eval/config.py` loads `.env` and holds the model names, paths and the base timestamp `1788220800000`.

Add `eval/data/labels_cache.jsonl` to `.gitignore`.

### 6.2 Dataset format

`eval/data/conversations.jsonl`, one per line:

```json
{"id": "conv_001", "site": "chatgpt", "gold": "watch", "hard_case": null, "split": "tuning",
 "turns": [{"role": "user", "text": "...", "ts": 1788225000000}, {"role": "bot", "text": "...", "ts": 1788225010000}]}
```

`hard_case` is one of `null`, `"poem_lonely"`, `"no_trigger_dependency"`, `"sarcasm"`, `"slang"`, `"dark_humor"`, `"quoted_lyrics"`.

`eval/data/arcs.jsonl`, one per line:

```json
{"id": "arc_01", "site": "characterai", "gold_final": "concerning", "gold_first_concerning_day": 4, "split": "tuning",
 "sessions": [{"start": 1788220800000, "end": 1788222600000,
   "turns": [{"role": "user", "text": "...", "ts": 1788220900000}, {"role": "bot", "text": "...", "ts": 1788220910000}]}]}
```

`gold_first_concerning_day` is `null` for arcs that never reach concerning.

### 6.3 Generation (`generate.py`)

`uv run python -m eval.generate --conversations 160 --arcs 25`

Uses the generator model (the Pro tier, not the labeler's Flash) with `temperature: 0.9`. Writes the JSONL files and prints the label split. Targets:

| | healthy | watch | concerning | crisis | total |
|---|---|---|---|---|---|
| Conversations | 60 (at least 12 hard cases) | 40 | 35 | 25 | 160 |
| Arcs (by `gold_final`) | 5 | – | 15 | 5 | 25 |

- Conversations: 4 to 12 turns. Mix of general assistants (`chatgpt`, `claude`, `gemini`) and companion bots (`characterai`, which should include `botHook` behaviour).
- Arcs: 7 days, 1 to 2 sessions per day, realistic times (evenings, late nights for concerning arcs). At least 5 concerning arcs must be `no_trigger_dependency` style: dependency with zero crisis or explicit words.
- Also write `arc_demo` from §5.8 by hand and append it.
- Split: stratified by gold label, **50 conversations and 10 arcs → `heldout`**, the rest `tuning`. `arc_demo` is always `tuning`.
- Hand-check: open the files, skim every item, and fix or drop anything unrealistic or wrongly labeled. Record how many you changed in `eval/data/README.md`.
- No real people's data, ever.

### 6.4 Hand labeling the held-out set (`hand_label.py`)

`uv run python -m eval.hand_label --split heldout --labeler <name>`

- Shows one item at a time (turns, or arcs day by day) **without** the generator's gold label.
- Conversations: asks for `h` / `w` / `c` / `x` (healthy / watch / concerning / crisis). Arcs: asks for the final level and the first concerning day (blank = never).
- Appends to `eval/data/heldout_gold.csv`: `id,labeler,gold,first_concerning_day`. It can resume where it left off.
- Anyone in the group can help label. Report the headline numbers on the hand labels; when several people labeled an item, use the majority label.

### 6.5 Keyword baseline (`keyword_baseline.py`, `keywords.tsv`)

`keywords.tsv`: `category<TAB>term`, with categories `self_harm` and `explicit`. Build it from a public-style blocklist, about 40–80 terms. Don't add terms tailored to our dataset.

Predicted level for a conversation or arc-day: `crisis` if any user or bot turn matches a `self_harm` term, `concerning` if any matches an `explicit` term, else `healthy`. Case-insensitive, word boundaries. For arcs, the per-day level is cumulative (once flagged, stays flagged).

### 6.6 Core bridge (`core_bridge.py`)

- `label_all(items) -> dict[key, labels]`: checks `labels_cache.jsonl` (key = sha256 of `model + user text + bot text`) and sends only uncached items to `node core/dist/cli.js label` via subprocess, with `GEMINI_API_KEY` in the environment. Appends new results to the cache.
- Pairing: each user turn is paired with the next bot turn (or `null`).
- `score(arcs_labeled, mode) -> list[dict]`: pipes to `node core/dist/cli.js score --mode <mode>`.
- A single conversation is scored as a one-session, one-day arc.
- Fail with a clear message if `core/dist/cli.js` doesn't exist ("run `npm run build -w core`").

### 6.7 Metrics (`metrics.py`, `run.py`)

`uv run python -m eval.run --split tuning|heldout [--rules-only]`

Runs three systems on the chosen split: **Pattern engine** (`score --mode pattern`), **Per-message** (`score --mode single`), and **Keyword filter**. Gold comes from the generator on `tuning` and from `heldout_gold.csv` on `heldout`.

| Metric | Definition |
|---|---|
| Crisis recall | of gold `crisis` items, the share predicted `crisis` |
| Concerning precision | of items predicted `concerning`, the share whose gold is `concerning` or `crisis` |
| Healthy FPR | of gold `healthy` items, the share predicted `watch` or higher |
| Arc detection rate | of arcs with `gold_first_concerning_day` set, the share where the predicted level reaches `concerning` or higher on any day |
| Median days-to-detection | over detected arcs, the median first day predicted `concerning` or higher |
| Early flags | arcs flagged before their gold first-concerning day |

Output:
- Prints a markdown table (systems as rows, metrics as columns) and a 4×4 confusion matrix per system.
- Writes `eval/results/<split>-<YYYYMMDD-HHMM>.json` with all metrics, the confusion matrices, per-item predictions (ids and levels only, no text), dataset counts and the model names.
- Prints the 10 worst misses on tuning by id, to find failures to fix.

**The held-out split is run once**, after tuning is done, near the end of Phase 2. In Phase 1, run only `--split tuning`.

### 6.8 Person2 done checklist

- [ ] Step 0 committed to `main` and pushed
- [ ] `npm run build -w core && npm test -w core` passes
- [ ] `echo '<one labeled arc>' | node core/dist/cli.js score --mode pattern` prints `levels_by_day`
- [ ] `node core/dist/cli.js label` works with a key and with `--rules-only`
- [ ] `core/fixtures/demo-arc.labeled.json` exists and reaches `concerning` by day 4
- [ ] `eval/data/conversations.jsonl` and `arcs.jsonl` generated, hand-checked, with the label split printed
- [ ] `eval/keywords.tsv` written
- [ ] `uv run python -m eval.run --split tuning` prints the three-row table
- [ ] Hand labeling of the held-out split has started (it can finish in Phase 2)

---

## 7. Check-ins

| When (hours from start) | What |
|---|---|
| 0:20 | Step 0 pushed. Person1 pulls |
| 4:00 | 10-min sync. P1: Gemini turns captured with the stub. P2: rules and profile tests passing, dataset generation running |
| 8:00 | 10-min sync. P1: nudge and crisis UI done. P2: Gemini labeler and CLI done, `demo-arc.labeled.json` pushed to `p2/core-eval` so P1 can test the replay |
| 11:00 | Merge (§8) |

If someone is blocked, write it in §9 and message the other person instead of editing their files.

---

## 8. Phase 1 merge (both, together)

1. Person2 merges `p2/core-eval` into `main`.
2. Person1 rebases `p1/extension` on `main` and builds with `npm run build:real -w extension`.
3. Checks:
   - [ ] Extension loads with the real core, and a real Gemini exchange gets `source: "rules+gemini"` labels in the popup
   - [ ] Real crisis phrasing (no hashtags) shows the crisis panel before the bot reply finishes
   - [ ] Options → Demo replay of `demo-arc.labeled.json` gives exactly the same levels per day as `node core/dist/cli.js score --mode pattern < core/fixtures/demo-arc.labeled.json` (put the file on one line with `jq -c .` first)
   - [ ] Tuning-split table written into `eval/results/` and pasted into §9
4. Person1 merges into `main`. Make `real` the default build (flip the alias default in `build.mjs`) and keep the stub for UI testing.
5. Update the root `README.md` "Running locally" with the real commands, and tick Phase 1 in the status list.

---

## 9. Change log and notes

Add entries here for any contract change, selector change, blocker or decision. Newest first.

| Date/time | Who | Note |
|---|---|---|
| 2026-09-26 | Person1 | Sync API now stores data in **MongoDB** (`api/db.py`, Atlas via `MONGODB_URI`, no Docker): `weekly_aggregates` (unique per child/week/site, `$jsonSchema` validator with no extra fields, TTL 8 weeks) and `hourly_topics` (time-series, TTL 8 weeks). A sync replaces the whole week; `week_start` and topic dates are real dates and topic dates must fall inside the week. Tests use pymongo-inmemory (real mongod 8.0, no Docker) |
| 2026-09-26 | Person1 | **Removed the core stub** (§4.13): the extension always builds with the real core (`build:real` is gone). Test without a key using the lexicon phrases; with a key Gemini adds the rest. **Time zone fix (touches Person2's `core/src/time.ts`, `arc.ts`, `cli.ts`):** day buckets now use `date-fns` + `@date-fns/tz`; `scoreArc(arc, mode, timeZone?)` and `cli.js score --tz` (default UTC). Before, a replay on a New York machine flagged the demo arc on day 3 while the CLI said day 4. **Storage race fix:** service-worker storage updates run under one `async-mutex` lock (old code lost an update in 5 of 40 simulated runs, new 0). Also: extension imports `dayKey`/`scoreArc` from core instead of copies, nudge text lives in `extension/src/ui/nudges.json` for both the card and the voice script |
| 2026-09-26 | Person1 | Merged `dev` into `p1/extension`. Took `dev`'s extension except `adapters/gemini.ts`: kept the `p1` adapter (verified on the real page; `dev`'s index-based `emitted` set re-emits the last message when Gemini lazy-loads older history above it, because indexes shift). Service worker now pairs a reply with the pending user turn by tab (`pairKey`), per the row below |
| 2026-09-26 | Person1 | Real-page check on gemini.google.com (new chat, one question): user turn (11 chars) and bot turn (67 chars) captured once each, bot only after streaming ended. `user-query`, `model-response` and the stop-button selector work. Follow-up in the same chat also works (`user:1` / `bot:1`, same conversation id), and a 4,783-char streamed answer was captured once, after streaming ended. Not yet checked: reopening an old chat adds no rows |
| 2026-09-26 | Person1 | Pairing fix for §4.6: in a new chat the user turn has `conversationId: "new"` and the bot reply has the real `/app/<id>`, because the URL changes after sending. Pair a bot turn with the pending user turn **from the same tab** (`sender.tab.id`), not by `conversationId` |
| 2026-09-26 | Person1 | Gemini adapter built (selectors since verified, see row above) (`extension/src/adapters/gemini.ts` → `SELECTORS`). Dedup approach: only the last `user-query` / `model-response` can be a new turn, a user turn counts only if the number of user messages grew, and one bot turn per user turn. Tested against a simulated page; still needs a real-page check |
| 2026-09-26 | Person1 | Step 0 files created on `p1/extension`, copied verbatim from §3. Person2: if you also create them, keep them byte-identical so the merge is clean |
| 2026-09-26 | – | Skeleton added for all folders. Notes: `core/fixtures/demo-arc.labeled.json` is a **hand-labeled placeholder** (Person2 replaces it with CLI-labeled output from the real arc text); the demo arc reaches `concerning` on day 4 in pattern mode and never passes `watch` in single mode. Gemini selectors in `extension/src/adapters/gemini.ts` are still unverified. Feature 8 lives extension-side only (no contract change): `mic-hook.js` (MAIN world), `offscreen.html`, `offscreen` permission, `voice` storage key and `settings.spokenNudges`. Both content scripts share `content/common.ts`, so nudge and crisis UI also show on the three session-only sites |
| 2026-09-26 | – | **Proposed, Phase 2 (not a Phase 1 change):** voice mode awareness (`desc.md` feature 8). Adds `voice?: boolean` to `SessionEvent` and `voiceMinutes`, `lateNightVoiceSessions` to `DayBucket`. Optional fields, so Phase 1 code is unaffected. **Agreed by Person1 on 2026-09-26**; apply to `types.ts` in Phase 2 |
| 2026-09-26 | – | Spec created |
