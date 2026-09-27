import { describe, expect, it } from "vitest";
import { labelTurn } from "../src/labeler.js";
import { turn } from "./helpers.js";

import { QUESTIONS } from "../src/jev.js";

// A fake Jev decisions reply: every question false (0.1) except the ones listed (0.9).
const answers = (yes: string[] = []) =>
  Object.fromEntries(Object.keys(QUESTIONS).map((q) => [q, { type: "noul", noul: yes.includes(q) ? 0.9 : 0.1 }]));
const seen: { url: string; body: any; auth: string }[] = [];
const jevReply = (yes: string[] = [], status = 200, body?: unknown) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") ?? "" });
    return new Response(JSON.stringify(body ?? { answers: answers(yes) }), { status });
  }) as typeof fetch;

describe("labelTurn", () => {
  it("returns rules only without a key", async () => {
    expect((await labelTurn(turn("hi"), null)).source).toBe("rules");
  });

  it("asks Jev one noul question per label and maps probabilities to labels", async () => {
    const l = await labelTurn(turn("you're the only one who gets me"), null, { jevKey: "k", fetchImpl: jevReply(["loneliness", "dependency"]) });
    expect(l).toMatchObject({ source: "rules+llm", dependency: true, isolation: false, topics: ["loneliness"] });
    const req = seen.at(-1)!;
    expect(req.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(req.auth).toBe("Bearer k");
    expect(req.body.model).toBe("typesafe/jev-1.13");
    expect(req.body.state).toEqual({ teen_message: "you're the only one who gets me", bot_reply: "(no reply)" });
    expect(Object.values(req.body.questions).every((q: any) => q.type === "noul")).toBe(true);
    expect(Object.keys(req.body.questions)).toHaveLength(23 + 4 + 5);
  });

  it("keeps the rules crisis flag even if Jev says no", async () => {
    const l = await labelTurn(turn("i want to die"), null, { jevKey: "k", fetchImpl: jevReply() });
    expect(l.crisis).toBe(true);
  });

  it("falls back to rules when an answer is missing", async () => {
    const partial = { answers: { loneliness: { type: "noul", noul: 0.9 } } };
    const l = await labelTurn(turn("hi"), null, { jevKey: "k", fetchImpl: jevReply([], 200, partial) });
    expect(l.source).toBe("rules");
  });

  it("falls back to rules on timeout", async () => {
    const hang = ((_u: unknown, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    const l = await labelTurn(turn("hi"), null, { jevKey: "k", fetchImpl: hang, timeoutMs: 20 });
    expect(l.source).toBe("rules");
  });

  it("retries when OpenRouter is overloaded (503) and then succeeds", async () => {
    let calls = 0;
    const ok = jevReply();
    const flaky = (async (u: string, i?: RequestInit) => (++calls < 2 ? new Response("busy", { status: 503 }) : ok(u, i))) as typeof fetch;
    const l = await labelTurn(turn("hi"), null, { jevKey: "k", fetchImpl: flaky });
    expect(calls).toBe(2);
    expect(l.source).toBe("rules+llm");
  });

  it("does not retry a bad key (401)", async () => {
    let calls = 0;
    const bad = (async () => { calls++; return new Response("no", { status: 401 }); }) as typeof fetch;
    const l = await labelTurn(turn("hi"), null, { jevKey: "k", fetchImpl: bad });
    expect(calls).toBe(1);
    expect(l.source).toBe("rules");
  });
});

describe("new feelings", () => {
  it("keeps every feeling Jev says yes to, and each question explains the feeling", async () => {
    const feelings = ["hopelessness", "emptiness", "rejection", "guilt_shame", "overwhelm", "fear", "grief", "jealousy", "frustration", "happiness"];
    const l = await labelTurn(turn("..."), null, { jevKey: "k", fetchImpl: jevReply(feelings) });
    expect(l.topics).toEqual(feelings);
    for (const f of feelings) expect(QUESTIONS[f].instructions).toMatch(/\(.+\)/);
  });
});
