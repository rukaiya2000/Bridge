import type { Week } from "./types";

// Shown when the API has no data yet, so the layout can be built before sync works.
export const SAMPLE_WEEK: Week = {
  child_id: "demo",
  week_start: "2026-09-01",
  sites: [
    { site: "gemini", level: "concerning", score: 10.6, active_minutes: 355, late_night_sessions: 5,
      voice_minutes: 40, nudges_shown: 2, paid_tier: false },
  ],
  hourly_topics: [
    { date: "2026-09-03", hour: 23, topic: "loneliness", count: 2 },
    { date: "2026-09-04", hour: 0, topic: "loneliness", count: 1 },
    { date: "2026-09-05", hour: 23, topic: "friends", count: 1 },
    { date: "2026-09-06", hour: 0, topic: "sadness", count: 1 },
    { date: "2026-09-07", hour: 23, topic: "friends", count: 1 },
    { date: "2026-09-02", hour: 21, topic: "school", count: 2 },
  ],
};

// TODO(phase 2): vetted template set stored in MongoDB, never free generation (desc.md feature 2).
export const STARTERS: Record<string, string> = {
  loneliness: "I've been feeling stretched lately. How are things with your friends?",
  friends: "Who have you been hanging out with lately? I'd love to hear about them.",
  default: "What's been the best and hardest part of your week?",
};
