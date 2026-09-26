// Content script for gemini.google.com: captures turns and forwards them to the service worker.
// Badge, nudge, crisis UI and heartbeat are added in later steps (docs/PHASE1.md §4.9–4.10).
import { startGeminiAdapter } from "../adapters/gemini";
import type { ToWorker } from "../messages";

startGeminiAdapter((turn) => {
  // Log shape only, never the text.
  console.debug("[Bridge] turn", turn.role, turn.id, `${turn.text.length} chars`);
  const msg: ToWorker = { type: "turn", turn };
  chrome.runtime.sendMessage(msg).catch(() => {
    // The service worker can be restarting; the next turn will get through.
  });
});
