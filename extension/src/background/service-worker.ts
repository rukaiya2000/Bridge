// Receives turns from content scripts. For now it records turn metadata for the debug popup;
// labeling, profiles and nudges come next (docs/PHASE1.md §4.6).
import type { ToWorker } from "../messages";
import { load, save } from "../storage";

const RECENT_LIMIT = 20;

// MV3 workers can process messages concurrently; serialize storage writes.
let queue: Promise<void> = Promise.resolve();

chrome.runtime.onMessage.addListener((msg: ToWorker) => {
  if (msg.type !== "turn") return;
  const { turn } = msg;
  queue = queue.then(async () => {
    const debug = await load("debug");
    debug.recentTurns = [
      ...debug.recentTurns,
      { ts: turn.ts, site: turn.site, role: turn.role, id: turn.id, conversationId: turn.conversationId, chars: turn.text.length },
    ].slice(-RECENT_LIMIT);
    await save("debug", debug);
  });
});
