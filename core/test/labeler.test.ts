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
});
