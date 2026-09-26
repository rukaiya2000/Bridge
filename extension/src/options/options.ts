import { core } from "@bridge/core";
import { scoreArc, type LabeledArc } from "../../../core/src/arc";
import type { Turn } from "../../../core/src/types";
import type { ToWorker } from "../messages";
import * as store from "../storage";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const FIXTURES = ["sample-arc.labeled.json", "demo-arc.labeled.json"];

// Endpoint presets fill in base URL and model; "Custom" leaves them for the user.
const preset = $<HTMLSelectElement>("preset");
for (const [id, p] of [...Object.entries(store.LLM_PRESETS), ["custom", { label: "Custom" }] as const]) {
  preset.append(new Option(p.label, id));
}
preset.addEventListener("change", () => {
  const p = store.LLM_PRESETS[preset.value as keyof typeof store.LLM_PRESETS];
  if (!p) return;
  $<HTMLInputElement>("llm-url").value = p.baseUrl;
  $<HTMLInputElement>("llm-model").value = p.model;
});

async function loadSettings() {
  const s = await store.get("settings");
  $<HTMLSelectElement>("provider").value = s.provider;
  $<HTMLInputElement>("llm-url").value = s.llmBaseUrl;
  $<HTMLInputElement>("llm-key").value = s.llmKey;
  $<HTMLInputElement>("llm-model").value = s.llmModel;
  const match = Object.entries(store.LLM_PRESETS).find(([, p]) => p.baseUrl === s.llmBaseUrl);
  $<HTMLSelectElement>("preset").value = match?.[0] ?? "custom";
  $<HTMLInputElement>("key").value = s.geminiKey;
  $<HTMLInputElement>("model").value = s.model;
  $<HTMLInputElement>("nudges").checked = s.nudgesEnabled;
  $<HTMLInputElement>("spoken").checked = s.spokenNudges;
  $<HTMLInputElement>("strict").checked = s.privacyStrict;
  $<HTMLInputElement>("api").value = s.apiUrl;
  $<HTMLInputElement>("child").value = s.childId;
  $("device").textContent = await store.deviceId();
}

$("save").addEventListener("click", async () => {
  await store.set("settings", {
    provider: $<HTMLSelectElement>("provider").value as store.Settings["provider"],
    llmBaseUrl: $<HTMLInputElement>("llm-url").value.trim() || store.DEFAULTS.settings.llmBaseUrl,
    llmKey: $<HTMLInputElement>("llm-key").value.trim(),
    llmModel: $<HTMLInputElement>("llm-model").value.trim() || store.DEFAULTS.settings.llmModel,
    geminiKey: $<HTMLInputElement>("key").value.trim(),
    model: $<HTMLInputElement>("model").value.trim() || store.DEFAULTS.settings.model,
    nudgesEnabled: $<HTMLInputElement>("nudges").checked,
    spokenNudges: $<HTMLInputElement>("spoken").checked,
    privacyStrict: $<HTMLInputElement>("strict").checked,
    apiUrl: $<HTMLInputElement>("api").value.trim() || store.DEFAULTS.settings.apiUrl,
    childId: $<HTMLInputElement>("child").value.trim() || store.DEFAULTS.settings.childId,
  });
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1500);
});

$("test").addEventListener("click", async () => {
  const s = await store.get("settings");
  const user: Turn = {
    id: "test:user:0", site: "gemini", conversationId: "test", role: "user",
    text: "I have a big test tomorrow and I'm stressed", ts: Date.now(),
  };
  $("test-out").textContent = "…";
  try {
    const labels = await core.labelTurn(user, null, store.labelOptions(s));
    $("test-out").textContent = JSON.stringify(labels, null, 2);
  } catch (e) {
    $("test-out").textContent = String(e);
  }
});

async function showSyncStatus() {
  const st = await store.get("syncStatus");
  $("sync-out").textContent = st ? `${st.ok ? "OK" : "Failed"}, ${new Date(st.at).toLocaleTimeString()}: ${st.message}` : "not synced yet";
}

$("sync").addEventListener("click", () => {
  $("sync-out").textContent = "…";
  const msg: ToWorker = { type: "sync-now" };
  void chrome.runtime.sendMessage(msg).catch(() => {});
});
chrome.storage.onChanged.addListener((changes) => { if (changes.syncStatus) void showSyncStatus(); });
void showSyncStatus();

async function loadArcs() {
  const select = $<HTMLSelectElement>("arc");
  for (const f of FIXTURES) {
    const res = await fetch(chrome.runtime.getURL(`fixtures/${f}`)).catch(() => null);
    if (!res?.ok) continue;
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    select.append(opt);
  }
}

$("replay").addEventListener("click", async () => {
  const f = $<HTMLSelectElement>("arc").value;
  const arc = (await (await fetch(chrome.runtime.getURL(`fixtures/${f}`))).json()) as LabeledArc;
  const table = $("replay-out");
  table.innerHTML = "<tr><th>Day</th><th>Level</th><th>Score</th></tr>";
  // Same function and zone as `node core/dist/cli.js score --mode pattern`, so the §8 merge check matches.
  const { levels_by_day, scores_by_day } = scoreArc(arc, "pattern", "UTC");
  levels_by_day.forEach((level, i) => {
    const tr = document.createElement("tr");
    for (const v of [i + 1, level, scores_by_day[i].toFixed(1)]) { const td = document.createElement("td"); td.textContent = String(v); tr.append(td); }
    table.append(tr);
  });
});

void loadSettings();
void loadArcs();
