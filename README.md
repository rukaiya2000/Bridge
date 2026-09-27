# Bridge

**Bridge keeps teens safe in AI chats without spying on them: dangerous messages are stopped before they're sent, and nothing they write is ever stored.**

🎥 **Demo video:** https://www.youtube.com/watch?v=xlw9YbbXYfk

Built at ShellHacks 2026.

## Why

Millions of teens talk to AI chatbots every day, often late at night and often about things they don't tell anyone else. Most safety tools flag a single bad word and miss everything else. The real risk is usually a pattern: a teen who slowly starts saying "you're the only one who gets me," pulls away from friends, and talks to a bot that keeps them there.

Parents are stuck with two bad options: read everything, which destroys trust, or see nothing. Bridge is a third option: protect teens in the moment, and tell parents what to talk about, not what their kid said.

## What it does

- **Blocks dangerous messages before they reach the chatbot.** When a teen presses Send, Bridge holds the message and asks [Jev](https://openrouter.ai/typesafe/jev-1.13) (TypeSafe's decision model, via OpenRouter) about self-harm, abuse at home, meeting a stranger, sexual content, violence and romance with the chatbot. If the danger score reaches a configurable threshold, the message is never sent. Everyday feelings like sadness are never blocked.
- **Protects personal information.** Phone numbers, emails, addresses and IDs are caught on the device, and the teen can send without those details. Card and Social Security numbers can never be sent.
- **Understands feelings and patterns.** Bridge detects 16 feelings (sadness, rejection, hopelessness, grief, overwhelm…) and relationship warning signs: dependency on the bot, isolation from friends, and bots that guilt-trip teens into staying.
- **Gives parents insight, not surveillance.** The dashboard shows topics, times of day, levels and "a message was held back", never the words.

Works on Gemini and ChatGPT. Claude and Character.AI get time and voice tracking.

## Project structure

| Folder | What it is |
|---|---|
| `core/` | TypeScript detection core: the Jev integration, the safety gate (`src/safety.ts`), on-device crisis/abuse rules, and the pattern scoring |
| `extension/` | Chrome extension (Manifest V3): reads the chat, holds each message until the safety gate answers, checks personal info on the device |
| `api/` | Sync API (FastAPI + MongoDB Atlas): accounts and weekly counts only. The database schema rejects anything that could hold message text, and data expires after 8 weeks |
| `dashboard/` | Parent dashboard (React + Mantine): levels, topic trends, time-of-day chart |
| `eval/` | Python evaluation: test dataset, keyword baseline, metrics |
| `docs/` | Specs: [`PHASE1.md`](docs/PHASE1.md), [`PHASES.md`](docs/PHASES.md), [`desc.md`](docs/desc.md) |

## Running it

**You need:** Node 20+, Python 3.13 with [uv](https://docs.astral.sh/uv/), Chrome, an [OpenRouter](https://openrouter.ai) API key and a MongoDB Atlas connection string.

**1. Set up keys.** Copy `.env.example` to `.env` in the repo root and fill in:

```bash
OPENROUTER_API_KEY=...   # Jev
MONGODB_URI=...          # MongoDB Atlas
MONGODB_DB=bridge
```

**2. Install and build**

```bash
npm install
npm run build             # core + extension
```

**3. Load the extension:** open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `extension/dist`.

> The build bakes `OPENROUTER_API_KEY` into `extension/dist`. Don't share a build made with a real key.

**4. Start the API** (http://localhost:8000, docs at `/docs`)

```bash
uv run --group api uvicorn api.main:app --reload
```

**5. Start the dashboard** (http://localhost:5173)

```bash
npm run dev:dashboard
```

**6. Try it:** create an account on the dashboard (this also logs the extension in), then chat on [gemini.google.com](https://gemini.google.com) or [chatgpt.com](https://chatgpt.com). Settings like the safety threshold are on the extension's Options page.



## Tests

```bash
npm test -w core
npm test -w extension
uv run --group api --group dev pytest api      # starts its own throwaway MongoDB
```

## Team

- Rukaiya Khan
- Krishna Niveditha
- Atul
- Vivek C
