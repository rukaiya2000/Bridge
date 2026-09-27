import { Mutex } from "async-mutex";
import { core } from "@bridge/core";
import { LEVELS, type Level, type Site, type Turn, type TurnLabels } from "../../../core/src/types";
import { dayKey, isLateNight } from "../../../core/src/time";
import { addActiveMinutes, startSession } from "../../../core/src/profile";
import type { ToContent, ToOffscreen, ToWorker } from "../messages";
import * as store from "../storage";
import { buildPayload, pruneDays } from "../sync/aggregate";
import NUDGES from "../ui/nudges.json";
import { redactPersonal, type Finding } from "../privacy/detect";
import type { PauseOutcome } from "../ui/privacy";
import { checkSafety } from "../../../core/src/safety";

const PENDING_MS = 60_000;
const SESSION_IDLE_MS = 10 * 60_000;
const LATE_NIGHT_MIN_MS = 60 * 60_000;
const NUDGES_PER_DAY = 3;
const SYNC_DEBOUNCE_MS = 5_000;
// Heartbeats come every 30 s while the teen is active. A longer gap (laptop asleep, tab in the
// background) is not counted as time on AI.
const MAX_BEAT_GAP_MS = 2 * 60_000;

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

// ---- account: nothing syncs until someone logs in, so make that hard to miss ----

// First install opens the Options page, where the Account section is at the top.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL && !(await store.get("auth"))) {
    void chrome.runtime.openOptionsPage();
  }
});

// Logging in on the dashboard logs the extension in too (content/dashboard.ts). It trades the
// dashboard's token for its own, so logging out of one doesn't log out the other.
async function adoptDashboardSession(token: string, email: string) {
  const current = await store.get("auth");
  if (current?.email === email) return;
  const { apiUrl } = await store.get("settings");
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/auth/session`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return console.warn(`[Bridge] couldn't pick up the dashboard login: API ${res.status}`);
    const body = await res.json();
    await store.set("auth", { token: body.token, email: body.email });
    console.info(`[Bridge] logged in as ${body.email} from the dashboard`);
    void syncNow();
  } catch (e) {
    console.warn(`[Bridge] couldn't pick up the dashboard login: ${String(e)}`);
  }
}

// A "!" on the toolbar icon while logged out.
async function showLoginBadge() {
  const loggedIn = !!(await store.get("auth"));
  await chrome.action.setBadgeText({ text: loggedIn ? "" : "!" });
  await chrome.action.setBadgeBackgroundColor({ color: "#c05621" });
  await chrome.action.setTitle({ title: loggedIn ? "Bridge" : "Bridge: log in to sync" });
}
void showLoginBadge();
chrome.storage.onChanged.addListener((changes) => { if (changes.auth) void showLoginBadge(); });

chrome.runtime.onMessage.addListener((msg: ToWorker, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (msg.type === "turn") void onTurn(msg.turn, tabId);
  if (msg.type === "dashboard-session") void adoptDashboardSession(msg.token, msg.email);
  if (msg.type === "heartbeat") void locked(() => onHeartbeat(msg.site, msg.ts, msg.interacting, tabId));
  if (msg.type === "voice") void locked(() => onVoice(msg.site, msg.active, msg.ts));
  if (msg.type === "sync-now") void syncNow();
  if (msg.type === "privacy-pause") void locked(() => onPrivacyPause(msg.site, msg.what, msg.findings, msg.outcome));
  // RPC: the content script waits for this answer before the message may reach the chatbot.
  if (msg.type === "safety-check") {
    void safetyCheck(msg.site, msg.text).then(sendResponse);
    return true; // keeps the channel open for the async sendResponse
  }
  return false;
});

// ---- safety gate (core/src/safety.ts) ----

// Jev scores the message (personal details removed first); the threshold comes from the Options page.
async function safetyCheck(site: Site, text: string) {
  const settings = await store.get("settings");
  const verdict = await checkSafety(redactPersonal(text), {
    site, threshold: settings.safetyThreshold, jevKey: settings.safetyGate ? store.JEV_KEY || undefined : undefined,
  });
  // Categories and score only, never the text.
  console.info(`[Bridge] safety gate on ${site}: ${verdict.block ? "BLOCKED" : "allowed"} score=${verdict.score.toFixed(2)} threshold=${verdict.threshold} via ${verdict.source}`, verdict.categories);
  return verdict;
}

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
  // Label outside the lock: the Jev call can take seconds and must not stall heartbeats.
  // Personal details are replaced before the text leaves the device for labeling (Jev on OpenRouter).
  // The on-device crisis/abuse rules inside labelTurn still work: those phrases are not personal details.
  const clean = (t: Turn | null) => t && { ...t, text: redactPersonal(t.text) };
  const labels = await core.labelTurn(clean(user)!, clean(bot), store.labelOptions());
  // Labels only, never the text (open the service worker's DevTools from chrome://extensions to see these).
  console.info(`[Bridge] labeled ${user.site} turn via ${labels.source}:`, labels);
  if (labels.source === "rules") {
    console.warn(store.JEV_KEY
      ? "[Bridge] Jev failed for this turn, so only crisis/abuse rules ran (see the jev failed line above for the status)"
      : "[Bridge] no OPENROUTER_API_KEY in .env when the extension was built, so only crisis/abuse rules ran: feelings and topics are not detected");
  }
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
  console.info(`[Bridge] ${site} level ${previous} -> ${result.level} (score ${result.score.toFixed(1)})`, result.reasons);
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
  const [sessions, profiles] = await Promise.all([store.get("sessions"), store.get("profiles")]);
  let profile = profiles[site] ?? core.emptyProfile(site);
  let cur = sessions.current[site];
  if (!cur) {
    // Counted when it opens (not when it closes), so the dashboard is current during a session.
    cur = { start: ts, lastBeat: ts };
    profile = startSession(profile, ts);
  } else {
    const gap = ts - cur.lastBeat;
    if (gap > 0 && gap <= MAX_BEAT_GAP_MS) profile = addActiveMinutes(profile, ts, gap / 60_000);
    cur.lastBeat = ts;
  }
  sessions.current[site] = cur;
  profiles[site] = profile;
  await Promise.all([store.set("sessions", sessions), store.set("profiles", profiles)]);

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
    // Minutes and the session itself were already counted live (onHeartbeat); just end it.
    const { lastBeat } = sessions.current[site]!;
    delete sessions.current[site];
    profiles[site] ??= core.emptyProfile(site);
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
  // No on-screen card (removed on purpose); the parent sees the crisis level, and voice mode speaks the helplines.
  console.warn(`[Bridge] crisis signal on ${site} (never synced as text)`);
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
    const minutes = Math.round((ts - cur.start) / 60000);
    const day = (voice.minutesByDay[dayKey(cur.start)] ??= {});
    day[site] = (day[site] ?? 0) + minutes;
    // Each mic use is logged for the parent's activity list, even one shorter than a minute.
    const log = pruneDays(await store.get("voiceLog"), ts);
    (log[dayKey(cur.start)] ??= []).push({ hour: new Date(cur.start).getHours(), site, minutes });
    await store.set("voiceLog", log);
    scheduleSync();
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
  (status.ok ? console.info : console.warn)(`[Bridge] sync: ${status.message}`);
  await locked(() => store.set("syncStatus", status));
}

async function trySync(now: number): Promise<NonNullable<store.Store["syncStatus"]>> {
  const { settings, auth, payload } = await locked(async () => {
    const [settings, auth, profiles, hourly, voice, nudgeLog, voiceLog, privacyFlags] = await Promise.all([
      store.get("settings"), store.get("auth"), store.get("profiles"), store.get("hourly"), store.get("voice"), store.get("nudgeLog"),
      store.get("voiceLog"), store.get("privacyFlags"),
    ]);
    const payload = buildPayload({
      childId: settings.childId, deviceId: await store.deviceId(), now, profiles, hourly, voiceMinutes: voice.minutesByDay, nudges: nudgeLog,
      voiceLog, privacyFlags,
    });
    return { settings, auth, payload };
  });
  let status: NonNullable<store.Store["syncStatus"]>;
  console.info(`[Bridge] sync payload for ${payload.child_id}, week of ${payload.week_start}:`, payload);
  if (!auth) {
    status = { at: now, ok: false, message: "not logged in: log in on the Options page to sync" };
  } else if (!payload.sites.length) {
    status = { at: now, ok: true, message: "nothing to sync yet this week" };
  } else {
    try {
      const res = await fetch(`${settings.apiUrl.replace(/\/+$/, "")}/sync`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(payload),
      });
      status = res.ok
        ? { at: now, ok: true, message: `synced week of ${payload.week_start} (${payload.sites.length} sites) to ${auth.email}` }
        : res.status === 401
        ? { at: now, ok: false, message: "login expired: log in again on the Options page" }
        : { at: now, ok: false, message: `API ${res.status}: ${(await res.text()).slice(0, 200)}` };
    } catch (e) {
      status = { at: now, ok: false, message: `API unreachable at ${settings.apiUrl} (${String(e)})` };
    }
  }
  return status;
}

// ---- privacy guard (privacy/guard.ts) ----

const OUTCOME_LOG: Record<PauseOutcome, string> = { held: "held back", hidden: "sent with details hidden", sent: "sent anyway" };

async function onPrivacyPause(site: Site, what: "message" | "file", findings: Finding[], outcome: PauseOutcome) {
  console.info(`[Bridge] privacy pause on ${site}: ${what} with [${findings}], ${OUTCOME_LOG[outcome]}`);
  const now = Date.now();
  const log = pruneDays(await store.get("privacyFlags"), now);
  (log[dayKey(now)] ??= []).push({ hour: new Date(now).getHours(), site, what, findings, sent: outcome === "sent", hidden: outcome === "hidden" });
  await store.set("privacyFlags", log);
  scheduleSync();
}
