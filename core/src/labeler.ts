import type { LabelOptions, Turn, TurnLabels } from "./types.js";
import { rulesLabel } from "./rules.js";
import { jevLabel } from "./jev.js";

export async function labelTurn(user: Turn, bot: Turn | null, opts: LabelOptions = {}): Promise<TurnLabels> {
  const r = rulesLabel(user, bot);
  if (!opts.jevKey) return r;
  const g = await jevLabel(user, bot, { ...opts, jevKey: opts.jevKey });
  if (!g) return r;
  const abuseAtHome = r.abuseAtHome || g.abuseAtHome;
  const excluded = new Set([...r.excludedTopics, ...g.excludedTopics]);
  if (abuseAtHome) excluded.add("abuse_or_conflict_at_home");
  return {
    ...g,
    crisis: r.crisis || g.crisis,
    abuseAtHome,
    excludedTopics: [...excluded],
    source: "rules+llm",
  };
}
