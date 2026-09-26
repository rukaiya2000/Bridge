import type { DayBucket, Profile, SessionEvent, Site, TurnLabels } from "./types.js";
import { dayKey, isLateNight, shiftDay } from "./time.js";

export function emptyProfile(site: Site): Profile {
  return { site, days: [] };
}

function emptyBucket(date: string): DayBucket {
  return {
    date, userTurns: 0, topicCounts: {}, excludedCounts: {},
    dependency: 0, isolation: 0, botHook: 0, crisis: 0, abuseAtHome: 0,
    lateNightTurns: 0, sessions: 0, activeMinutes: 0, lateNightSessions: 0,
  };
}

// Copies the profile, applies `fn` to the bucket for `ts`, keeps 7 calendar days ending that day.
function withBucket(p: Profile, ts: number, fn: (b: DayBucket) => void): Profile {
  const key = dayKey(ts);
  const days = p.days.map((d) => ({ ...d, topicCounts: { ...d.topicCounts }, excludedCounts: { ...d.excludedCounts } }));
  let b = days.find((d) => d.date === key);
  if (!b) {
    b = emptyBucket(key);
    days.push(b);
    days.sort((a, c) => a.date.localeCompare(c.date));
  }
  fn(b);
  const oldest = shiftDay(key, 6);
  return { site: p.site, days: days.filter((d) => d.date >= oldest) };
}

export function updateProfile(p: Profile, labels: TurnLabels, ts: number): Profile {
  return withBucket(p, ts, (b) => {
    b.userTurns += 1;
    for (const t of labels.topics) b.topicCounts[t] = (b.topicCounts[t] ?? 0) + 1;
    for (const t of labels.excludedTopics) b.excludedCounts[t] = (b.excludedCounts[t] ?? 0) + 1;
    if (labels.dependency) b.dependency += 1;
    if (labels.isolation) b.isolation += 1;
    if (labels.botHook) b.botHook += 1;
    if (labels.crisis) b.crisis += 1;
    if (labels.abuseAtHome) b.abuseAtHome += 1;
    if (isLateNight(ts)) b.lateNightTurns += 1;
  });
}

export function recordSession(p: Profile, s: SessionEvent): Profile {
  return withBucket(p, s.start, (b) => {
    b.sessions += 1;
    b.activeMinutes += Math.round((s.end - s.start) / 60000);
    if (isLateNight(s.start)) b.lateNightSessions += 1;
  });
}
