import type { Site, Turn } from "../../core/src/types";

// content script → service worker
export type ToWorker =
  | { type: "turn"; turn: Turn }
  | { type: "heartbeat"; site: Site; ts: number; interacting: boolean }
  // Feature 8: mic opened or closed on an AI site. Timing only, never audio.
  | { type: "voice"; site: Site; active: boolean; ts: number }
  // options page: send this week to the sync API now
  | { type: "sync-now" }
  // privacy guard paused a message or upload. Kinds of info only, never the values.
  | { type: "privacy-pause"; site: Site; what: "message" | "file"; findings: string[]; proceeded: boolean };

// service worker → content script (chrome.tabs.sendMessage to the sender tab)
export type ToContent =
  | { type: "show-nudge"; variant: number }
  | { type: "show-crisis"; abuseAtHome: boolean };

// service worker → offscreen document
export type ToOffscreen = { type: "play-audio"; file: string };

// Page (MAIN world mic hook) → content script, via window.postMessage.
export type MicSignal = { bridge: "voice-start" | "voice-end"; ts: number };

export const SITE_BY_HOST: Record<string, Site> = {
  "chatgpt.com": "chatgpt",
  "claude.ai": "claude",
  "character.ai": "characterai",
  "gemini.google.com": "gemini",
};
