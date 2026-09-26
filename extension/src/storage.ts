// Typed helpers over chrome.storage.local. See docs/PHASE1.md §4.7.
// Nothing stored here may contain message text.
import type { Role, Site } from "../../core/src/types";

export interface CapturedTurn {
  ts: number;
  site: Site;
  role: Role;
  id: string;
  conversationId: string;
  chars: number;
}

export interface StorageShape {
  debug: { recentTurns: CapturedTurn[] };
}

const DEFAULTS: StorageShape = {
  debug: { recentTurns: [] },
};

export async function load<K extends keyof StorageShape>(key: K): Promise<StorageShape[K]> {
  const got = await chrome.storage.local.get(key);
  return (got[key] as StorageShape[K] | undefined) ?? structuredClone(DEFAULTS[key]);
}

export async function save<K extends keyof StorageShape>(key: K, value: StorageShape[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}
