// Shared by both content scripts: badge, heartbeat, voice relay, and nudge UI.
import type { Site } from "../../../core/src/types";
import type { MicSignal, ToContent, ToWorker } from "../messages";
import { markInteraction, siteFromHost, startHeartbeat } from "./heartbeat";
import { toWorker } from "./send";
import { mountShadow } from "../ui/shadow";
import { showBadge } from "../ui/badge";
import { showNudge } from "../ui/nudge";

export function startCommon(): Site | null {
  const site = siteFromHost();
  if (!site) return null;
  const root = mountShadow();
  showBadge(root);

  // Feature 8: the MAIN-world mic hook posts timing signals only. Never audio.
  let voiceActive = false;
  addEventListener("message", (e: MessageEvent<MicSignal>) => {
    if (e.source !== window || (e.data?.bridge !== "voice-start" && e.data?.bridge !== "voice-end")) return;
    voiceActive = e.data.bridge === "voice-start";
    markInteraction();
    const msg: ToWorker = { type: "voice", site, active: voiceActive, ts: Date.now() };
    toWorker(msg);
  });

  startHeartbeat(site, () => voiceActive);

  chrome.runtime.onMessage.addListener((msg: ToContent) => {
    if (msg.type === "show-nudge") showNudge(root, msg.variant);
  });
  return site;
}
