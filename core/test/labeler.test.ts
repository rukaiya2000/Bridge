import { describe, expect, it } from "vitest";
import { labelTurn } from "../src/labeler.js";
import { turn } from "./helpers.js";

const geminiReply = (text: string) =>
  (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }))) as typeof fetch;

const good = JSON.stringify({
  topics: ["loneliness", "not_a_topic"], dependency: true, isolation: false, botHook: false,
  crisis: false, abuseAtHome: false, excludedTopics: [],
});

describe("labelTurn", () => {
  it("returns rules only without a key", async () => {
    expect((await labelTurn(turn("hi"), null)).source).toBe("rules");
  });

  it("merges valid Gemini JSON and drops unknown topics", async () => {
    const l = await labelTurn(turn("you're the only one who gets me"), null, { geminiKey: "k", fetchImpl: geminiReply(good) });
    expect(l).toMatchObject({ source: "rules+gemini", dependency: true, topics: ["loneliness"] });
  });

  it("keeps the rules crisis flag even if Gemini says no", async () => {
    const l = await labelTurn(turn("i want to die"), null, { geminiKey: "k", fetchImpl: geminiReply(good) });
    expect(l.crisis).toBe(true);
  });

  it("falls back to rules on invalid JSON", async () => {
    const l = await labelTurn(turn("hi"), null, { geminiKey: "k", fetchImpl: geminiReply("not json") });
    expect(l.source).toBe("rules");
  });

  it("falls back to rules on timeout", async () => {
    const hang = ((_u: unknown, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    const l = await labelTurn(turn("hi"), null, { geminiKey: "k", fetchImpl: hang, timeoutMs: 20 });
    expect(l.source).toBe("rules");
  });

  it("retries when Gemini is overloaded (503) and then succeeds", async () => {
    let calls = 0;
    const flaky = (async () => (++calls < 2 ? new Response("busy", { status: 503 }) : geminiReply(good)())) as typeof fetch;
    const l = await labelTurn(turn("hi"), null, { geminiKey: "k", fetchImpl: flaky });
    expect(calls).toBe(2);
    expect(l.source).toBe("rules+gemini");
  });

  it("does not retry a bad request (400)", async () => {
    let calls = 0;
    const bad = (async () => { calls++; return new Response("bad", { status: 400 }); }) as typeof fetch;
    const l = await labelTurn(turn("hi"), null, { geminiKey: "k", fetchImpl: bad });
    expect(calls).toBe(1);
    expect(l.source).toBe("rules");
  });
});

describe("labelTurn via an OpenAI-compatible API", () => {
  const seen: { url: string; model: string }[] = [];
  const compatReply = (content: string, status = 200) =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), model: JSON.parse(String(init?.body)).model });
      return new Response(JSON.stringify(status === 200 ? { choices: [{ message: { role: "assistant", content } }] } : { error: {} }), {
        status, headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  const opts = { provider: "openai" as const, llmKey: "k" };

  it("posts to UF Navigator by default and merges JSON, even inside a code fence", async () => {
    const l = await labelTurn(turn("you're the only one who gets me"), null, { ...opts, fetchImpl: compatReply("```json\n" + good + "\n```") });
    expect(l).toMatchObject({ source: "rules+llm", dependency: true, topics: ["loneliness"] });
    expect(seen.at(-1)).toEqual({ url: "https://api.navigator.ai.ufl.edu/v1/chat/completions", model: "gemma-4-31b-it" });
  });

  it("uses the configured base URL and model (OpenRouter)", async () => {
    await labelTurn(turn("hi"), null, {
      ...opts, llmBaseUrl: "https://openrouter.ai/api/v1", llmModel: "google/gemini-3.8-flash", fetchImpl: compatReply(good),
    });
    expect(seen.at(-1)).toEqual({ url: "https://openrouter.ai/api/v1/chat/completions", model: "google/gemini-3.8-flash" });
  });

  it("falls back to rules on a bad reply, an API error, or no key", async () => {
    expect((await labelTurn(turn("hi"), null, { ...opts, fetchImpl: compatReply("sorry, no") })).source).toBe("rules");
    expect((await labelTurn(turn("hi"), null, { ...opts, fetchImpl: compatReply("", 401) })).source).toBe("rules");
    expect((await labelTurn(turn("hi"), null, { provider: "openai", geminiKey: "g" })).source).toBe("rules");
  });

  it("keeps the rules crisis flag", async () => {
    const l = await labelTurn(turn("i want to die"), null, { ...opts, fetchImpl: compatReply(good) });
    expect(l.crisis).toBe(true);
  });
});

describe("new feelings", () => {
  it("keeps every feeling the model returns, and the prompt explains each one", async () => {
    const feelings = ["hopelessness", "emptiness", "rejection", "guilt_shame", "overwhelm", "fear", "grief", "jealousy", "frustration", "happiness"];
    const reply = JSON.stringify({ topics: feelings, dependency: false, isolation: false, botHook: false, crisis: false, abuseAtHome: false, excludedTopics: [] });
    const l = await labelTurn(turn("..."), null, { geminiKey: "k", fetchImpl: geminiReply(reply) });
    expect(l.topics).toEqual(feelings);
    const { PROMPT } = await import("../src/gemini.js");
    for (const f of feelings) expect(PROMPT).toContain(`- ${f}: `);
  });
});
