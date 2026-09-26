import type { Site } from "../../../core/src/types";
import type { ToWorker } from "../messages";
import { SITE_BY_HOST } from "../messages";

const BEAT_MS = 30_000;
const INTERACT_WINDOW_MS = 2 * 60_000;

let lastInteraction = 0;
export const markInteraction = () => { lastInteraction = Date.now(); };

export function siteFromHost(host = location.hostname): Site | null {
  return SITE_BY_HOST[host.replace(/^www\./, "")] ?? null;
}

export function startHeartbeat(site: Site, isVoiceActive: () => boolean): void {
  for (const ev of ["keydown", "click", "scroll"]) addEventListener(ev, markInteraction, { passive: true, capture: true });
  const beat = () => {
    if (document.visibilityState !== "visible" && !isVoiceActive()) return;
    const interacting = isVoiceActive() || Date.now() - lastInteraction < INTERACT_WINDOW_MS;
    const msg: ToWorker = { type: "heartbeat", site, ts: Date.now(), interacting };
    chrome.runtime.sendMessage(msg).catch(() => {});
  };
  beat();
  setInterval(beat, BEAT_MS);
}
