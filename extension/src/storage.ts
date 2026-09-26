// Typed helpers over chrome.storage.local. No key ever holds message text.
import type { LabelOptions, Profile, ScoreResult, Site, TurnLabels } from "../../core/src/types";
import type { HourlyTopics, PerDaySite } from "./sync/aggregate";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from "../../core/src/config";

export interface Settings {
  // Turns are labeled by UF Navigator (OpenAI-compatible). Local crisis/abuse rules always run.
  llmBaseUrl: string;
  llmKey: string;
  llmModel: string;
  nudgesEnabled: boolean;
  spokenNudges: boolean; // feature 8
  apiUrl: string;        // sync API (api/main.py)
  childId: string;       // which child the parent dashboard shows ("demo" by default)
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
  privacyLog: PerDaySite; // privacy pauses per day and site (counts only)
  // Random id for this browser install. Several devices can share one childId; the API adds them up.
  // Its own key, not in settings, so saving the options page never replaces it.
  device: { id: string } | null;
  syncStatus: { at: number; ok: boolean; message: string } | null;
}

export const DEFAULTS: Store = {
  settings: {
    llmBaseUrl: DEFAULT_LLM_BASE_URL, llmKey: "", llmModel: DEFAULT_LLM_MODEL, nudgesEnabled: true, spokenNudges: true,
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
  privacyLog: {},
  device: null,
  syncStatus: null,
};

// Settings saved when Gemini and OpenRouter were options: drop their fields, and move an OpenRouter
// endpoint (and its key) back to Navigator.
const LEGACY_KEYS = ["provider", "geminiKey", "model", "openrouterKey", "openrouterModel"];
function dropLegacy(s: Settings) {
  const r = s as unknown as Record<string, unknown>;
  for (const k of LEGACY_KEYS) delete r[k];
  if (s.llmBaseUrl.includes("openrouter.ai")) {
    Object.assign(s, { llmBaseUrl: DEFAULT_LLM_BASE_URL, llmModel: DEFAULT_LLM_MODEL, llmKey: "" });
  }
}

// What core.labelTurn needs from the settings.
export const labelOptions = (s: Settings): LabelOptions => ({
  provider: "openai",
  llmBaseUrl: s.llmBaseUrl,
  llmKey: s.llmKey || undefined,
  llmModel: s.llmModel,
});

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
  await chrome.storage.local.remove(["profiles", "state", "sessions", "nudges", "debug", "voice", "hourly", "nudgeLog", "privacyLog", "syncStatus"]);
}

// Creates this install's device id on first use.
export async function deviceId(): Promise<string> {
  const device = await get("device");
  if (device) return device.id;
  const id = crypto.randomUUID();
  await set("device", { id });
  return id;
}
