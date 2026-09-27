import type { ToWorker } from "../messages";
import { markInteraction } from "./heartbeat";
import { startCommon } from "./common";
import { startProtection } from "./protect";
import { toWorker } from "./send";
import { SELECTORS, startGeminiAdapter } from "../adapters/gemini";

const site = startCommon();
if (site) {
  startProtection(site, SELECTORS);
  startGeminiAdapter((turn) => {
    markInteraction();
    // Shape only, never the text (open DevTools on the Gemini tab to see these).
    console.info(`[Bridge] captured ${turn.role} message: ${turn.text.length} chars (${turn.id})`);
    const msg: ToWorker = { type: "turn", turn };
    toWorker(msg);
  });
}
