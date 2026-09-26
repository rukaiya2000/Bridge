import type { ToWorker } from "../messages";
import { markInteraction } from "./heartbeat";
import { startCommon } from "./common";
import { SELECTORS, startGeminiAdapter } from "../adapters/gemini";
import { startPrivacyGuard } from "../privacy/guard";
import { mountShadow } from "../ui/shadow";
import * as store from "../storage";

const site = startCommon();
if (site) {
  startPrivacyGuard({
    root: mountShadow(),
    selectors: SELECTORS,
    isStrict: async () => (await store.get("settings")).privacyStrict,
    report: (what, findings, proceeded) => {
      const msg: ToWorker = { type: "privacy-pause", site, what, findings, proceeded };
      chrome.runtime.sendMessage(msg).catch(() => {});
    },
  });
  startGeminiAdapter((turn) => {
    markInteraction();
    // Shape only, never the text (open DevTools on the Gemini tab to see these).
    console.info(`[Bridge] captured ${turn.role} message: ${turn.text.length} chars (${turn.id})`);
    const msg: ToWorker = { type: "turn", turn };
    chrome.runtime.sendMessage(msg).catch(() => {});
  });
}
