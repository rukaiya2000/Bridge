import type { Turn, TurnLabels } from "./types.js";
import { ABUSE_PHRASES, CRISIS_PHRASES } from "./lexicon.js";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const build = (phrases: string[]) =>
  new RegExp(`\\b(?:${phrases.map(escape).join("|")})\\b`);
const compact = (text: string) => text.replace(/[^a-z0-9]/g, "");
const buildCompact = (phrases: string[]) =>
  new RegExp(`(?:${phrases.map((phrase) => escape(compact(phrase))).join("|")})`);

const CRISIS_RE = build(CRISIS_PHRASES);
const ABUSE_RE = build(ABUSE_PHRASES);
// A compact pass catches spaces or punctuation inserted between characters. Restrict it to
// multi-word phrases so single-word matches keep their normal word boundaries.
const CRISIS_COMPACT_RE = buildCompact(CRISIS_PHRASES.filter((phrase) => /\s|-/u.test(phrase)));
const ABUSE_COMPACT_RE = buildCompact(ABUSE_PHRASES.filter((phrase) => /\s|-/u.test(phrase)));

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

// On-device, no network. Checks only the user turn.
export function rulesLabel(user: Turn, _bot: Turn | null): TurnLabels {
  const t = normalize(user.text);
  const compactText = compact(t);
  const crisis = CRISIS_RE.test(t) || CRISIS_COMPACT_RE.test(compactText);
  const abuseAtHome = ABUSE_RE.test(t) || ABUSE_COMPACT_RE.test(compactText);
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
