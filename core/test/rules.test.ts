import { describe, expect, it } from "vitest";
import { rulesLabel } from "../src/rules.js";
import { CRISIS_PHRASES } from "../src/lexicon.js";
import { turn } from "./helpers.js";

describe("rulesLabel", () => {
  it.each(CRISIS_PHRASES)("detects crisis phrase %s", (p) => {
    expect(rulesLabel(turn(`honestly i ${p} lately`), null).crisis).toBe(true);
  });

  it.each(["I'm dying to see that movie", "this homework is killing me"])("ignores %s", (t) => {
    expect(rulesLabel(turn(t), null).crisis).toBe(false);
  });

  it("handles curly apostrophes", () => {
    expect(rulesLabel(turn("I don’t want to be here anymore"), null).crisis).toBe(true);
  });

  it("marks abuse at home as an excluded topic", () => {
    const l = rulesLabel(turn("I'm scared to go home"), null);
    expect(l.abuseAtHome).toBe(true);
    expect(l.excludedTopics).toEqual(["abuse_or_conflict_at_home"]);
  });

  it("only checks the user turn", () => {
    expect(rulesLabel(turn("hi"), turn("suicide prevention resources", "bot")).crisis).toBe(false);
  });

  it("runs 1,000 calls in under 500 ms", () => {
    const t = turn("I had a long day at school and my friends ignored me at lunch again");
    const start = performance.now();
    for (let i = 0; i < 1000; i++) rulesLabel(t, null);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
