import { core } from "@bridge/core";
import { scoreArc, type LabeledArc } from "../../../core/src/arc";
import type { Turn } from "../../../core/src/types";
import type { ToWorker } from "../messages";
import * as store from "../storage";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const FIXTURES = ["sample-arc.labeled.json", "demo-arc.labeled.json"];

async function loadSettings() {
  const s = await store.get("settings");
  $<HTMLInputElement>("llm-url").value = s.llmBaseUrl;
  $<HTMLInputElement>("llm-key").value = s.llmKey;
  $<HTMLInputElement>("llm-model").value = s.llmModel;
  $<HTMLInputElement>("nudges").checked = s.nudgesEnabled;
  $<HTMLInputElement>("spoken").checked = s.spokenNudges;
  $<HTMLInputElement>("strict").checked = s.privacyStrict;
  $<HTMLInputElement>("api").value = s.apiUrl;
  $<HTMLInputElement>("child").value = s.childId;
  $("device").textContent = await store.deviceId();
}

// ---- account (api/auth.py). Log in with the settings' API URL, so save a changed URL first. ----

async function showAuth() {
  const auth = await store.get("auth");
  $("logged-out").hidden = !!auth;
  $("logged-in").hidden = !auth;
  $("who").textContent = auth?.email ?? "";
}

async function authRequest(path: "login" | "signup") {
  const { apiUrl } = await store.get("settings");
  const email = $<HTMLInputElement>("email").value.trim();
  const password = $<HTMLInputElement>("password").value;
  $("auth-out").textContent = "…";
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/auth/${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      $("auth-out").textContent = typeof body.detail === "string" ? body.detail : "Enter a valid email and a password of at least 8 characters";
      return;
    }
    await store.set("auth", { token: body.token, email: body.email });
    $<HTMLInputElement>("password").value = "";
    $("auth-out").textContent = "";
    await showAuth();
    const msg: ToWorker = { type: "sync-now" };
    void chrome.runtime.sendMessage(msg).catch(() => {});
  } catch (e) {
    $("auth-out").textContent = `API unreachable at ${apiUrl} (${String(e)})`;
  }
}

$("login").addEventListener("click", () => void authRequest("login"));
$("signup").addEventListener("click", () => void authRequest("signup"));
$("logout").addEventListener("click", async () => {
  const [{ apiUrl }, auth] = await Promise.all([store.get("settings"), store.get("auth")]);
  if (auth) {
    await fetch(`${apiUrl.replace(/\/+$/, "")}/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${auth.token}` } }).catch(() => {});
  }
  await store.set("auth", null);
  await showAuth();
});

$("save").addEventListener("click", async () => {
  await store.set("settings", {
    llmBaseUrl: $<HTMLInputElement>("llm-url").value.trim() || store.DEFAULTS.settings.llmBaseUrl,
    llmKey: $<HTMLInputElement>("llm-key").value.trim(),
    llmModel: $<HTMLInputElement>("llm-model").value.trim() || store.DEFAULTS.settings.llmModel,
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
void showAuth();
void loadArcs();
