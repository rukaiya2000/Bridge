// Toolbar popup: today's feelings as 5-step meters, plus Sync now and Reset. Labels only, never text.
import type { Topic } from "../../../core/src/types";
import * as store from "../storage";
import type { ToWorker } from "../messages";
import { dayKey } from "../../../core/src/time";
import { TOPIC_INFO, topicGroup } from "../ui/topics";

const $ = (id: string) => document.getElementById(id)!;
const SEGMENTS = 5;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// One feeling: name and count, and a bar filled relative to today's most frequent feeling.
function meter(t: Topic, count: number, max: number) {
  const row = el("div", `row ${topicGroup(t)}`);
  const top = el("div", "top");
  top.append(el("span", undefined, TOPIC_INFO[t].label), el("span", "n", `×${count}`));
  const bar = el("div", "bar");
  const on = Math.max(1, Math.round((count / max) * SEGMENTS));
  for (let i = 0; i < SEGMENTS; i++) bar.append(el("i", i < on ? "on" : undefined));
  row.setAttribute("aria-label", `${TOPIC_INFO[t].label}: ${count} today`);
  row.append(top, bar);
  return row;
}

async function render() {
  const profiles = await store.get("profiles");
  const today = dayKey(Date.now());
  const counts = new Map<Topic, number>();
  for (const p of Object.values(profiles)) {
    const day = p?.days.find((d) => d.date === today);
    for (const [t, n] of Object.entries(day?.topicCounts ?? {}) as [Topic, number][]) counts.set(t, (counts.get(t) ?? 0) + n);
  }
  const sorted = [...counts].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;
  const box = $("feelings");
  box.replaceChildren(...sorted.map(([t, n]) => meter(t, n, max)));
  if (!sorted.length) box.append(el("div", "empty", "Nothing picked up yet today."));
}

// The Sync button shows what happened, then goes back to its label.
const syncBtn = $("sync-now") as HTMLButtonElement;
let restore: ReturnType<typeof setTimeout> | undefined;
function flash(text: string) {
  clearTimeout(restore);
  syncBtn.textContent = text;
  syncBtn.disabled = false;
  restore = setTimeout(() => { syncBtn.textContent = "Sync now"; }, 2500);
}

syncBtn.addEventListener("click", async () => {
  if (!(await store.get("auth"))) return flash("Log in first (Options)");
  clearTimeout(restore);
  syncBtn.textContent = "Syncing…";
  syncBtn.disabled = true;
  const msg: ToWorker = { type: "sync-now" };
  void chrome.runtime.sendMessage(msg).catch(() => flash("Couldn't sync"));
});

$("reset").addEventListener("click", async () => {
  if (!confirm("Delete this browser's Bridge data (feelings, levels, usage)? Your account and settings stay.")) return;
  await store.resetData();
  await render();
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.profiles) void render();
  const status = changes.syncStatus?.newValue as { ok: boolean } | undefined;
  if (status && syncBtn.disabled) flash(status.ok ? "Synced ✓" : "Sync failed");
});
void render();
