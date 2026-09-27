// Privacy guard + safety gate for a site with a message box (Gemini, ChatGPT).
import type { Site } from "../../../core/src/types";
import type { ToWorker } from "../messages";
import { toWorker } from "./send";
import { startPrivacyGuard } from "../privacy/guard";
import { mountShadow } from "../ui/shadow";
import * as store from "../storage";
import { checkSafety, type SafetyVerdict } from "../../../core/src/safety";

export function startProtection(site: Site, selectors: { composer: string; sendButton: string }): void {
  startPrivacyGuard({
    root: mountShadow(),
    selectors,
    isStrict: async () => (await store.get("settings")).privacyStrict,
    report: (what, findings, outcome) => {
      const msg: ToWorker = { type: "privacy-pause", site, what, findings, outcome };
      toWorker(msg);
    },
    // RPC to the service worker, which holds the key and asks Jev.
    checkSafety: async (text) => {
      const msg: ToWorker = { type: "safety-check", site, text };
      // Settings can't be read from a tab cut off from the extension, so fall back to the default threshold.
      const threshold = await store.get("settings").then((s) => s.safetyThreshold, () => undefined);
      const local = () => checkSafety(text, { site, threshold });
      // If the worker can't answer (extension reloaded, error) or takes too long, the on-device
      // crisis/abuse rules decide here, so the teen is never left with an unsent message and no card.
      const fromWorker = chrome.runtime?.id
        ? chrome.runtime.sendMessage(msg).catch(() => null)
        : Promise.resolve(null);
      const timeout = new Promise((r) => setTimeout(() => r(null), 8000));
      const verdict = (await Promise.race([fromWorker, timeout])) as SafetyVerdict | null;
      const result = verdict && typeof verdict.block === "boolean" ? verdict : await local();
      console.info(`[Bridge] safety gate: ${result.block ? "blocked" : "allowed"} (score ${result.score.toFixed(2)}, via ${verdict ? result.source : "on-device rules"})`);
      return result;
    },
  });
}
