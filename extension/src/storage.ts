// Typed helpers over chrome.storage.local. No key ever holds message text.
import type { LabelOptions, Profile, ScoreResult, Site, TurnLabels } from "../../core/src/types";
import type { HourlyTopics, PerDaySite } from "./sync/aggregate";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL, DEFAULT_MODEL } from "../../core/src/config";

export interface Settings {
  provider: "gemini" | "openai"; // which LLM labels turns; "openai" = any OpenAI-compatible API. Local rules always run.
  geminiKey: string;
  model: string;
  llmBaseUrl: string;    // e.g. UF Navigator or OpenRouter (LLM_PRESETS)
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

// Models the Gemini API no longer serves to this project (404). Saved settings move to DEFAULT_MODEL.
const RETIRED_MODELS = ["gemini-2.5-flash"];

export const DEFAULTS: Store = {
  settings: {
    provider: "openai", geminiKey: "", model: DEFAULT_MODEL,
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

// OpenAI-compatible endpoints the options page can fill in. Each needs a host permission in manifest.json.
export const LLM_PRESETS = {
  navigator: { label: "UF Navigator (Gemma)", baseUrl: DEFAULT_LLM_BASE_URL, model: DEFAULT_LLM_MODEL },
  openrouter: { label: "OpenRouter (Gemini)", baseUrl: "https://openrouter.ai/api/v1", model: "google/gemini-3.8-flash" },
} as const;

// Settings saved before the OpenAI-compatible provider had an OpenRouter-only provider.
interface LegacySettings { provider: string; openrouterKey?: string; openrouterModel?: string }
function migrateOpenRouter(s: Settings & LegacySettings) {
  if ((s.provider as string) !== "openrouter") return;
  Object.assign(s, {
    provider: "openai", llmBaseUrl: LLM_PRESETS.openrouter.baseUrl, llmKey: s.openrouterKey ?? "", llmModel: LLM_PRESETS.openrouter.model,
  });
  delete s.openrouterKey;
  delete s.openrouterModel;
}

// What core.labelTurn needs from the settings.
export const labelOptions = (s: Settings): LabelOptions => ({
  provider: s.provider,
  geminiKey: s.geminiKey || undefined,
  model: s.model,
  llmBaseUrl: s.llmBaseUrl,
  llmKey: s.llmKey || undefined,
  llmModel: s.llmModel,
});

export async function get<K extends keyof Store>(key: K): Promise<Store[K]> {
  const got = (await chrome.storage.local.get(key))[key] as Store[K] | undefined;
  if (key === "settings") {
    const s = { ...DEFAULTS.settings, ...(got as Settings | undefined) }; // new fields get defaults
    if (RETIRED_MODELS.includes(s.model)) s.model = DEFAULT_MODEL;
    migrateOpenRouter(s as Settings & LegacySettings);
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
