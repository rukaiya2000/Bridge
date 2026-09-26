// Shared by both content scripts: badge, heartbeat, voice relay, and nudge/crisis UI.
import type { Site } from "../../../core/src/types";
import type { MicSignal, ToContent, ToWorker } from "../messages";
import { markInteraction, siteFromHost, startHeartbeat } from "./heartbeat";
import { mountShadow } from "../ui/shadow";
import { showBadge } from "../ui/badge";
import { showNudge } from "../ui/nudge";
import { showCrisis } from "../ui/crisis";

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
    chrome.runtime.sendMessage(msg).catch(() => {});
  });

  startHeartbeat(site, () => voiceActive);

  chrome.runtime.onMessage.addListener((msg: ToContent) => {
    if (msg.type === "show-nudge") showNudge(root, msg.variant);
    if (msg.type === "show-crisis") showCrisis(root, msg.abuseAtHome);
  });
  return site;
}
