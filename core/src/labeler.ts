import type { LabelOptions, Turn, TurnLabels } from "./types.js";
import { rulesLabel } from "./rules.js";
import { geminiLabel } from "./gemini.js";

export async function labelTurn(user: Turn, bot: Turn | null, opts: LabelOptions = {}): Promise<TurnLabels> {
  const r = rulesLabel(user, bot);
  if (!opts.geminiKey) return r;
  const g = await geminiLabel(user, bot, { ...opts, geminiKey: opts.geminiKey });
  if (!g) return r;
  const abuseAtHome = r.abuseAtHome || g.abuseAtHome;
  const excluded = new Set([...r.excludedTopics, ...g.excludedTopics]);
  if (abuseAtHome) excluded.add("abuse_or_conflict_at_home");
  return {
    ...g,
    crisis: r.crisis || g.crisis,
    abuseAtHome,
    excludedTopics: [...excluded],
    source: "rules+gemini",
  };
}
