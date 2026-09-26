// Mirrors api/models.py. Aggregates only, never message text.
export type Level = "healthy" | "watch" | "concerning" | "crisis";

export interface SiteAggregate {
  site: string;
  level: Level;
  score: number;
  active_minutes: number;
  late_night_sessions: number;
  voice_minutes: number;
  nudges_shown: number;
  paid_tier: boolean | null;
}

export interface HourlyTopicCount { date: string; hour: number; topic: string; count: number }

export interface Week {
  child_id: string;
  week_start: string;
  sites: SiteAggregate[];
  hourly_topics: HourlyTopicCount[];
}
