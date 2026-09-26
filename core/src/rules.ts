import type { Turn, TurnLabels } from "./types.js";
import { ABUSE_PHRASES, CRISIS_PHRASES } from "./lexicon.js";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const build = (phrases: string[]) =>
  new RegExp(`\\b(?:${phrases.map(escape).join("|")})\\b`);

const CRISIS_RE = build(CRISIS_PHRASES);
const ABUSE_RE = build(ABUSE_PHRASES);

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

// On-device, no network. Checks only the user turn.
export function rulesLabel(user: Turn, _bot: Turn | null): TurnLabels {
  const t = normalize(user.text);
  const crisis = CRISIS_RE.test(t);
  const abuseAtHome = ABUSE_RE.test(t);
  return {
    topics: [],
    dependency: false,
    isolation: false,
    botHook: false,
    crisis,
    abuseAtHome,
    excludedTopics: abuseAtHome ? ["abuse_or_conflict_at_home"] : [],
    source: "rules",
  };
}
