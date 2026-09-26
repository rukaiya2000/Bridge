const pad = (n: number) => String(n).padStart(2, "0");

// Local calendar day, "YYYY-MM-DD".
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 23:00 to 04:59 local.
export function isLateNight(ts: number): boolean {
  const h = new Date(ts).getHours();
  return h >= 23 || h < 5;
}

// Day key `n` calendar days before `key`.
export function shiftDay(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - n, 12).getTime());
}
