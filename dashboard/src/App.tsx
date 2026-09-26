import { useEffect, useState } from "react";
import type { Week } from "./types";
import { SAMPLE_WEEK, STARTERS } from "./sample";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const LATE = (h: number) => h >= 23 || h < 5;

export function App() {
  const [week, setWeek] = useState<Week>(SAMPLE_WEEK);
  const [isSample, setIsSample] = useState(true);

  useEffect(() => {
    fetch(`${API}/children/demo/weeks/2026-09-01`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((w: Week) => { setWeek(w); setIsSample(false); })
      .catch(() => {});
  }, []);

  const byTopic = new Map<string, { total: number; late: number }>();
  for (const t of week.hourly_topics) {
    const cur = byTopic.get(t.topic) ?? { total: 0, late: 0 };
    cur.total += t.count;
    if (LATE(t.hour)) cur.late += t.count;
    byTopic.set(t.topic, cur);
  }
  const topics = [...byTopic.entries()].sort((a, b) => b[1].total - a[1].total);
  const [top, topCounts] = topics[0] ?? ["", { total: 0, late: 0 }];
  const byHour = Array.from({ length: 24 }, (_, h) =>
    week.hourly_topics.filter((t) => t.hour === h).reduce((n, t) => n + t.count, 0));
  const maxHour = Math.max(1, ...byHour);

  return (
    <main>
      <header>
        <h1>Bridge</h1>
        <p className="muted">Topics, not words. Week of {week.week_start}{isSample && " · sample data"}</p>
      </header>

      <section className="card">
        <h2>This week</h2>
        {top ? (
          <p>
            <strong>{top[0].toUpperCase() + top.slice(1)}</strong> came up in {topCounts.total} conversations
            {topCounts.late > topCounts.total / 2 && ", mostly after 11pm"}.
          </p>
        ) : <p>Nothing notable this week.</p>}
        <p className="starter">Try: “{STARTERS[top] ?? STARTERS.default}”</p>
      </section>

      <section className="card">
        <h2>Time of day</h2>
        <div className="hours" role="img" aria-label="Conversations by hour of day">
          {byHour.map((n, h) => (
            <div key={h} className={`bar ${LATE(h) ? "late" : ""}`} style={{ height: `${(n / maxHour) * 100}%` }} title={`${h}:00 · ${n}`} />
          ))}
        </div>
        <div className="axis"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
      </section>

      <section className="card">
        <h2>AI tools</h2>
        <table>
          <thead><tr><th>Tool</th><th>Level</th><th>Hours</th><th>Voice min</th><th>Late nights</th></tr></thead>
          <tbody>
            {week.sites.map((s) => (
              <tr key={s.site}>
                <td>{s.site}</td>
                <td><span className={`chip ${s.level}`}>{s.level}</span></td>
                <td>{(s.active_minutes / 60).toFixed(1)}</td>
                <td>{s.voice_minutes}</td>
                <td>{s.late_night_sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
