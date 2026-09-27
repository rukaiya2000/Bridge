# Bridge

**Filters catch bad messages. We catch bad relationships, and tell parents what to talk about, not what their kid said.**

Bridge is a browser extension that detects unhealthy relationship patterns between teens and AI chatbots, such as late-night use, rising dependency, isolation and bots that keep them talking. It nudges the teen in the moment, hands off to crisis resources when needed, and gives parents a weekly topic-level summary with a suggested conversation starter.

Built at ShellHacks 2026.

## How it works

1. A content script reads chat turns on supported sites (Gemini web first).
2. Each turn is labeled: crisis words and behavioral signals are checked on the device, and subtler signals are labeled by Gemini in this build.
3. A pattern engine rolls labels into a 7-day profile per chatbot and scores it as `healthy`, `watch`, `concerning` or `crisis`.
4. The teen sees a nudge card in the page. On a crisis signal, voice mode speaks the helplines (988, Crisis Text Line, Childhelp) and the parent sees the crisis level.
5. Only aggregates (topics, counts, levels, hours) sync to the parent dashboard. Never message text.

## Privacy in one line

We share topics, not words. Sensitive topics are excluded from the parent view, and crisis signals are hidden from parents when there are signs of abuse at home. The full rules are in [`docs/desc.md`](docs/desc.md#privacy-and-safety-design).

## Repo layout

| Folder | What | Owner (Phase 1) |
|---|---|---|
| `core/` | TypeScript library: labeler, rules, pattern engine | Person2 |
| `extension/` | Chrome MV3 extension | Person1 |
| `eval/` | Python: dataset, baselines, metrics | Person2 |
| `api/` | FastAPI sync service (Phase 2 skeleton) | TBD |
| `dashboard/` | React parent dashboard, reads the sync API | TBD |

## Running locally

> Fill these in as each part lands.

**Prerequisites:** Node 20+, Python 3.13 with [uv](https://docs.astral.sh/uv/), Chrome, a UF Navigator API key. Docker is needed from Phase 2.

Copy `.env.example` to `.env` and fill in your keys. Then, once, from the repo root:

```bash
npm install
```

**Core** (detection library + CLI)
```bash
npm run build -w core && npm test -w core
```

**Extension**
```bash
npm run build -w extension
```
Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/dist`. Turns are labeled by Jev (`typesafe/jev-1.13`) on OpenRouter using `OPENROUTER_API_KEY` from `.env`; the extension build bakes that key into `extension/dist`, so don't share a build made with a real key. Without a key the extension runs the on-device rules only (crisis and abuse phrases from `core/src/lexicon.ts`); with a key, Jev adds the other labels. The core CLI and eval labeling use the same key; eval dataset generation still uses `NAVIGATOR_API_KEY`.

**Spoken nudges** (feature 8, needs `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `.env`)
```bash
npm run voice -w extension
```
This writes the MP3s to `extension/static/audio/`. Rebuild the extension afterwards.

**Eval**
```bash
uv run python -m eval.generate --conversations 160 --arcs 25
```
```bash
uv run python -m eval.run --split tuning
```

**API + dashboard** (needs `MONGODB_URI` in `.env`, from a free MongoDB Atlas cluster)
```bash
uv run --group api uvicorn api.main:app --reload     # http://localhost:8000 (docs at /docs)
npm run dev -w dashboard                             # http://localhost:5173, or the next free port
```
Data is stored in MongoDB (`api/db.py`): `weekly_aggregates` (one document per child, week and site) and `hourly_topics` (a time-series collection). Both are deleted automatically 8 weeks after they're written. Tool ratings and conversation starters are seeded into MongoDB from `api/fixtures/tool_ratings.json` and `starters.json` on every start (the ratings are a hand-written draft: verify them before the demo). **Accounts.** Every tester or parent signs up with an email and password (on the dashboard or the extension's Options page; `api/auth.py`, `accounts` and `sessions` collections). All synced data is stored under the account, so two people testing with child `demo` never see each other's data. Log in to the extension and the dashboard with the same account. Load the two demo weeks (mock data) into your account, with `TOKEN` set to the token shown on the dashboard's "No data yet" screen:
```bash
for f in sample_prev_week sample_week; do curl -X POST localhost:8000/sync -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' --data @api/fixtures/$f.json; done
```
The extension syncs the current week to the API by itself: every minute and a few seconds after each message (`extension/src/sync/aggregate.ts` builds the payload; excluded topics are dropped and crisis is masked when abuse-at-home signals are in the same week). It posts as child `demo` to `http://localhost:8000`; change both on the extension's Options page, which also has a Sync now button. It only syncs once you log in on the Options page. The popup shows the last sync result.

The dashboard shows the latest synced week (pick older ones in the week menu) and refreshes every 15 s. Point it elsewhere with `VITE_API_URL`.

After changing `api/models.py` or the routes, regenerate the dashboard's types: `npm run gen:api -w dashboard`.

API tests start their own throwaway MongoDB 8 with `pymongo-inmemory` (no Docker, no Atlas; the first run downloads mongod once): `uv run --group api --group dev pytest api`.

## Team workflow

- Plan and phases: [`docs/PHASES.md`](docs/PHASES.md). Phase 1 detailed spec: [`docs/PHASE1.md`](docs/PHASE1.md). Full spec: [`docs/desc.md`](docs/desc.md).
- Everyone works on `dev` (the `p1/extension` branch was merged and deleted).
- `core/src/types.ts` is the shared contract. Agree on any change to it before merging.
- Never commit API keys. Keep them in `.env` (git-ignored) or the extension options page.

## Status

- [ ] Phase 1: local core
- [ ] Phase 2: local end to end
- [ ] Phase 3: ship and pitch
