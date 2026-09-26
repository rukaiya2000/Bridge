// Stand-in for core/ until the Phase 1 merge. Type hashtags in Gemini to trigger labels (PHASE1.md §4.13).
import type {
  CoreApi, DayBucket, Level, Profile, ScoreResult, SessionEvent, Site, Turn, TurnLabels,
} from "../../core/src/types";

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shiftDay = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - n, 12).getTime());
};
const isLateNight = (ts: number) => { const h = new Date(ts).getHours(); return h >= 23 || h < 5; };

function rulesLabel(user: Turn, bot: Turn | null): TurnLabels {
  const u = user.text.toLowerCase();
  const b = bot?.text.toLowerCase() ?? "";
  const abuse = u.includes("#abuse");
  return {
    topics: u.includes("#lonely") ? ["loneliness"] : [],
    dependency: u.includes("#dep"),
    isolation: u.includes("#iso"),
    botHook: u.includes("#hook") || b.includes("#hook"),
    crisis: u.includes("#crisis"),
    abuseAtHome: abuse,
    excludedTopics: abuse ? ["abuse_or_conflict_at_home"] : [],
    source: "rules",
  };
}

const emptyBucket = (date: string): DayBucket => ({
  date, userTurns: 0, topicCounts: {}, excludedCounts: {}, dependency: 0, isolation: 0, botHook: 0,
  crisis: 0, abuseAtHome: 0, lateNightTurns: 0, sessions: 0, activeMinutes: 0, lateNightSessions: 0,
});

function withBucket(p: Profile, ts: number, fn: (b: DayBucket) => void): Profile {
  const key = dayKey(ts);
  const days = p.days.map((d) => ({ ...d, topicCounts: { ...d.topicCounts }, excludedCounts: { ...d.excludedCounts } }));
  let b = days.find((d) => d.date === key);
  if (!b) { b = emptyBucket(key); days.push(b); days.sort((a, c) => a.date.localeCompare(c.date)); }
  fn(b);
  const oldest = shiftDay(key, 6);
  return { site: p.site, days: days.filter((d) => d.date >= oldest) };
}

function scoreSingle(l: TurnLabels): Level {
  if (l.crisis) return "crisis";
  if (l.dependency && (l.isolation || l.botHook)) return "concerning";
  if (l.dependency || l.isolation || l.botHook ||
      l.topics.some((t) => t === "loneliness" || t === "sadness" || t === "self_worth")) return "watch";
  return "healthy";
}

function scoreProfile(p: Profile, now: number): ScoreResult {
  const today = dayKey(now);
  const days = p.days.filter((d) => d.date >= shiftDay(today, 6) && d.date <= today);
  if (days.some((d) => d.date === today && d.crisis > 0)) {
    return { level: "crisis", score: 99, reasons: ["crisis language today"] };
  }
  const sum = (f: (d: DayBucket) => number) => days.reduce((n, d) => n + f(d), 0);
  const dep = sum((d) => d.dependency), iso = sum((d) => d.isolation), hook = sum((d) => d.botHook);
  const lonely = sum((d) => d.topicCounts.loneliness ?? 0);
  const score = 2 * dep + 1.5 * iso + 1.5 * hook + 0.5 * lonely;
  const reasons = [
    dep && `dependency (stub) x${dep}`, iso && `isolation (stub) x${iso}`,
    hook && `bot hook (stub) x${hook}`, lonely && `loneliness (stub) x${lonely}`,
  ].filter((r): r is string => Boolean(r));
  return { level: score >= 7 ? "concerning" : score >= 3 ? "watch" : "healthy", score, reasons };
}

export const core: CoreApi = {
  rulesLabel,
  labelTurn: async (user, bot) => {
    await new Promise((r) => setTimeout(r, 200));
    return rulesLabel(user, bot);
  },
  emptyProfile: (site: Site) => ({ site, days: [] }),
  updateProfile: (p, l, ts) =>
    withBucket(p, ts, (b) => {
      b.userTurns += 1;
      for (const t of l.topics) b.topicCounts[t] = (b.topicCounts[t] ?? 0) + 1;
      for (const t of l.excludedTopics) b.excludedCounts[t] = (b.excludedCounts[t] ?? 0) + 1;
      if (l.dependency) b.dependency += 1;
      if (l.isolation) b.isolation += 1;
      if (l.botHook) b.botHook += 1;
      if (l.crisis) b.crisis += 1;
      if (l.abuseAtHome) b.abuseAtHome += 1;
      if (isLateNight(ts)) b.lateNightTurns += 1;
    }),
  recordSession: (p, s: SessionEvent) =>
    withBucket(p, s.start, (b) => {
      b.sessions += 1;
      b.activeMinutes += Math.round((s.end - s.start) / 60000);
      if (isLateNight(s.start)) b.lateNightSessions += 1;
    }),
  scoreProfile,
  scoreSingle,
};
