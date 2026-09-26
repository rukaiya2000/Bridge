import { Mutex } from "async-mutex";
import { core } from "@bridge/core";
import { LEVELS, type Level, type Site, type Turn, type TurnLabels } from "../../../core/src/types";
import { dayKey, isLateNight } from "../../../core/src/time";
import type { ToContent, ToOffscreen, ToWorker } from "../messages";
import * as store from "../storage";
import { buildPayload, pruneDays } from "../sync/aggregate";
import NUDGES from "../ui/nudges.json";

const PENDING_MS = 60_000;
const SESSION_IDLE_MS = 10 * 60_000;
const LATE_NIGHT_MIN_MS = 60 * 60_000;
const NUDGES_PER_DAY = 3;
const SYNC_DEBOUNCE_MS = 5_000;

// Text lives only here, in memory, until the turn is labeled.
const pending = new Map<string, { user: Turn; tabId?: number; crisisShown: boolean; timer: ReturnType<typeof setTimeout> }>();

// Every read-change-write of chrome.storage runs under this lock. Heartbeats, turns and the
// session alarm otherwise interleave across awaits and overwrite each other's updates.
// Entry points take the lock; the helpers they call assume it is held (never lock twice).
const storageLock = new Mutex();
const locked = <T>(fn: () => Promise<T>) => storageLock.runExclusive(fn);

// Created on every worker start, not only onInstalled: alarms added in an update don't exist otherwise.
for (const name of ["sessions", "sync"]) {
  // Chrome rejects with "No SW" if the extension is reloaded mid-startup; the next start retries.
  void chrome.alarms.get(name).then((a) => a ?? chrome.alarms.create(name, { periodInMinutes: 1 })).catch(() => {});
}
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "sessions") void locked(() => closeIdleSessions(Date.now()));
  if (a.name === "sync") void syncNow();
});

chrome.runtime.onMessage.addListener((msg: ToWorker, sender) => {
  const tabId = sender.tab?.id;
  if (msg.type === "turn") void onTurn(msg.turn, tabId);
  if (msg.type === "heartbeat") void locked(() => onHeartbeat(msg.site, msg.ts, msg.interacting, tabId));
  if (msg.type === "voice") void locked(() => onVoice(msg.site, msg.active, msg.ts));
  if (msg.type === "sync-now") void syncNow();
  return false;
});

function send(tabId: number | undefined, msg: ToContent) {
  if (tabId !== undefined) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

// ---- turns ----

// Pair by tab, not conversationId: in a new Gemini chat the user turn has id "new" and the
// reply has the real /app/<id>, because the URL changes after sending (PHASE1.md §9).
const pairKey = (turn: Turn, tabId?: number) => (tabId !== undefined ? `tab:${tabId}` : `conv:${turn.conversationId}`);

async function onTurn(turn: Turn, tabId?: number) {
  const key = pairKey(turn, tabId);
  if (turn.role === "user") {
    const quick = core.rulesLabel(turn, null);
    if (quick.crisis) await showCrisis(turn.site, tabId, quick.abuseAtHome);
    const prev = pending.get(key);
    if (prev) { clearTimeout(prev.timer); void processTurn(prev.user, null, prev.tabId, prev.crisisShown); }
    const timer = setTimeout(() => {
      const p = pending.get(key);
      pending.delete(key);
      if (p) void processTurn(p.user, null, p.tabId, p.crisisShown);
    }, PENDING_MS);
    pending.set(key, { user: turn, tabId, crisisShown: quick.crisis, timer });
    return;
  }
  const p = pending.get(key);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(key);
  await processTurn(p.user, turn, p.tabId, p.crisisShown);
}

async function processTurn(user: Turn, bot: Turn | null, tabId: number | undefined, crisisShown: boolean) {
  // Label outside the lock: the Gemini call can take seconds and must not stall heartbeats.
  const settings = await store.get("settings");
  const labels = await core.labelTurn(user, bot, { geminiKey: settings.geminiKey || undefined, model: settings.model });
  if (labels.crisis && !crisisShown) await showCrisis(user.site, tabId, labels.abuseAtHome);
  await locked(() => recordTurn(user, labels, tabId));
}

async function recordTurn(user: Turn, labels: TurnLabels, tabId: number | undefined) {
  const site = user.site;
  const profiles = await store.get("profiles");
  profiles[site] = core.updateProfile(profiles[site] ?? core.emptyProfile(site), labels, user.ts);
  const result = core.scoreProfile(profiles[site]!, Date.now(), Object.values(profiles));
  const state = await store.get("state");
  const previous = state[site]?.level ?? "healthy";
  state[site] = { ...result, updatedAt: Date.now() };
  await store.set("profiles", profiles);
  await store.set("state", state);

  const debug = await store.get("debug");
  debug.recentLabels = [{ ts: user.ts, site, labels }, ...debug.recentLabels].slice(0, 20);
  await store.set("debug", debug);

  // Hourly topic counts for the parent dashboard. A turn with abuse-at-home signals adds no topics:
  // its topics are part of an excluded disclosure (desc.md, privacy rule 1).
  if (!labels.abuseAtHome && labels.topics.length) {
    const hourly = pruneDays(await store.get("hourly"), user.ts);
    const hour = ((hourly[dayKey(user.ts)] ??= {})[new Date(user.ts).getHours()] ??= {});
    for (const t of labels.topics) hour[t] = (hour[t] ?? 0) + 1;
    await store.set("hourly", hourly);
  }
  scheduleSync();

  if (LEVELS.indexOf(result.level) > LEVELS.indexOf(previous) && (result.level === "watch" || result.level === "concerning")) {
    await maybeNudge(site, tabId, result.level);
  }
}

// ---- sessions ----

async function onHeartbeat(site: Site, ts: number, interacting: boolean, tabId?: number) {
  await closeIdleSessions(ts);
  if (!interacting) return;
  const sessions = await store.get("sessions");
  const cur = sessions.current[site] ?? { start: ts, lastBeat: ts };
  cur.lastBeat = ts;
  sessions.current[site] = cur;
  await store.set("sessions", sessions);

  if (isLateNight(cur.start) && ts - cur.start >= LATE_NIGHT_MIN_MS) {
    const level = (await store.get("state"))[site]?.level ?? "healthy";
    await maybeNudge(site, tabId, level);
  }
}

async function closeIdleSessions(now: number) {
  const sessions = await store.get("sessions");
  const closed = (Object.keys(sessions.current) as Site[]).filter((s) => now - sessions.current[s]!.lastBeat > SESSION_IDLE_MS);
  if (!closed.length) return;
  const profiles = await store.get("profiles");
  const state = await store.get("state");
  for (const site of closed) {
    const { start, lastBeat } = sessions.current[site]!;
    delete sessions.current[site];
    profiles[site] = core.recordSession(profiles[site] ?? core.emptyProfile(site), { site, start, end: lastBeat, paidTier: null });
    await onVoice(site, false, lastBeat);
  }
  for (const site of closed) {
    state[site] = { ...core.scoreProfile(profiles[site]!, now, Object.values(profiles)), updatedAt: now };
  }
  await store.set("sessions", sessions);
  await store.set("profiles", profiles);
  await store.set("state", state);
  scheduleSync();
}

// ---- nudges and crisis ----

async function maybeNudge(site: Site, tabId: number | undefined, level: Level) {
  const settings = await store.get("settings");
  if (!settings.nudgesEnabled || level === "crisis") return;
  const sessionStart = (await store.get("sessions")).current[site]?.start;
  const nudges = await store.get("nudges");
  const today = dayKey(Date.now());
  if (nudges.date !== today) Object.assign(nudges, { date: today, countToday: 0, nudgedSessionStarts: [] });
  if (sessionStart !== undefined && nudges.nudgedSessionStarts.includes(sessionStart)) return;
  if (nudges.countToday >= NUDGES_PER_DAY) return;

  const variant = nudges.countToday % NUDGES.length;
  nudges.countToday += 1;
  if (sessionStart !== undefined) nudges.nudgedSessionStarts.push(sessionStart);
  await store.set("nudges", nudges);
  const log = pruneDays(await store.get("nudgeLog"), Date.now());
  (log[today] ??= {})[site] = (log[today]?.[site] ?? 0) + 1;
  await store.set("nudgeLog", log);
  send(tabId, { type: "show-nudge", variant });
  await speakIfVoice(site, `audio/nudge-${variant}.mp3`);
}

async function showCrisis(site: Site, tabId: number | undefined, abuseAtHome: boolean) {
  send(tabId, { type: "show-crisis", abuseAtHome });
  await speakIfVoice(site, abuseAtHome ? "audio/crisis-abuse.mp3" : "audio/crisis.mp3");
}

// ---- voice mode (feature 8) ----

async function onVoice(site: Site, active: boolean, ts: number) {
  const voice = await store.get("voice");
  const cur = voice.current[site];
  if (active) {
    if (!cur) voice.current[site] = { start: ts };
  } else if (cur) {
    delete voice.current[site];
    const day = (voice.minutesByDay[dayKey(cur.start)] ??= {});
    day[site] = (day[site] ?? 0) + Math.round((ts - cur.start) / 60000);
    // TODO(phase 2): feed voice minutes into core via SessionEvent once the contract change is agreed.
  }
  await store.set("voice", voice);
}

async function speakIfVoice(site: Site, file: string) {
  const [settings, voice] = await Promise.all([store.get("settings"), store.get("voice")]);
  if (!settings.spokenNudges || !voice.current[site]) return;
  await ensureOffscreen();
  const msg: ToOffscreen = { type: "play-audio", file };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Speak Bridge nudges and crisis resources while the teen is in a chatbot's voice mode.",
  });
}

// ---- sync to the parent dashboard (api/main.py POST /sync) ----

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncing: Promise<void> | undefined;

// Coalesces bursts of turns into one sync a few seconds later. The 1-minute alarm is the backstop.
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
}

// Sends the current week. Each sync replaces the whole week on the server, so repeats are safe.
function syncNow(): Promise<void> {
  syncing ??= doSync().finally(() => (syncing = undefined));
  return syncing;
}

async function doSync() {
  const now = Date.now();
  let status: NonNullable<store.Store["syncStatus"]>;
  try {
    status = await trySync(now);
  } catch (e) {
    status = { at: now, ok: false, message: `sync error: ${String(e)}` };
  }
  await locked(() => store.set("syncStatus", status));
}

async function trySync(now: number): Promise<NonNullable<store.Store["syncStatus"]>> {
  const { settings, payload } = await locked(async () => {
    const [settings, profiles, hourly, voice, nudgeLog] = await Promise.all([
      store.get("settings"), store.get("profiles"), store.get("hourly"), store.get("voice"), store.get("nudgeLog"),
    ]);
    const payload = buildPayload({
      childId: settings.childId, now, profiles, hourly, voiceMinutes: voice.minutesByDay, nudges: nudgeLog,
    });
    return { settings, payload };
  });
  let status: NonNullable<store.Store["syncStatus"]>;
  if (!payload.sites.length) {
    status = { at: now, ok: true, message: "nothing to sync yet this week" };
  } else {
    try {
      const res = await fetch(`${settings.apiUrl.replace(/\/+$/, "")}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      status = res.ok
        ? { at: now, ok: true, message: `synced week of ${payload.week_start} (${payload.sites.length} sites)` }
        : { at: now, ok: false, message: `API ${res.status}: ${(await res.text()).slice(0, 200)}` };
    } catch (e) {
      status = { at: now, ok: false, message: `API unreachable at ${settings.apiUrl} (${String(e)})` };
    }
  }
  return status;
}
