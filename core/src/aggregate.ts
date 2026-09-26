// Builds the weekly summary the extension syncs to the parent API (desc.md, Privacy and safety design).
// Pure: no storage, no network. Everything that leaves the device goes through buildSyncPayload.
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { core } from "./index.js";
import type { Level, Profile, Site, Topic } from "./types.js";
import { TOPICS } from "./types.js";

// Topic counts per local day and hour, keyed "YYYY-MM-DD|H". Only parent-visible topics are ever
// counted here: excluded topics live in TurnLabels.excludedTopics and never reach this map.
export type HourlyCounts = Record<string, Partial<Record<Topic, number>>>;
export type PerSiteByDay = Record<string, Partial<Record<Site, number>>>;

export interface SyncInput {
  childId: string;
  now: number;
  profiles: Partial<Record<Site, Profile>>;
  hourly: HourlyCounts;
  voiceMinutesByDay: PerSiteByDay;
  nudgesByDay: PerSiteByDay;
}

// Mirrors api/models.py SyncPayload; the API rejects anything else.
export interface SyncPayload {
  child_id: string;
  week_start: string;
  sites: {
    site: Site; level: Level; score: number; active_minutes: number; late_night_sessions: number;
    voice_minutes: number; nudges_shown: number; paid_tier: boolean | null;
  }[];
  hourly_topics: { date: string; hour: number; topic: Topic; count: number }[];
}

export const hourKey = (date: string, hour: number) => `${date}|${hour}`;

// Weeks start on Monday, in local time.
export const weekStartOf = (ts: number) => format(startOfWeek(ts, { weekStartsOn: 1 }), "yyyy-MM-dd");

// Privacy rule 2: abuse-at-home signals in the same window as a crisis signal hide the crisis from
// every parent surface. The parent's level is computed as if those signals never occurred.
export function maskForParents(p: Profile): Profile {
  const abuse = p.days.some((d) => d.abuseAtHome > 0);
  const crisis = p.days.some((d) => d.crisis > 0);
  if (!(abuse && crisis)) return p;
  return { ...p, days: p.days.map((d) => ({ ...d, crisis: 0, abuseAtHome: 0 })) };
}

export function buildSyncPayload(input: SyncInput): SyncPayload {
  const week = weekStartOf(input.now);
  const days = Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(week), i), "yyyy-MM-dd"));
  const inWeek = (date: string) => days.includes(date);
  const perSite = (m: PerSiteByDay, site: Site) => days.reduce((n, d) => n + (m[d]?.[site] ?? 0), 0);

  const masked = Object.fromEntries(
    Object.entries(input.profiles).map(([site, p]) => [site, maskForParents(p!)]),
  ) as Partial<Record<Site, Profile>>;
  const all = Object.values(masked) as Profile[];

  const sites = all.flatMap((p) => {
    const weekDays = p.days.filter((d) => inWeek(d.date));
    const voice = perSite(input.voiceMinutesByDay, p.site);
    if (!weekDays.some((d) => d.userTurns > 0 || d.sessions > 0) && voice === 0) return [];
    const { level, score } = core.scoreProfile(p, input.now, all);
    return [{
      site: p.site,
      level,
      score,
      active_minutes: weekDays.reduce((n, d) => n + d.activeMinutes, 0),
      late_night_sessions: weekDays.reduce((n, d) => n + d.lateNightSessions, 0),
      voice_minutes: voice,
      nudges_shown: perSite(input.nudgesByDay, p.site),
      paid_tier: null,
    }];
  });

  const hourly_topics = Object.entries(input.hourly).flatMap(([key, counts]) => {
    const [date, hour] = key.split("|");
    if (!inWeek(date)) return [];
    return TOPICS.filter((t) => (counts[t] ?? 0) > 0).map((topic) => ({ date, hour: Number(hour), topic, count: counts[topic]! }));
  });

  return { child_id: input.childId, week_start: week, sites, hourly_topics };
}
