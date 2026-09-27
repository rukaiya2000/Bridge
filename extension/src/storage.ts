// Typed helpers over chrome.storage.local. No key ever holds message text.
import type { LabelOptions, Profile, ScoreResult, Site, TurnLabels } from "../../core/src/types";
import type { DayLog, HourlyTopics, PerDaySite, PrivacyEntry, VoiceEntry } from "./sync/aggregate";

// OpenRouter key for Jev, copied from the repo's .env by build.mjs. It ships inside dist/, so any
// build given to someone else gives them the key: fine for local and demo builds only.
declare const __OPENROUTER_API_KEY__: string;
export const JEV_KEY = typeof __OPENROUTER_API_KEY__ === "string" ? __OPENROUTER_API_KEY__ : "";

export interface Settings {
  // Turns are labeled by Jev on OpenRouter (key from the build, see JEV_KEY). Local crisis/abuse rules always run.
  nudgesEnabled: boolean;
  spokenNudges: boolean; // feature 8
  apiUrl: string;        // sync API (api/main.py)
  childId: string;       // which child the parent dashboard shows ("demo" by default), within the account
  privacyStrict: boolean; // true: personal info can't be sent at all (no "send anyway")
}

export interface Store {
  settings: Settings;
  profiles: Partial<Record<Site, Profile>>;
  state: Partial<Record<Site, ScoreResult & { updatedAt: number }>>;
  sessions: { current: Partial<Record<Site, { start: number; lastBeat: number }>> };
  nudges: { date: string; countToday: number; nudgedSessionStarts: number[] };
  debug: { recentLabels: { ts: number; site: Site; labels: TurnLabels }[] };
  // Feature 8. Kept extension-side until the Phase 2 contract change (PHASE1.md §9) is agreed.
  voice: {
    current: Partial<Record<Site, { start: number }>>;
    minutesByDay: Record<string, Partial<Record<Site, number>>>;
  };
  // Aggregates kept only for sync (sync/aggregate.ts). Topic labels and counts, never text.
  hourly: HourlyTopics;
  nudgeLog: PerDaySite;
  voiceLog: DayLog<VoiceEntry>;        // each mic use: when and how long, never audio
  privacyFlags: DayLog<PrivacyEntry>;  // each privacy pause: kinds of info, never the values
  // Random id for this browser install. Several devices can share one childId; the API adds them up.
  // Its own key, not in settings, so saving the options page never replaces it.
  device: { id: string } | null;
  // Bridge account this browser syncs to (api/auth.py). Its own key so saving settings never logs out.
  auth: { token: string; email: string } | null;
  syncStatus: { at: number; ok: boolean; message: string } | null;
}

export const DEFAULTS: Store = {
  settings: {
    nudgesEnabled: true, spokenNudges: true,
    apiUrl: "http://localhost:8000", childId: "demo", privacyStrict: false,
  },
  profiles: {},
  state: {},
  sessions: { current: {} },
  nudges: { date: "", countToday: 0, nudgedSessionStarts: [] },
  debug: { recentLabels: [] },
  voice: { current: {}, minutesByDay: {} },
  hourly: {},
  nudgeLog: {},
  voiceLog: {},
  privacyFlags: {},
  device: null,
  auth: null,
  syncStatus: null,
};

// Settings saved by older versions (Gemini, OpenRouter chat, UF Navigator): drop their fields, keys included.
const LEGACY_KEYS = ["provider", "geminiKey", "model", "openrouterKey", "openrouterModel", "llmBaseUrl", "llmKey", "llmModel"];
function dropLegacy(s: Settings) {
  const r = s as unknown as Record<string, unknown>;
  for (const k of LEGACY_KEYS) delete r[k];
}

// What core.labelTurn needs.
export const labelOptions = (): LabelOptions => ({ jevKey: JEV_KEY || undefined });

export async function get<K extends keyof Store>(key: K): Promise<Store[K]> {
  const got = (await chrome.storage.local.get(key))[key] as Store[K] | undefined;
  if (key === "settings") {
    const s = { ...DEFAULTS.settings, ...(got as Settings | undefined) }; // new fields get defaults
    dropLegacy(s);
    return s as Store[K];
  }
  return got ?? structuredClone(DEFAULTS[key]);
}

export async function set<K extends keyof Store>(key: K, value: Store[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function resetData(): Promise<void> {
  await chrome.storage.local.remove(["profiles", "state", "sessions", "nudges", "debug", "voice", "hourly", "nudgeLog", "voiceLog", "privacyFlags", "privacyLog", "syncStatus"]);
}

// Creates this install's device id on first use.
export async function deviceId(): Promise<string> {
  const device = await get("device");
  if (device) return device.id;
  const id = crypto.randomUUID();
  await set("device", { id });
  return id;
}
