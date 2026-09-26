import type { LabelOptions, Turn, TurnLabels } from "./types.js";
import { rulesLabel } from "./rules.js";
import { geminiLabel } from "./gemini.js";
import { openaiLabel } from "./openai-compat.js";

export async function labelTurn(user: Turn, bot: Turn | null, opts: LabelOptions = {}): Promise<TurnLabels> {
  const r = rulesLabel(user, bot);
  const compat = opts.provider === "openai";
  const key = compat ? opts.llmKey : opts.geminiKey;
  if (!key) return r;
  const g = compat
    ? await openaiLabel(user, bot, { ...opts, llmKey: key })
    : await geminiLabel(user, bot, { ...opts, geminiKey: key });
  if (!g) return r;
  const abuseAtHome = r.abuseAtHome || g.abuseAtHome;
  const excluded = new Set([...r.excludedTopics, ...g.excludedTopics]);
  if (abuseAtHome) excluded.add("abuse_or_conflict_at_home");
  return {
    ...g,
    crisis: r.crisis || g.crisis,
    abuseAtHome,
    excludedTopics: [...excluded],
    source: compat ? "rules+llm" : "rules+gemini",
  };
}
