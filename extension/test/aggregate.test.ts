import { describe, expect, it } from "vitest";
import { core } from "@bridge/core";
import type { Profile, SessionEvent } from "../../core/src/types";
import { BASE, DAY, labels } from "../../core/test/helpers";
import { buildPayload, weekStartKey, type AggregateInput } from "../src/sync/aggregate";

// BASE is Tue 2026-09-01 00:00 UTC, so its week starts Mon 2026-08-31. Tests run with TZ=UTC.
const NOW = BASE + 2 * DAY + 12 * 3_600_000; // Thu 12:00

const input = (profiles: Partial<Record<"gemini" | "characterai", Profile>>, o: Partial<AggregateInput> = {}): AggregateInput => ({
  childId: "kid", deviceId: "dev-1", now: NOW, profiles, hourly: {}, voiceMinutes: {}, nudges: {}, ...o,
});

const withTurns = (...turns: [Parameters<typeof labels>[0], number][]): Profile =>
  turns.reduce((p, [l, ts]) => core.updateProfile(p, labels(l), ts), core.emptyProfile("gemini"));

describe("buildPayload", () => {
  it("adds voice time exactly and rounds only the weekly total", () => {
    const secs = (n: number) => n / 60;
    const few = buildPayload(input({ gemini: withTurns([{ topics: ["school"] }, NOW]) },
      { voiceMinutes: { "2026-09-01": { gemini: secs(3) + secs(3) + secs(3) } } }));
    expect(few.sites[0].voice_minutes).toBe(0); // three 3-second uses are not three minutes
    const more = buildPayload(input({ gemini: withTurns([{ topics: ["school"] }, NOW]) },
      { voiceMinutes: { "2026-09-01": { gemini: secs(40) }, "2026-09-02": { gemini: secs(50) } } }));
    expect(more.sites[0].voice_minutes).toBe(2); // 90 s
  });

  it("uses the Monday of the current local week", () => {
    expect(weekStartKey(NOW)).toBe("2026-08-31");
    expect(buildPayload(input({ gemini: withTurns([{ topics: ["school"] }, NOW]) })).week_start).toBe("2026-08-31");
  });

  it("masks crisis when abuse-at-home is in the same week", () => {
    const p = withTurns(
      [{ crisis: true, topics: ["sadness"] }, NOW - 3_600_000],
      [{ abuseAtHome: true, excludedTopics: ["abuse_or_conflict_at_home"] }, BASE],
    );
    const out = buildPayload(input({ gemini: p }));
    expect(core.scoreProfile(p, NOW).level).toBe("crisis"); // unmasked
    expect(out.sites[0].level).not.toBe("crisis");
    expect(JSON.stringify(out)).not.toMatch(/crisis|abuse/);
  });

  it("keeps crisis when there is no abuse signal", () => {
    const out = buildPayload(input({ gemini: withTurns([{ crisis: true }, NOW - 3_600_000]) }));
    expect(out.sites[0].level).toBe("crisis");
  });

  it("sends only this week's counts and never excluded topics", () => {
    const session: SessionEvent = { site: "gemini", start: BASE + 23 * 3_600_000, end: BASE + 24 * 3_600_000, paidTier: null };
    let p = withTurns([{ topics: ["school"], excludedTopics: ["religion"] }, BASE - 2 * DAY], [{ topics: ["stress"] }, BASE]);
    p = core.recordSession(p, session);
    const out = buildPayload(input({ gemini: p }, {
      hourly: { "2026-08-30": { "10": { school: 1 } }, "2026-09-01": { "23": { stress: 2 } } },
      voiceMinutes: { "2026-09-01": { gemini: 7 }, "2026-08-30": { gemini: 50 } },
      nudges: { "2026-09-02": { gemini: 1 } },
    }));
    expect(out.hourly_topics).toEqual([{ date: "2026-09-01", hour: 23, topic: "stress", count: 2 }]);
    expect(out.sites).toEqual([{
      site: "gemini", level: expect.any(String), score: expect.any(Number),
      active_minutes: 60, late_night_sessions: 1, voice_minutes: 7, nudges_shown: 1, privacy_pauses: 0, paid_tier: null,
    }]);
    expect(JSON.stringify(out)).not.toMatch(/religion/);
  });

  it("leaves out sites with no activity this week", () => {
    const old = withTurns([{ topics: ["school"] }, BASE - 3 * DAY]);
    expect(buildPayload(input({ gemini: old })).sites).toEqual([]);
  });
});
