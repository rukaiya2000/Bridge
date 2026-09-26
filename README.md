# Bridge

**Filters catch bad messages. We catch bad relationships, and tell parents what to talk about, not what their kid said.**

Bridge is a browser extension that detects unhealthy relationship patterns between teens and AI chatbots, such as late-night use, rising dependency, isolation and bots that keep them talking. It nudges the teen in the moment, hands off to crisis resources when needed, and gives parents a weekly topic-level summary with a suggested conversation starter.

Built at ShellHacks 2026.

## How it works

1. A content script reads chat turns on supported sites (Gemini web first).
2. Each turn is labeled: crisis words and behavioral signals are checked on the device, and subtler signals are labeled by Gemini in this build.
3. A pattern engine rolls labels into a 7-day profile per chatbot and scores it as `healthy`, `watch`, `concerning` or `crisis`.
4. The teen sees a nudge card or a crisis panel (988, Crisis Text Line, Childhelp) in the page.
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
| `dashboard/` | React parent dashboard (Phase 2 skeleton) | TBD |

## Running locally

> Fill these in as each part lands.

**Prerequisites:** Node 20+, Python 3.13 with [uv](https://docs.astral.sh/uv/), Chrome, a Gemini API key. Docker is needed from Phase 2.

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
Then in Chrome: `chrome://extensions` → Developer mode → Load unpacked → `extension/dist`. Paste your Gemini key on the extension's options page. Without a key the extension runs the on-device rules only (crisis and abuse phrases from `core/src/lexicon.ts`); with a key, Gemini adds the other labels.

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

**API + dashboard (Phase 2 skeletons)**
```bash
uv run --group api uvicorn api.main:app --reload
```
```bash
npm run dev -w dashboard
```
The dashboard shows sample data until the API has a synced week.

## Team workflow

- Plan and phases: [`docs/PHASES.md`](docs/PHASES.md). Phase 1 detailed spec: [`docs/PHASE1.md`](docs/PHASE1.md). Full spec: [`docs/desc.md`](docs/desc.md).
- Phase 1 branches: `p1/extension` (Person1) and `p2/core-eval` (Person2); see `docs/PHASE1.md` §0 for merge rules.
- `core/src/types.ts` is the shared contract. Agree on any change to it before merging.
- Never commit API keys. Keep them in `.env` (git-ignored) or the extension options page.

## Status

- [ ] Phase 1: local core
- [ ] Phase 2: local end to end
- [ ] Phase 3: ship and pitch
