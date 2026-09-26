// Typed helpers over chrome.storage.local. No key ever holds message text.
import type { Profile, ScoreResult, Site, TurnLabels } from "../../core/src/types";
import type { HourlyTopics, PerDaySite } from "./sync/aggregate";

export interface Settings {
  geminiKey: string;
  model: string;
  nudgesEnabled: boolean;
  spokenNudges: boolean; // feature 8
  apiUrl: string;        // sync API (api/main.py)
  childId: string;       // which child the parent dashboard shows ("demo" by default)
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
  syncStatus: { at: number; ok: boolean; message: string } | null;
}

export const DEFAULTS: Store = {
  settings: {
    geminiKey: "", model: "gemini-2.5-flash", nudgesEnabled: true, spokenNudges: true,
    apiUrl: "http://localhost:8000", childId: "demo",
  },
  profiles: {},
  state: {},
  sessions: { current: {} },
  nudges: { date: "", countToday: 0, nudgedSessionStarts: [] },
  debug: { recentLabels: [] },
  voice: { current: {}, minutesByDay: {} },
  hourly: {},
  nudgeLog: {},
  syncStatus: null,
};

export async function get<K extends keyof Store>(key: K): Promise<Store[K]> {
  const got = (await chrome.storage.local.get(key))[key] as Store[K] | undefined;
  if (key === "settings") return { ...DEFAULTS.settings, ...(got as Settings | undefined) } as Store[K]; // new fields get defaults
  return got ?? structuredClone(DEFAULTS[key]);
}

export async function set<K extends keyof Store>(key: K, value: Store[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function resetData(): Promise<void> {
  await chrome.storage.local.remove(["profiles", "state", "sessions", "nudges", "debug", "voice", "hourly", "nudgeLog", "syncStatus"]);
}
