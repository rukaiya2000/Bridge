import { TZDate } from "@date-fns/tz";
import { addDays, format, parseISO, startOfDay as dfStartOfDay, subDays } from "date-fns";

// Time zone used for day buckets and late-night checks. undefined = the runtime's local zone.
// Callers that must be deterministic (fixture replay, eval) pin it with withTimeZone("UTC", ...).
let zone: string | undefined;

export function withTimeZone<T>(timeZone: string | undefined, fn: () => T): T {
  const prev = zone;
  zone = timeZone;
  try {
    return fn();
  } finally {
    zone = prev;
  }
}

const at = (ts: number) => (zone ? new TZDate(ts, zone) : new Date(ts));

// Calendar day, "YYYY-MM-DD".
export const dayKey = (ts: number): string => format(at(ts), "yyyy-MM-dd");

// 23:00 to 04:59.
export function isLateNight(ts: number): boolean {
  const h = at(ts).getHours();
  return h >= 23 || h < 5;
}

// Day key `n` calendar days before `key`.
export const shiftDay = (key: string, n: number): string => format(subDays(parseISO(key), n), "yyyy-MM-dd");

export const startOfDay = (ts: number): number => dfStartOfDay(at(ts)).getTime();

export const nextDay = (ts: number): number => addDays(at(ts), 1).getTime();
