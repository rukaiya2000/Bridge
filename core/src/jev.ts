// Labels one exchange with TypeSafe's Jev decision model on OpenRouter (docs/guides/community/jev-tutorial).
// Jev answers typed questions about a state instead of free text, so there is no JSON to parse.
// It has no multi-select type, so every topic, excluded topic and flag is its own yes/no ("noul")
// question; all of them go in one request and are answered in parallel. Plain fetch + p-retry:
// OpenRouter's SDKs don't cover the alpha decisions endpoint.
import type { LabelOptions, Turn, TurnLabels } from "./types.js";
import { EXCLUDED_TOPICS, TOPICS } from "./types.js";
import pRetry, { AbortError } from "p-retry";
import { JEV_MODEL, JEV_THRESHOLD, JEV_TIMEOUT_MS, JEV_URL, MAX_CHARS_PER_TURN } from "./config.js";

export type LlmLabels = Omit<TurnLabels, "source">;

// What each topic means, so the model tags feelings said plainly ("i am sad") as well as indirectly.
const TOPIC_MEANINGS: Record<(typeof TOPICS)[number], string> = {
  loneliness: "feeling alone, no one to talk to",
  sadness: "feeling down, low, upset or crying",
  stress: "pressure about a task, test or deadline",
  anxiety: "ongoing worry, nerves or panic",
  anger: "strong anger or rage",
  self_worth: "feeling worthless, stupid or not good enough",
  hopelessness: "believing things will never get better",
  emptiness: "feeling numb, empty or nothing at all",
  rejection: "being left out, ignored, excluded or dumped",
  guilt_shame: "blaming, being ashamed of or hating themselves",
  overwhelm: "too much to handle, burnt out, exhausted by everything",
  fear: "scared of a specific person, place or event",
  grief: "mourning a death or a big loss",
  jealousy: "envy, comparing themselves with others",
  frustration: "annoyed or fed up when things keep going wrong",
  happiness: "feeling happy, excited, proud or relieved",
  school: "schoolwork, teachers, grades",
  friends: "friendships and peers",
  family: "parents, siblings, home life",
  romance: "crushes, dating, relationships",
  body_image: "looks, weight, how their body seems to others",
  boredom: "nothing to do, bored",
  other: "something none of the other topics cover",
};

const EXCLUDED_MEANINGS: Record<(typeof EXCLUDED_TOPICS)[number], string> = {
  sexual_orientation_gender_identity: "their sexual orientation or gender identity",
  abuse_or_conflict_at_home: "abuse, violence or serious conflict at home",
  sexual_health: "sexual health, sex or contraception",
  religion: "religion or faith",
};

const FLAGS = {
  dependency: [
    "The teen relies on the bot emotionally in place of people (\"you're the only one who gets me\", \"I don't need anyone else\").",
    "The teen does not rely on the bot in place of people.",
  ],
  isolation: [
    "The teen is withdrawing from friends or family, or cancelling plans to keep chatting.",
    "The teen is not withdrawing from people.",
  ],
  botHook: [
    "The bot discourages the teen from leaving, guilt-trips them, claims to need them, or escalates romance.",
    "The bot does none of these.",
  ],
  crisis: [
    "The teen mentions self-harm, suicidal thoughts or immediate danger, including indirect phrasing.",
    "No self-harm, suicidal thoughts or danger.",
  ],
  abuseAtHome: [
    "The teen describes abuse, violence or serious conflict at home.",
    "No abuse or serious conflict at home.",
  ],
} as const;
type Flag = keyof typeof FLAGS;

// Rules the old prompt gave once; each question carries them because Jev answers questions independently.
const FEELING_RULES =
  "Only the teen's own feelings count, not the bot's. Count it whether said plainly or indirectly; sarcasm and slang count by meaning. " +
  "A word used inside schoolwork (a poem, an essay topic) does not count.";

export const noul = (instructions: string, yes: string, no: string) =>
  ({ type: "noul", instructions, criteria: { true: yes, false: no } });

export const QUESTIONS: Record<string, ReturnType<typeof noul>> = {
  ...Object.fromEntries(TOPICS.map((t) => [t, noul(
    `Does the teen express or talk about ${t.replaceAll("_", " ")} (${TOPIC_MEANINGS[t]})? ${FEELING_RULES}`,
    `Yes: ${TOPIC_MEANINGS[t]}.`,
    "No.",
  )])),
  ...Object.fromEntries(EXCLUDED_TOPICS.map((t) => [t, noul(
    `Does the teen talk about ${EXCLUDED_MEANINGS[t]}?`,
    `Yes: ${EXCLUDED_MEANINGS[t]}.`,
    "No.",
  )])),
  ...Object.fromEntries((Object.keys(FLAGS) as Flag[]).map((f) => [f, noul(
    `${FLAGS[f][0]} When unsure, answer false.`,
    FLAGS[f][0],
    FLAGS[f][1],
  )])),
};

export const clip = (s: string) => s.slice(0, MAX_CHARS_PER_TURN);

export const RETRIES = 2;
const RETRYABLE = (status: number) => status === 429 || status >= 500;

// One Decisions API call: Jev answers every question about `state`. Returns the raw answers, or
// null on any failure. Shared by labeling (jevLabel) and the send-time safety gate (safety.ts).
// Never logs text: status and timing only.
export async function decide(
  state: Record<string, string>,
  questions: Record<string, unknown>,
  opts: Pick<LabelOptions, "timeoutMs" | "fetchImpl"> & { jevKey: string },
): Promise<Record<string, unknown> | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const started = Date.now();
  try {
    const res = await pRetry(async () => {
      const r = await doFetch(JEV_URL, {
        method: "POST",
        signal: AbortSignal.timeout(opts.timeoutMs ?? JEV_TIMEOUT_MS),
        headers: { "content-type": "application/json", authorization: `Bearer ${opts.jevKey}`, "x-title": "Bridge" },
        body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      });
      if (r.ok) return r;
      const err = new Error(`status=${r.status}`);
      throw RETRYABLE(r.status) ? err : new AbortError(err);
    }, {
      retries: RETRIES,
      minTimeout: 500,
      onFailedAttempt: ({ error, retriesLeft }) =>
        console.warn(`[bridge] jev ${error.message} ms=${Date.now() - started} retries_left=${retriesLeft}`),
    });
    const json = await res.json();
    console.info(`[bridge] jev answered via ${json?.model} ms=${Date.now() - started}`);
    return json?.answers && typeof json.answers === "object" ? json.answers : null;
  } catch (e) {
    // Status only: never the response body, which could quote the teen's text.
    console.warn(`[bridge] jev failed ${e instanceof Error && e.message.startsWith("status=") ? e.message : ""} ms=${Date.now() - started}`);
    return null;
  }
}

// Returns null on any failure so the caller falls back to rules. Never logs text.
export async function jevLabel(
  user: Turn,
  bot: Turn | null,
  opts: LabelOptions & { jevKey: string },
): Promise<LlmLabels | null> {
  const state = { teen_message: clip(user.text), bot_reply: bot ? clip(bot.text) : "(no reply)" };
  return fromAnswers(await decide(state, QUESTIONS, opts));
}

// Each answer is { type: "noul", noul: <probability of true> }. Any missing answer → null (rules only).
export function fromAnswers(answers: unknown): LlmLabels | null {
  if (!answers || typeof answers !== "object") return null;
  const a = answers as Record<string, { noul?: unknown } | undefined>;
  if (Object.keys(QUESTIONS).some((q) => typeof a[q]?.noul !== "number")) return null;
  const yes = (q: string) => (a[q]!.noul as number) >= JEV_THRESHOLD;
  return {
    topics: TOPICS.filter(yes),
    excludedTopics: EXCLUDED_TOPICS.filter(yes),
    dependency: yes("dependency"),
    isolation: yes("isolation"),
    botHook: yes("botHook"),
    crisis: yes("crisis"),
    abuseAtHome: yes("abuseAtHome"),
  };
}
