// Debug view: level, score and label counts per site. Shows labels only, never text.
import type { Site, TurnLabels } from "../../../core/src/types";
import * as store from "../storage";
import type { ToWorker } from "../messages";
import { dayKey } from "../../../core/src/time";

const $ = (id: string) => document.getElementById(id)!;

function flags(l: TurnLabels): string {
  const on = (["dependency", "isolation", "botHook", "crisis", "abuseAtHome"] as const).filter((k) => l[k]);
  return [...on, ...l.topics, ...l.excludedTopics.map((t) => `(excluded) ${t}`)].join(", ") || "no signals";
}

async function render() {
  const [profiles, state, debug, voice, sync] = await Promise.all([
    store.get("profiles"), store.get("state"), store.get("debug"), store.get("voice"), store.get("syncStatus"),
  ]);
  $("sync").textContent = sync
    ? `Dashboard sync ${sync.ok ? "OK" : "failed"} at ${new Date(sync.at).toLocaleTimeString()}: ${sync.message}`
    : "Dashboard sync: not yet";
  const today = dayKey(Date.now());
  const sites = $("sites");
  sites.replaceChildren();
  for (const site of Object.keys(profiles) as Site[]) {
    const s = state[site];
    const bucket = profiles[site]?.days.find((d) => d.date === today);
    const box = document.createElement("div");
    box.className = "site";
    const head = document.createElement("div");
    const chip = document.createElement("span");
    chip.className = `chip ${s?.level ?? "healthy"}`;
    chip.textContent = s?.level ?? "healthy";
    head.append(`${site} `, chip, ` score ${(s?.score ?? 0).toFixed(1)}`);
    const reasons = document.createElement("ul");
    for (const r of s?.reasons ?? []) { const li = document.createElement("li"); li.textContent = r; reasons.append(li); }
    const today_ = document.createElement("div");
    today_.className = "muted";
    const voiceMin = voice.minutesByDay[today]?.[site] ?? 0;
    today_.textContent = `today: ${bucket?.userTurns ?? 0} turns, ${bucket?.activeMinutes ?? 0} active min, ${voiceMin} voice min${voice.current[site] ? " (voice on)" : ""}`;
    box.append(head, reasons, today_);
    sites.append(box);
  }
  if (!sites.childElementCount) sites.textContent = "No activity yet.";

  const list = $("labels");
  list.replaceChildren();
  for (const r of debug.recentLabels.slice(0, 10)) {
    const li = document.createElement("li");
    li.textContent = `${new Date(r.ts).toLocaleTimeString()} ${r.site} [${r.labels.source}]: ${flags(r.labels)}`;
    list.append(li);
  }
}

$("reset").addEventListener("click", async () => { await store.resetData(); await render(); });
$("sync-now").addEventListener("click", () => {
  const msg: ToWorker = { type: "sync-now" };
  void chrome.runtime.sendMessage(msg).catch(() => {});
});
chrome.storage.onChanged.addListener((changes) => { if (changes.syncStatus) void render(); });
void render();
