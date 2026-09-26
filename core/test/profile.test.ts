import { describe, expect, it } from "vitest";
import { addActiveMinutes, emptyProfile, recordSession, startSession, updateProfile } from "../src/profile.js";
import { BASE, DAY, labels } from "./helpers.js";

describe("profile", () => {
  it("buckets turns by day and counts signals", () => {
    let p = emptyProfile("gemini");
    p = updateProfile(p, labels({ topics: ["loneliness"], dependency: true }), BASE + 10 * 3600_000);
    p = updateProfile(p, labels({ topics: ["loneliness"] }), BASE + 11 * 3600_000);
    p = updateProfile(p, labels(), BASE + DAY);
    expect(p.days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(p.days[0]).toMatchObject({ userTurns: 2, dependency: 1, topicCounts: { loneliness: 2 } });
  });

  it("keeps only 7 calendar days", () => {
    let p = emptyProfile("gemini");
    for (let d = 0; d < 10; d++) p = updateProfile(p, labels(), BASE + d * DAY);
    expect(p.days).toHaveLength(7);
    expect(p.days[0].date).toBe("2026-09-04");
  });

  it("does not mutate its input", () => {
    const p = updateProfile(emptyProfile("gemini"), labels(), BASE);
    const before = JSON.stringify(p);
    updateProfile(p, labels({ dependency: true }), BASE);
    expect(JSON.stringify(p)).toBe(before);
  });

  it("counts late-night turns and sessions", () => {
    let p = updateProfile(emptyProfile("gemini"), labels(), BASE + 23.5 * 3600_000);
    p = recordSession(p, { site: "gemini", start: BASE + 23.5 * 3600_000, end: BASE + 24.25 * 3600_000, paidTier: null });
    expect(p.days[0]).toMatchObject({ lateNightTurns: 1, sessions: 1, lateNightSessions: 1, activeMinutes: 45 });
  });

  it("live tracking (start + minutes as they happen) matches recording the whole session", () => {
    const start = BASE + 23 * 3600_000, end = start + 45 * 60_000;
    const whole = recordSession(emptyProfile("gemini"), { site: "gemini", start, end, paidTier: null });
    let live = startSession(emptyProfile("gemini"), start);
    for (let t = start; t < end; t += 30_000) live = addActiveMinutes(live, t, 0.5);
    expect(live.days).toEqual(whole.days);
  });
});
