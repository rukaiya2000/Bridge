import type { Level, SessionEvent, Site, TurnLabels } from "./types.js";
import { LEVELS } from "./types.js";
import { core } from "./index.js";

// Labeled-arc format, same as core/fixtures/*.labeled.json. No text.
export interface LabeledArc {
  id: string;
  site: Site;
  sessions: { start: number; end: number; turns: { ts: number; labels: TurnLabels }[] }[];
}

const DAY = 86_400_000;

export function scoreArc(arc: LabeledArc, mode: "pattern" | "single") {
  const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const first = startOfDay(arc.sessions[0].start);
  const last = startOfDay(arc.sessions[arc.sessions.length - 1].start);
  const levels: Level[] = [];
  const scores: number[] = [];
  for (let day = first; day <= last; day += DAY) {
    const endOfDay = day + DAY - 1;
    if (mode === "pattern") {
      let p = core.emptyProfile(arc.site);
      for (const s of arc.sessions.filter((s) => s.start <= endOfDay)) {
        for (const t of s.turns.filter((t) => t.ts <= endOfDay)) p = core.updateProfile(p, t.labels, t.ts);
        const ev: SessionEvent = { site: arc.site, start: s.start, end: s.end, paidTier: null };
        p = core.recordSession(p, ev);
      }
      const r = core.scoreProfile(p, endOfDay);
      levels.push(r.level);
      scores.push(r.score);
    } else {
      let max = 0;
      for (const s of arc.sessions) for (const t of s.turns) {
        if (t.ts <= endOfDay) max = Math.max(max, LEVELS.indexOf(core.scoreSingle(t.labels)));
      }
      levels.push(LEVELS[max]);
      scores.push(max);
    }
  }
  return { id: arc.id, levels_by_day: levels, scores_by_day: scores, final_level: levels[levels.length - 1] };
}
