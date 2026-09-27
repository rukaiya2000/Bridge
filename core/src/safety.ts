// Send-time safety gate. Before a message reaches the chatbot, Jev scores how dangerous it is, and
// the message is blocked when the score is at or above the threshold (config.ts SAFETY_THRESHOLD,
// or the caller's own). Sadness and other feelings are never blocked: only the categories below.
// The on-device crisis/abuse rules always run too, so the gate still works without a key or network.
import type { Site } from "./types.js";
import { rulesLabel } from "./rules.js";
import { clip, decide, noul } from "./jev.js";
import { SAFETY_THRESHOLD, SAFETY_TIMEOUT_MS } from "./config.js";

export const SAFETY_CATEGORIES = ["self_harm", "abuse_at_home", "stranger_danger", "sexual_content", "violence"] as const;
export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];

const NOT_JOKES = "Jokes, slang and schoolwork don't count (\"this game is killing me\", an essay about a war).";

export const SAFETY_QUESTIONS: Record<SafetyCategory, ReturnType<typeof noul>> = {
  self_harm: noul(
    `Is the teen talking about hurting or killing themselves, wanting to die, or asking how to? Include indirect phrasing ("everyone would be better off without me"). ${NOT_JOKES}`,
    "The teen talks about self-harm, suicide or wanting to die.", "No self-harm or suicidal thoughts."),
  abuse_at_home: noul(
    "Is the teen describing abuse, violence or neglect by someone they live with?",
    "The teen describes abuse, violence or neglect at home.", "No abuse at home."),
  stranger_danger: noul(
    "Is the teen planning to meet someone they only know online, being asked to keep a relationship with an adult secret, or being asked for their location?",
    "The teen may be meeting or being groomed by someone they only know online.", "No stranger meeting or grooming."),
  sexual_content: noul(
    "Is the teen sharing, sending or being asked for sexual content or sexual photos?",
    "Sexual content or photos are being shared or requested.", "No sexual content."),
  violence: noul(
    `Is the teen planning or threatening to hurt someone else, or to bring a weapon somewhere? ${NOT_JOKES}`,
    "The teen plans or threatens to hurt someone else.", "No threat to hurt others."),
};

export interface SafetyOptions {
  jevKey?: string;       // OpenRouter key; without it only the on-device rules decide
  threshold?: number;    // default SAFETY_THRESHOLD
  site?: Site;
  timeoutMs?: number;    // default SAFETY_TIMEOUT_MS
  fetchImpl?: typeof fetch;
}

export interface SafetyVerdict {
  block: boolean;
  score: number;                                    // highest danger probability, 0..1
  categories: SafetyCategory[];                     // those at or above the threshold
  probabilities: Record<SafetyCategory, number>;
  threshold: number;
  source: "rules" | "rules+jev";                    // "rules": Jev had no key or didn't answer
}

export async function checkSafety(text: string, opts: SafetyOptions = {}): Promise<SafetyVerdict> {
  const threshold = opts.threshold ?? SAFETY_THRESHOLD;
  const r = rulesLabel({ id: "safety", site: opts.site ?? "gemini", conversationId: "safety", role: "user", text, ts: Date.now() }, null);
  const probabilities = Object.fromEntries(SAFETY_CATEGORIES.map((c) => [c, 0])) as Record<SafetyCategory, number>;
  if (r.crisis) probabilities.self_harm = 1;
  if (r.abuseAtHome) probabilities.abuse_at_home = 1;

  const answers = opts.jevKey
    ? await decide({ teen_message: clip(text) }, SAFETY_QUESTIONS, { jevKey: opts.jevKey, timeoutMs: opts.timeoutMs ?? SAFETY_TIMEOUT_MS, fetchImpl: opts.fetchImpl })
    : null;
  const jev = answers && SAFETY_CATEGORIES.every((c) => typeof (answers[c] as { noul?: unknown } | undefined)?.noul === "number");
  if (jev) for (const c of SAFETY_CATEGORIES) probabilities[c] = Math.max(probabilities[c], (answers[c] as { noul: number }).noul);

  // The one place the threshold is compared.
  const categories = SAFETY_CATEGORIES.filter((c) => probabilities[c] >= threshold);
  const score = Math.max(...Object.values(probabilities));
  return { block: categories.length > 0, score, categories, probabilities, threshold, source: jev ? "rules+jev" : "rules" };
}
