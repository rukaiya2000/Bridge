// Toolbar popup: today's feelings, recent messages and each site's level. Labels only, never text.
import type { Site, Topic, TurnLabels } from "../../../core/src/types";
import * as store from "../storage";
import type { ToWorker } from "../messages";
import { dayKey } from "../../../core/src/time";
import { FLAG_INFO, TOPIC_INFO, byTopicOrder, topicGroup } from "../ui/topics";

const $ = (id: string) => document.getElementById(id)!;
const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function topicChip(t: Topic, count?: number) {
  const { label, emoji } = TOPIC_INFO[t];
  const chip = el("span", `chip ${topicGroup(t)}`, `${emoji} ${label}`);
  if (count && count > 1) chip.append(el("span", "n", `×${count}`));
  return chip;
}

function flagChips(l: TurnLabels) {
  return (Object.keys(FLAG_INFO) as (keyof typeof FLAG_INFO)[])
    .filter((k) => l[k])
    .map((k) => el("span", `chip flag ${k}`, FLAG_INFO[k]));
}

// Logged out: say so first, since nothing syncs until someone logs in (Options page, Account section).
async function renderAccount() {
  const auth = await store.get("auth");
  $("account").hidden = !!auth;
  $("account-text").textContent = "Not logged in, so nothing reaches the dashboard.";
  const pill = $("status-pill");
  pill.textContent = auth ? "On" : "Not syncing";
  pill.className = auth ? "pill" : "pill off";
}

// Without a working Navigator key only the on-device crisis/abuse rules run, so feelings ("i am sad")
// come back empty. Say so instead of looking like nothing was felt.
async function renderLabeling() {
  const [settings, debug] = await Promise.all([store.get("settings"), store.get("debug")]);
  const lastSource = debug.recentLabels[0]?.labels.source;
  const warning = !settings.llmKey
    ? "No UF Navigator key: feelings aren't detected, only crisis phrases."
    : lastSource === "rules"
    ? "The last message wasn't labeled by Navigator (wrong key or model, or it timed out), so feelings were missed."
    : "";
  $("labeling").hidden = !warning;
  $("labeling-text").textContent = warning;
}

async function render() {
  const [profiles, state, debug, voice, sync, auth] = await Promise.all([
    store.get("profiles"), store.get("state"), store.get("debug"), store.get("voice"), store.get("syncStatus"), store.get("auth"),
  ]);
  const today = dayKey(Date.now());

  // Feelings today, added up across sites.
  const counts = new Map<Topic, number>();
  for (const p of Object.values(profiles)) {
    const day = p?.days.find((d) => d.date === today);
    for (const [t, n] of Object.entries(day?.topicCounts ?? {}) as [Topic, number][]) counts.set(t, (counts.get(t) ?? 0) + n);
  }
  const todayBox = $("today");
  todayBox.replaceChildren(...[...counts.keys()].sort(byTopicOrder).map((t) => topicChip(t, counts.get(t))));
  if (!counts.size) todayBox.append(el("span", "empty", "Nothing picked up yet today."));

  // Recent messages: what was detected in each, newest first.
  const feed = $("feed");
  feed.replaceChildren();
  for (const r of debug.recentLabels.slice(0, 8)) {
    const li = el("li");
    const meta = el("div", "meta", `${time(r.ts)} · ${r.site}`);
    if (r.labels.source === "rules") meta.append(el("span", "rules", "· feelings not checked (no Navigator)"));
    const chips = el("div", "chips");
    chips.append(...flagChips(r.labels), ...[...r.labels.topics].sort(byTopicOrder).map((t) => topicChip(t)));
    if (!chips.childElementCount) chips.append(el("span", "empty", "Nothing notable"));
    li.append(meta, chips);
    feed.append(li);
  }
  if (!feed.childElementCount) feed.append(el("li", "empty", "No messages yet. Chat on Gemini and they'll show up here."));

  // Each site's level this week.
  const sites = $("sites");
  sites.replaceChildren();
  for (const site of Object.keys(profiles) as Site[]) {
    const s = state[site];
    const level = s?.level ?? "healthy";
    const bucket = profiles[site]?.days.find((d) => d.date === today);
    const voiceMin = voice.minutesByDay[today]?.[site] ?? 0;
    const row = el("div", "site");
    row.append(el("b", undefined, site), el("span", `level ${level}`, level));
    const parts = [`Today: ${bucket?.userTurns ?? 0} messages`, `${Math.round(bucket?.activeMinutes ?? 0)} min`];
    if (voiceMin) parts.push(`${voiceMin} min voice${voice.current[site] ? " (on now)" : ""}`);
    row.append(el("div", "sub", parts.join(" · ")));
    if (s?.reasons.length) row.append(el("div", "sub", `Why: ${s.reasons.slice(0, 2).join("; ")}`));
    sites.append(row);
  }
  if (!sites.childElementCount) sites.append(el("span", "empty", "No activity yet this week."));

  $("sync").textContent = !auth
    ? "Log in to sync with the parent dashboard."
    : sync
    ? `${sync.ok ? "✓" : "⚠"} ${auth.email} · ${sync.message} (${time(sync.at)})`
    : `Syncing as ${auth.email}`;
}

const openOptions = () => void chrome.runtime.openOptionsPage();
$("account-btn").addEventListener("click", openOptions);
$("labeling-btn").addEventListener("click", openOptions);
$("options").addEventListener("click", openOptions);
$("reset").addEventListener("click", async () => {
  if (!confirm("Delete this browser's Bridge data (feelings, levels, usage)? Your account and settings stay.")) return;
  await store.resetData();
  await render();
});
$("sync-now").addEventListener("click", () => {
  $("sync").textContent = "Syncing…";
  const msg: ToWorker = { type: "sync-now" };
  void chrome.runtime.sendMessage(msg).catch(() => {});
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.syncStatus || changes.profiles || changes.state || changes.debug || changes.auth) void render();
  if (changes.auth) void renderAccount();
  if (changes.settings || changes.debug) void renderLabeling();
});
void render();
void renderAccount();
void renderLabeling();
