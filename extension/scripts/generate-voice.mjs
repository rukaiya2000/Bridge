// Feature 8: turns the fixed nudge and crisis scripts into MP3s with ElevenLabs text-to-speech.
// Run once at build time: `npm run voice -w extension`. Needs ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in ../.env.
// ElevenLabs only ever sees these fixed scripts, never anything about the child.
import { mkdirSync, writeFileSync } from "node:fs";

try { process.loadEnvFile(new URL("../../.env", import.meta.url).pathname); } catch { /* use the shell environment */ }

const { ELEVENLABS_API_KEY: key, ELEVENLABS_VOICE_ID: voice } = process.env;
const model = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2"; // check the current model list in the ElevenLabs docs
if (!key || !voice) {
  console.error("Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env first.");
  process.exit(1);
}

// Keep the nudge lines in sync with src/ui/nudge.ts.
const CLIPS = {
  "nudge-0": "Hey. Chatbots are built to keep you talking. Who's someone real you could tell this to?",
  "nudge-1": "It's getting late. Things often feel lighter after some sleep. Want to pick this up tomorrow?",
  "nudge-2": "You've been sharing a lot here. Is there a friend who'd want to hear some of it too?",
  "nudge-3": "An AI can listen, but it can't show up for you. Who in your life can?",
  "nudge-4": "Quick check-in. How long have you been chatting? A short break can help.",
  "crisis": "You don't have to handle this alone. You can call or text 9 8 8 right now, any time. It's free and confidential. You can also text HOME to 7 4 1 7 4 1. If you're in immediate danger, call 9 1 1.",
  "crisis-abuse": "You don't have to handle this alone. You can call or text 9 8 8 right now, any time. You can also call or text Childhelp at 1 800 4 2 2 4 4 5 3. It's free and confidential. If you're in immediate danger, call 9 1 1.",
};

const outDir = new URL("../static/audio/", import.meta.url);
mkdirSync(outDir, { recursive: true });

for (const [name, text] of Object.entries(CLIPS)) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: model }),
  });
  if (!res.ok) {
    console.error(`${name}: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  writeFileSync(new URL(`${name}.mp3`, outDir), Buffer.from(await res.arrayBuffer()));
  console.log(`wrote static/audio/${name}.mp3`);
}
