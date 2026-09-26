import type { ToWorker } from "../messages";
import { startGeminiAdapter } from "../adapters/gemini";
import { markInteraction } from "./heartbeat";
import { startCommon } from "./common";

if (startCommon()) {
  startGeminiAdapter((turn) => {
    markInteraction();
    // Shape only, never the text (open DevTools on the Gemini tab to see these).
    console.info(`[Bridge] captured ${turn.role} message: ${turn.text.length} chars (${turn.id})`);
    const msg: ToWorker = { type: "turn", turn };
    chrome.runtime.sendMessage(msg).catch(() => {});
  });
}
