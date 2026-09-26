import type { LabelOptions, Turn, TurnLabels } from "./types.js";
import { EXCLUDED_TOPICS, TOPICS } from "./types.js";
import pRetry, { AbortError } from "p-retry";
import { DEFAULT_MODEL, DEFAULT_TIMEOUT_MS, MAX_CHARS_PER_TURN } from "./config.js";

export type GeminiLabels = Omit<TurnLabels, "source">;

const PROMPT = `You label one exchange between a teenager and an AI chatbot for a child-safety tool.
Return ONLY JSON with exactly these keys:
{
  "topics": [subset of: ${TOPICS.join(", ")}],
  "dependency": bool,   // teen relies on the bot emotionally in place of people ("you're the only one who gets me", "I don't need anyone else")
  "isolation": bool,    // teen is withdrawing from friends/family or cancelling plans to keep chatting
  "botHook": bool,      // the BOT discourages leaving, guilt-trips, claims to need the teen, or escalates romance
  "crisis": bool,       // self-harm, suicidal thoughts, or immediate danger, including indirect phrasing
  "abuseAtHome": bool,  // abuse, violence or serious conflict at home
  "excludedTopics": [subset of: ${EXCLUDED_TOPICS.join(", ")}]
}
Rules: a word like "lonely" inside schoolwork (a poem, an essay topic) is NOT loneliness. Sarcasm and slang count by meaning, not by words. When unsure, prefer false.
`;

const clip = (s: string) => s.slice(0, MAX_CHARS_PER_TURN);

// Returns null on any failure so the caller falls back to rules. Never logs text.
// Gemini often answers 503 ("high demand") or 429 for a moment; those are retried with backoff.
const RETRIES = 2;
const RETRYABLE = (status: number) => status === 429 || status >= 500;

// Returns null on any failure so the caller falls back to rules. Never logs text.
export async function geminiLabel(
  user: Turn,
  bot: Turn | null,
  opts: LabelOptions & { geminiKey: string },
): Promise<GeminiLabels | null> {
  const model = opts.model ?? DEFAULT_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  const started = Date.now();
  const body = JSON.stringify({
    contents: [{
      role: "user",
      parts: [{ text: `${PROMPT}\nTEEN: ${clip(user.text)}\nBOT: ${bot ? clip(bot.text) : "(no reply)"}` }],
    }],
    // Low thinking keeps a label at ~2 s instead of up to ~20 s; the task is a short classification.
    generationConfig: { responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingLevel: "low" } },
  });
  try {
    const res = await pRetry(async () => {
      const r = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        headers: { "content-type": "application/json", "x-goog-api-key": opts.geminiKey },
        body,
      });
      if (r.ok) return r;
      const err = new Error(`status=${r.status}`);
      throw RETRYABLE(r.status) ? err : new AbortError(err);
    }, {
      retries: RETRIES,
      minTimeout: 500,
      onFailedAttempt: ({ error, retriesLeft }) =>
        console.warn(`[bridge] gemini ${error.message} ms=${Date.now() - started} retries_left=${retriesLeft}`),
    });
    const json = await res.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return validate(JSON.parse(raw));
  } catch {
    console.warn(`[bridge] gemini failed ms=${Date.now() - started}`);
    return null;
  }
}

export function validate(g: unknown): GeminiLabels | null {
  if (!g || typeof g !== "object") return null;
  const o = g as Record<string, unknown>;
  const bools = ["dependency", "isolation", "botHook", "crisis", "abuseAtHome"] as const;
  if (bools.some((k) => typeof o[k] !== "boolean")) return null;
  if (!Array.isArray(o.topics) || !Array.isArray(o.excludedTopics)) return null;
  return {
    topics: o.topics.filter((t): t is GeminiLabels["topics"][number] => (TOPICS as readonly unknown[]).includes(t)),
    excludedTopics: o.excludedTopics.filter(
      (t): t is GeminiLabels["excludedTopics"][number] => (EXCLUDED_TOPICS as readonly unknown[]).includes(t),
    ),
    dependency: o.dependency as boolean,
    isolation: o.isolation as boolean,
    botHook: o.botHook as boolean,
    crisis: o.crisis as boolean,
    abuseAtHome: o.abuseAtHome as boolean,
  };
}
