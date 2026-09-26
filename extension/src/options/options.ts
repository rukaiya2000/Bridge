import { core } from "@bridge/core";
import type { Profile, SessionEvent, Site, Turn, TurnLabels } from "../../../core/src/types";
import * as store from "../storage";

interface LabeledArc {
  id: string;
  site: Site;
  sessions: { start: number; end: number; turns: { ts: number; labels: TurnLabels }[] }[];
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const DAY = 86_400_000;
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

// Same day logic as `node core/dist/cli.js score --mode pattern`; the Phase 1 merge check compares them.
function replay(arc: LabeledArc): { day: number; level: string; score: number }[] {
  const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const first = startOfDay(arc.sessions[0].start);
  const last = startOfDay(arc.sessions[arc.sessions.length - 1].start);
  const rows = [];
  for (let day = first, n = 1; day <= last; day += DAY, n++) {
    const endOfDay = day + DAY - 1;
    let p: Profile = core.emptyProfile(arc.site);
    for (const s of arc.sessions.filter((s) => s.start <= endOfDay)) {
      for (const t of s.turns.filter((t) => t.ts <= endOfDay)) p = core.updateProfile(p, t.labels, t.ts);
      const ev: SessionEvent = { site: arc.site, start: s.start, end: s.end, paidTier: null };
      p = core.recordSession(p, ev);
    }
    const r = core.scoreProfile(p, endOfDay);
    rows.push({ day: n, level: r.level, score: r.score });
  }
  return rows;
}

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
  for (const r of replay(arc)) {
    const tr = document.createElement("tr");
    for (const v of [r.day, r.level, r.score.toFixed(1)]) { const td = document.createElement("td"); td.textContent = String(v); tr.append(td); }
    table.append(tr);
  }
});

void loadSettings();
void loadArcs();
