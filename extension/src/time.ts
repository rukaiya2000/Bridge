const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const isLateNight = (ts: number) => { const h = new Date(ts).getHours(); return h >= 23 || h < 5; };
