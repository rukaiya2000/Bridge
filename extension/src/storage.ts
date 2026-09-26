// Typed helpers over chrome.storage.local. No key ever holds message text.
import type { HourlyCounts, PerSiteByDay } from "../../core/src/aggregate";
import type { Profile, ScoreResult, Site, TurnLabels } from "../../core/src/types";

export interface Settings {
  geminiKey: string;
  model: string;
  nudgesEnabled: boolean;
  spokenNudges: boolean; // feature 8
  apiUrl: string;       // parent sync API
  childId: string;
}

export interface Store {
  settings: Settings;
  profiles: Partial<Record<Site, Profile>>;
  state: Partial<Record<Site, ScoreResult & { updatedAt: number }>>;
  sessions: { current: Partial<Record<Site, { start: number; lastBeat: number }>> };
  nudges: { date: string; countToday: number; nudgedSessionStarts: number[]; byDay: PerSiteByDay };
  hourly: HourlyCounts; // topic counts per "YYYY-MM-DD|H", parent-visible topics only
  sync: { lastAt: number; ok: boolean; message: string };
  debug: { recentLabels: { ts: number; site: Site; labels: TurnLabels }[] };
  // Feature 8. Kept extension-side until the Phase 2 contract change (PHASE1.md §9) is agreed.
  voice: {
    current: Partial<Record<Site, { start: number }>>;
    minutesByDay: Record<string, Partial<Record<Site, number>>>;
  };
}

export const DEFAULTS: Store = {
  settings: { geminiKey: "", model: "gemini-3.8-flash", nudgesEnabled: true, spokenNudges: true, apiUrl: "http://localhost:8000", childId: "demo" },
  profiles: {},
  state: {},
  sessions: { current: {} },
  nudges: { date: "", countToday: 0, nudgedSessionStarts: [], byDay: {} },
  hourly: {},
  sync: { lastAt: 0, ok: false, message: "not synced yet" },
  debug: { recentLabels: [] },
  voice: { current: {}, minutesByDay: {} },
};

export async function get<K extends keyof Store>(key: K): Promise<Store[K]> {
  const got = await chrome.storage.local.get(key);
  const value = got[key] as Store[K] | undefined;
  // Merge objects over their defaults so fields added later (e.g. settings.apiUrl) get a value.
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...structuredClone(DEFAULTS[key]), ...value };
  return value ?? structuredClone(DEFAULTS[key]);
}

export async function set<K extends keyof Store>(key: K, value: Store[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function resetData(): Promise<void> {
  await chrome.storage.local.remove(["profiles", "state", "sessions", "nudges", "debug", "voice", "hourly", "sync"]);
}
