// Aggregator: turns local counts into the weekly SyncPayload (api/models.py). Pure, no chrome APIs.
// Privacy rules from desc.md run here, before anything leaves the device:
//   1. Excluded topics never sync (only `topics` are counted per hour; excludedCounts are dropped).
//   2. Abuse-aware masking: if abuse-at-home and crisis signals are both in the week, the week is
//      scored as if they never happened, so the server never holds the unmasked level.
import { format, parseISO, startOfISOWeek } from "date-fns";
import { core } from "@bridge/core";
import type { DayBucket, Level, Profile, Site, Topic } from "../../../core/src/types";
import { dayKey, shiftDay } from "../../../core/src/time";
import type { Finding } from "../privacy/detect";

// Per local day, per hour ("0".."23"), per parent-visible topic.
export type HourlyTopics = Record<string, Record<string, Partial<Record<Topic, number>>>>;
// Per local day, per site.
export type PerDaySite = Record<string, Partial<Record<Site, number>>>;
// Per local day, a list of events. Timing and kinds of info only, never audio, text or values.
export type DayLog<T> = Record<string, T[]>;
export interface VoiceEntry { hour: number; site: Site; minutes: number }
export interface PrivacyEntry { hour: number; site: Site; what: "message" | "file"; findings: Finding[]; sent: boolean; hidden?: boolean }

export interface SyncPayload {
  child_id: string;
  device_id: string;
  week_start: string;
  sites: {
    site: Site;
    level: Level;
    score: number;
    active_minutes: number;
    late_night_sessions: number;
    voice_minutes: number;
    nudges_shown: number;
    privacy_pauses: number;
    paid_tier: boolean | null;
  }[];
  hourly_topics: { date: string; hour: number; topic: Topic; count: number }[];
  voice_sessions: (VoiceEntry & { date: string })[];
  privacy_flags: (PrivacyEntry & { date: string })[];
}

export interface AggregateInput {
  childId: string;
  deviceId: string;
  now: number;
  profiles: Partial<Record<Site, Profile>>;
  hourly: HourlyTopics;
  voiceMinutes: PerDaySite;
  nudges: PerDaySite;
  voiceLog?: DayLog<VoiceEntry>;       // each mic use
  privacyFlags?: DayLog<PrivacyEntry>; // each privacy pause
}

// Monday of the local week containing `ts`, "YYYY-MM-DD".
export const weekStartKey = (ts: number): string => format(startOfISOWeek(parseISO(dayKey(ts))), "yyyy-MM-dd");

const weekDays = (start: string): string[] => Array.from({ length: 7 }, (_, i) => shiftDay(start, -i));

// Drops the crisis and abuse counters when both appear in the week (desc.md, privacy rule 2).
export function maskAbuse(days: DayBucket[]): DayBucket[] {
  const abuse = days.some((d) => d.abuseAtHome > 0);
  const crisis = days.some((d) => d.crisis > 0);
  if (!(abuse && crisis)) return days;
  return days.map((d) => ({ ...d, crisis: 0, abuseAtHome: 0 }));
}

export function buildPayload(input: AggregateInput): SyncPayload {
  const start = weekStartKey(input.now);
  const days = new Set(weekDays(start));
  const inWeek = (p: Profile): Profile => ({
    site: p.site,
    days: maskAbuse(p.days.filter((d) => days.has(d.date))).map((d) => ({ ...d, excludedCounts: {} })),
  });
  const week = Object.values(input.profiles).map(inWeek).filter((p) => p.days.length);
  const sumDays = (rec: PerDaySite, site: Site) => [...days].reduce((n, d) => n + (rec[d]?.[site] ?? 0), 0);
  const inWeekLog = <T>(log: DayLog<T> = {}) => [...days].sort().flatMap((date) => (log[date] ?? []).map((e) => ({ ...e, date })));
  const voice_sessions = inWeekLog(input.voiceLog);
  const privacy_flags = inWeekLog(input.privacyFlags);

  const sites = week.map((p) => {
    const { level, score } = core.scoreProfile(p, input.now, week);
    return {
      site: p.site,
      level,
      score,
      active_minutes: Math.round(p.days.reduce((n, d) => n + d.activeMinutes, 0)), // tracked in fractions of a minute
      late_night_sessions: p.days.reduce((n, d) => n + d.lateNightSessions, 0),
      voice_minutes: Math.round(sumDays(input.voiceMinutes, p.site)), // stored as exact fractions
      nudges_shown: sumDays(input.nudges, p.site),
      privacy_pauses: privacy_flags.filter((f) => f.site === p.site).length,
      paid_tier: null, // not detected yet
    };
  });

  const hourly_topics: SyncPayload["hourly_topics"] = [];
  for (const date of [...days].sort()) {
    for (const [hour, counts] of Object.entries(input.hourly[date] ?? {})) {
      for (const [topic, count] of Object.entries(counts) as [Topic, number][]) {
        if (count > 0) hourly_topics.push({ date, hour: Number(hour), topic, count });
      }
    }
  }

  return { child_id: input.childId, device_id: input.deviceId, week_start: start, sites, hourly_topics, voice_sessions, privacy_flags };
}

// Keeps the last `keep` days of a per-day record (older days can no longer be in a synced week).
export function pruneDays<T>(rec: Record<string, T>, now: number, keep = 14): Record<string, T> {
  const oldest = shiftDay(dayKey(now), keep - 1);
  return Object.fromEntries(Object.entries(rec).filter(([d]) => d >= oldest));
}
