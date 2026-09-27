import { describe, expect, it } from "vitest";
import { checkSafety, SAFETY_CATEGORIES, SAFETY_QUESTIONS } from "../src/safety.js";
import { SAFETY_THRESHOLD } from "../src/config.js";

// A Decisions API reply giving each safety category the probability in `p` (default 0.02).
const seen: { url: string; model: string; state: unknown; questions: string[] }[] = [];
const jevReply = (p: Partial<Record<(typeof SAFETY_CATEGORIES)[number], number>> = {}) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    seen.push({ url: String(url), model: body.model, state: body.state, questions: Object.keys(body.questions) });
    const answers = Object.fromEntries(SAFETY_CATEGORIES.map((c) => [c, { type: "noul", noul: p[c] ?? 0.02 }]));
    return new Response(JSON.stringify({ model: "typesafe/jev-1.13-20260917", answers }));
  }) as typeof fetch;

const key = { jevKey: "sk-or-test" };

describe("checkSafety (Jev safety gate)", () => {
  it("asks typesafe/jev-1.13 on the Decisions API about the teen's message only", async () => {
    await checkSafety("hello", { ...key, fetchImpl: jevReply() });
    expect(seen.at(-1)).toEqual({
      url: "https://openrouter.ai/api/alpha/decisions", model: "typesafe/jev-1.13",
      state: { teen_message: "hello" }, questions: [...SAFETY_CATEGORIES],
    });
  });

  it("blocks when a category is at or above the threshold, and names it", async () => {
    const v = await checkSafety("…", { ...key, fetchImpl: jevReply({ stranger_danger: 0.94 }) });
    expect(v).toMatchObject({ block: true, categories: ["stranger_danger"], score: 0.94, threshold: SAFETY_THRESHOLD, source: "rules+jev" });
  });

  it("blocks romance with the AI itself", async () => {
    const v = await checkSafety("will you be my girlfriend?", { ...key, fetchImpl: jevReply({ ai_romance: 0.97 }) });
    expect(v).toMatchObject({ block: true, categories: ["ai_romance"] });
    expect(SAFETY_QUESTIONS.ai_romance.instructions).toContain("real person does not count");
  });

  it("allows when every category is below the threshold", async () => {
    const v = await checkSafety("i am so sad", { ...key, fetchImpl: jevReply({ self_harm: 0.4 }) });
    expect(v).toMatchObject({ block: false, categories: [], score: 0.4 });
  });

  it("uses the configured threshold instead of the default", async () => {
    const reply = jevReply({ violence: 0.5 });
    expect((await checkSafety("…", { ...key, fetchImpl: reply })).block).toBe(false); // default 0.7
    expect((await checkSafety("…", { ...key, fetchImpl: reply, threshold: 0.4 })).block).toBe(true);
  });

  it("still blocks explicit crisis and abuse phrases on the device, with no key", async () => {
    expect(await checkSafety("i want to kill myself")).toMatchObject({ block: true, categories: ["self_harm"], source: "rules" });
    expect(await checkSafety("i h u r t m y s e l f")).toMatchObject({ block: true, categories: ["self_harm"], source: "rules" });
    expect((await checkSafety("my dad hits me")).categories).toContain("abuse_at_home");
    expect((await checkSafety("help with homework")).block).toBe(false);
  });

  it("falls back to the on-device rules when Jev fails or answers partly", async () => {
    const down = (async () => new Response("bad", { status: 400 })) as typeof fetch;
    expect(await checkSafety("i want to kill myself", { ...key, fetchImpl: down })).toMatchObject({ block: true, source: "rules" });
    const partial = (async () => new Response(JSON.stringify({ answers: { self_harm: { noul: 0.9 } } }))) as typeof fetch;
    expect(await checkSafety("hello", { ...key, fetchImpl: partial })).toMatchObject({ block: false, source: "rules" });
  });
});
