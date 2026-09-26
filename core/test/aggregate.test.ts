import { describe, expect, it } from "vitest";
import { buildSyncPayload, hourKey, maskForParents, weekStartOf } from "../src/aggregate.js";
import { emptyProfile, recordSession, updateProfile } from "../src/profile.js";
import { EXCLUDED_TOPICS } from "../src/types.js";
import { BASE, DAY, labels } from "./helpers.js";

// BASE is Tue 2026-09-01 00:00 UTC (tests run with TZ=UTC), so the week starts Mon 2026-08-31.
const NOW = BASE + DAY + 20 * 3600_000; // Wed 20:00

describe("buildSyncPayload", () => {
  it("summarises the current Monday-to-Sunday week", () => {
    let p = updateProfile(emptyProfile("gemini"), labels({ topics: ["loneliness"] }), BASE + 23 * 3600_000);
    p = recordSession(p, { site: "gemini", start: BASE + 23 * 3600_000, end: BASE + 23.5 * 3600_000, paidTier: null });
    const out = buildSyncPayload({
      childId: "c1", now: NOW, profiles: { gemini: p },
      hourly: { [hourKey("2026-09-01", 23)]: { loneliness: 1 }, [hourKey("2026-08-20", 10)]: { school: 3 } },
      voiceMinutesByDay: { "2026-09-01": { gemini: 5 } }, nudgesByDay: { "2026-09-02": { gemini: 1 } },
    });
    expect(weekStartOf(NOW)).toBe("2026-08-31");
    expect(out.week_start).toBe("2026-08-31");
    expect(out.sites).toEqual([expect.objectContaining({
      site: "gemini", active_minutes: 30, late_night_sessions: 1, voice_minutes: 5, nudges_shown: 1, paid_tier: null,
    })]);
    // the 2026-08-20 count is outside the week, so it is not sent
    expect(out.hourly_topics).toEqual([{ date: "2026-09-01", hour: 23, topic: "loneliness", count: 1 }]);
  });

  it("never sends excluded topics, even if one slips into the hourly map", () => {
    const hourly = { [hourKey("2026-09-01", 1)]: { religion: 2, sadness: 1 } as never };
    const out = buildSyncPayload({ childId: "c", now: NOW, profiles: {}, hourly, voiceMinutesByDay: {}, nudgesByDay: {} });
    expect(out.hourly_topics.map((t) => t.topic)).toEqual(["sadness"]);
    for (const t of EXCLUDED_TOPICS) expect(JSON.stringify(out)).not.toContain(t);
  });

  it("hides a crisis from parents when abuse-at-home signals are in the same window", () => {
    const p = updateProfile(emptyProfile("gemini"), labels({ crisis: true, abuseAtHome: true }), NOW - 3600_000);
    const out = buildSyncPayload({ childId: "c", now: NOW, profiles: { gemini: p }, hourly: {}, voiceMinutesByDay: {}, nudgesByDay: {} });
    expect(out.sites[0].level).not.toBe("crisis");
  });

  it("still shows a crisis when there is no abuse signal", () => {
    const p = updateProfile(emptyProfile("gemini"), labels({ crisis: true }), NOW - 3600_000);
    const out = buildSyncPayload({ childId: "c", now: NOW, profiles: { gemini: p }, hourly: {}, voiceMinutesByDay: {}, nudgesByDay: {} });
    expect(out.sites[0].level).toBe("crisis");
  });

  it("leaves out sites with no activity this week", () => {
    const old = updateProfile(emptyProfile("claude"), labels(), BASE - 5 * DAY);
    const out = buildSyncPayload({ childId: "c", now: NOW, profiles: { claude: old }, hourly: {}, voiceMinutesByDay: {}, nudgesByDay: {} });
    expect(out.sites).toEqual([]);
  });
});

describe("maskForParents", () => {
  it("does nothing without both signals", () => {
    const p = updateProfile(emptyProfile("gemini"), labels({ abuseAtHome: true }), NOW);
    expect(maskForParents(p)).toBe(p);
  });
});
