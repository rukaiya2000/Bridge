import type { DayBucket, Level, Profile, ScoreResult, TurnLabels } from "./types.js";
import { dayKey, shiftDay } from "./time.js";
import weights from "./weights.json" with { type: "json" };

const EMOTIONAL = ["loneliness", "sadness", "anxiety", "self_worth"] as const;

export function scoreSingle(l: TurnLabels): Level {
  if (l.crisis) return "crisis";
  if (l.dependency && (l.isolation || l.botHook)) return "concerning";
  if (l.dependency || l.isolation || l.botHook ||
      l.topics.some((t) => t === "loneliness" || t === "sadness" || t === "self_worth")) return "watch";
  return "healthy";
}

const inWindow = (p: Profile, today: string) => {
  const oldest = shiftDay(today, 6);
  return p.days.filter((d) => d.date >= oldest && d.date <= today);
};
const sum = (days: DayBucket[], f: (d: DayBucket) => number) => days.reduce((n, d) => n + f(d), 0);

export function scoreProfile(p: Profile, now: number, allProfiles?: Profile[]): ScoreResult {
  const today = dayKey(now);
  const yesterday = shiftDay(today, 1);
  const days = inWindow(p, today);

  if (days.some((d) => (d.date === today || d.date === yesterday) && d.crisis > 0)) {
    return { level: "crisis", score: 99, reasons: ["crisis language in the last 24 hours"] };
  }

  const dep = sum(days, (d) => d.dependency);
  const iso = sum(days, (d) => d.isolation);
  const hook = sum(days, (d) => d.botHook);
  const emo = sum(days, (d) => EMOTIONAL.reduce((n, t) => n + (d.topicCounts[t] ?? 0), 0));
  const turns = sum(days, (d) => d.userTurns);
  const lateShare = turns ? sum(days, (d) => d.lateNightTurns) / turns : 0;
  const active = new Set(days.filter((d) => d.userTurns > 0 || d.sessions > 0).map((d) => d.date));
  const activeDays = active.size;

  let streak = 0;
  let cursor = active.has(today) ? today : yesterday;
  while (active.has(cursor)) { streak += 1; cursor = shiftDay(cursor, 1); }

  let siteShare = 0;
  if (allProfiles?.length) {
    const mine = sum(days, (d) => d.activeMinutes);
    const all = allProfiles.reduce((n, q) => n + sum(inWindow(q, today), (d) => d.activeMinutes), 0);
    siteShare = all ? mine / all : 0;
  }

  const w = weights;
  const terms: [number, string][] = [
    [w.dependency.weight * Math.min(dep, w.dependency.cap), `dependency language in ${dep} messages`],
    [w.isolation.weight * Math.min(iso, w.isolation.cap), `pulling away from people in ${iso} messages`],
    [w.botHook.weight * Math.min(hook, w.botHook.cap), `bot kept them talking in ${hook} messages`],
    [w.emotional.weight * Math.min(emo, w.emotional.cap), `emotional topics in ${emo} messages`],
    [activeDays >= w.lateNight.minActiveDays ? w.lateNight.weight * lateShare : 0, `${Math.round(lateShare * 100)}% of messages after 11pm`],
    [w.streak.weight * Math.max(0, streak - w.streak.freeDays), `${streak} days in a row`],
    [siteShare >= w.siteShare.minShare && activeDays >= w.siteShare.minActiveDays ? w.siteShare.bonus : 0, "most AI time on this one bot"],
  ];

  const score = terms.reduce((n, [v]) => n + v, 0);
  const level: Level =
    score >= w.thresholds.concerning ? "concerning" : score >= w.thresholds.watch ? "watch" : "healthy";
  const reasons = terms.filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]).map(([, r]) => r);
  return { level, score: Math.round(score * 10) / 10, reasons };
}
