import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreProfile, scoreSingle } from "../src/score.js";
import { emptyProfile, updateProfile } from "../src/profile.js";
import { scoreArc } from "../src/arc.js";
import { BASE, DAY, labels } from "./helpers.js";

const demo = JSON.parse(readFileSync(new URL("../fixtures/demo-arc.labeled.json", import.meta.url), "utf8"));

describe("scoreProfile", () => {
  it("demo arc is concerning by day 4, and not before day 3", () => {
    const { levels_by_day } = scoreArc(demo, "pattern");
    const first = levels_by_day.findIndex((l) => l === "concerning" || l === "crisis") + 1;
    expect(first).toBeGreaterThanOrEqual(3);
    expect(first).toBeLessThanOrEqual(4);
  });

  it("replaying a UTC fixture gives the same days in any local time zone", () => {
    const utc = scoreArc(demo, "pattern", "UTC");
    const saved = process.env.TZ;
    try {
      for (const tz of ["America/New_York", "Asia/Kolkata", "Pacific/Auckland"]) {
        process.env.TZ = tz;
        expect(scoreArc(demo, "pattern", "UTC")).toEqual(utc);
      }
    } finally {
      process.env.TZ = saved;
    }
  });

  it("no single demo message is concerning on its own (the pattern claim)", () => {
    expect(scoreArc(demo, "single").levels_by_day).not.toContain("concerning");
  });

  it("a homework poem about loneliness stays healthy", () => {
    const p = updateProfile(emptyProfile("gemini"), labels({ topics: ["school"] }), BASE + 16 * 3600_000);
    expect(scoreProfile(p, BASE + 17 * 3600_000).level).toBe("healthy");
  });

  it("crisis today is crisis; crisis 3 days ago is not", () => {
    const p = updateProfile(emptyProfile("gemini"), labels({ crisis: true }), BASE + 12 * 3600_000);
    expect(scoreProfile(p, BASE + 13 * 3600_000).level).toBe("crisis");
    expect(scoreProfile(p, BASE + 3 * DAY).level).not.toBe("crisis");
  });
});

describe("scoreSingle", () => {
  it.each([
    [labels({ crisis: true }), "crisis"],
    [labels({ dependency: true, isolation: true }), "concerning"],
    [labels({ dependency: true, botHook: true }), "concerning"],
    [labels({ isolation: true }), "watch"],
    [labels({ topics: ["sadness"] }), "watch"],
    [labels({ topics: ["school"] }), "healthy"],
  ] as const)("%o → %s", (l, level) => {
    expect(scoreSingle(l)).toBe(level);
  });
});
