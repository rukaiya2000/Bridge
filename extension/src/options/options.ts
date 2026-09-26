import { core } from "@bridge/core";
import { scoreArc, type LabeledArc } from "../../../core/src/arc";
import type { Turn } from "../../../core/src/types";
import * as store from "../storage";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const FIXTURES = ["sample-arc.labeled.json", "demo-arc.labeled.json"];

async function loadSettings() {
  const s = await store.get("settings");
  $<HTMLInputElement>("key").value = s.geminiKey;
  $<HTMLInputElement>("model").value = s.model;
  $<HTMLInputElement>("nudges").checked = s.nudgesEnabled;
  $<HTMLInputElement>("spoken").checked = s.spokenNudges;
}

$("save").addEventListener("click", async () => {
  await store.set("settings", {
    geminiKey: $<HTMLInputElement>("key").value.trim(),
    model: $<HTMLInputElement>("model").value.trim() || "gemini-2.5-flash",
    nudgesEnabled: $<HTMLInputElement>("nudges").checked,
    spokenNudges: $<HTMLInputElement>("spoken").checked,
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
    const labels = await core.labelTurn(user, null, { geminiKey: s.geminiKey || undefined, model: s.model });
    $("test-out").textContent = JSON.stringify(labels, null, 2);
  } catch (e) {
    $("test-out").textContent = String(e);
  }
});


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
