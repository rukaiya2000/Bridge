import type { ToWorker } from "../messages";
import { startGeminiAdapter } from "../adapters/gemini";
import { markInteraction } from "./heartbeat";
import { startCommon } from "./common";

if (startCommon()) {
  startGeminiAdapter((turn) => {
    markInteraction();
    const msg: ToWorker = { type: "turn", turn };
    chrome.runtime.sendMessage(msg).catch(() => {});
  });
}
