import type { Turn, TurnLabels } from "../src/types.js";

export const BASE = 1788220800000; // day 1, 2026-09-01 00:00 UTC
export const DAY = 86_400_000;

export const turn = (text: string, role: Turn["role"] = "user", ts = BASE): Turn =>
  ({ id: `t:${role}:0`, site: "gemini", conversationId: "t", role, text, ts });

export const labels = (o: Partial<TurnLabels> = {}): TurnLabels => ({
  topics: [], dependency: false, isolation: false, botHook: false, crisis: false,
  abuseAtHome: false, excludedTopics: [], source: "rules", ...o,
});
