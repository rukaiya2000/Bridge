import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  API_URL, fetchRatings, fetchStarters, fetchTopics, fetchWeek, fetchWeeks,
  type SiteAggregate, type Starter, type ToolRating, type TopicTrend, type Week,
} from "./api";
import { HoursChart, TopicsChart } from "./charts";
import { formatWeek, hours, LEVEL_TEXT, topicLabel, worstLevel } from "./format";

const CHILD_ID = "demo";
const REFRESH_MS = 15_000;
const EXCLUDED = "sexual orientation or gender identity, abuse or conflict at home, sexual health, and religion";

export function App() {
  const [picked, setPicked] = useState<string | null>(null);
  const weeks = useQuery({ queryKey: ["weeks", CHILD_ID], queryFn: () => fetchWeeks(CHILD_ID), refetchInterval: REFRESH_MS });
  const selected = picked ?? weeks.data?.[0] ?? null;
  const enabled = selected !== null;
  const week = useQuery({ queryKey: ["week", CHILD_ID, selected], queryFn: () => fetchWeek(CHILD_ID, selected!), enabled, refetchInterval: REFRESH_MS });
  const topics = useQuery({ queryKey: ["topics", CHILD_ID, selected], queryFn: () => fetchTopics(CHILD_ID, selected!), enabled, refetchInterval: REFRESH_MS });
  const ratings = useQuery({ queryKey: ["ratings"], queryFn: fetchRatings, staleTime: Infinity });
  const starters = useQuery({ queryKey: ["starters"], queryFn: fetchStarters, staleTime: Infinity });

  const failed = weeks.isError || week.isError || topics.isError || ratings.isError || starters.isError;
  const header = (
    <header>
      <div>
        <h1>Bridge</h1>
        <p className="muted">Topics, not words.</p>
      </div>
      {weeks.data && weeks.data.length > 0 && (
        <label className="week-picker">
          <span className="muted">Week</span>
          <select value={selected ?? ""} onChange={(e) => setPicked(e.target.value)}>
            {weeks.data.map((w) => <option key={w} value={w}>{formatWeek(w)}</option>)}
          </select>
        </label>
      )}
    </header>
  );

  if (failed) {
    return (
      <main>{header}
        <p className="status offline">
          Can't reach the API at {API_URL}. Start it with <code>uv run --group api uvicorn api.main:app --reload</code>
        </p>
      </main>
    );
  }
  if (weeks.data?.length === 0) {
    return (
      <main>{header}
        <p className="status">
          Connected, but nothing has been synced yet. Load the demo weeks with{" "}
          <code>for f in sample_prev_week sample_week; do curl -X POST {API_URL}/sync -H 'content-type: application/json' --data @api/fixtures/$f.json; done</code>
        </p>
      </main>
    );
  }
  if (!week.data || !topics.data || !ratings.data || !starters.data) {
    return <main>{header}<p className="muted">Loading…</p></main>;
  }

  return (
    <main>
      {header}
      <p className="status live">Live · updated {new Date(week.dataUpdatedAt).toLocaleTimeString()}</p>
      <Insight week={week.data} topics={topics.data} starters={starters.data} />
      <section className="card">
        <h2>Topics this week vs last week</h2>
        {topics.data.length ? <TopicsChart topics={topics.data} /> : <p className="muted">No topics this week.</p>}
      </section>
      <section className="card">
        <h2>Time of day</h2>
        <p className="muted small">Purple bars are late night (11pm to 5am).</p>
        <HoursChart week={week.data} />
      </section>
      <Tools sites={week.data.sites} ratings={ratings.data} />
      <Privacy />
    </main>
  );
}

function Insight({ week, topics, starters }: { week: Week; topics: TopicTrend[]; starters: Starter[] }) {
  const level = worstLevel(week.sites);
  const top = topics.find((t) => t.this_week > 0);
  const starter = starters.find((s) => s.topic === top?.topic) ?? starters.find((s) => s.topic === "default");
  const change = top && (top.last_week === top.this_week
    ? "Same as last week."
    : `${top.this_week > top.last_week ? "Up" : "Down"} from ${top.last_week} last week.`);
  return (
    <section className="card insight">
      <div className="insight-head">
        <span className={`chip ${level}`}>{level}</span>
        <span>{LEVEL_TEXT[level]}</span>
      </div>
      {top ? (
        <p className="headline">
          <strong>{topicLabel(top.topic)}</strong> came up {top.this_week} {top.this_week === 1 ? "time" : "times"} this week
          {top.late_night > top.this_week / 2 ? ", mostly after 11pm" : ""}. {change}
        </p>
      ) : <p className="headline">No topics stood out this week.</p>}
      {level === "crisis" ? (
        <p className="starter">This week, talk to a school counselor or your teen's doctor about how to start the conversation.</p>
      ) : starter && (
        <p className="starter"><span className="muted small">Try saying</span><br />“{starter.text}”</p>
      )}
    </section>
  );
}

function Tools({ sites, ratings }: { sites: SiteAggregate[]; ratings: ToolRating[] }) {
  const bySite = new Map(ratings.map((r) => [r.site, r]));
  const sorted = [...sites].sort((a, b) => b.active_minutes - a.active_minutes);
  return (
    <section className="card">
      <h2>AI tools used this week</h2>
      <div className="tools">
        {sorted.map((s) => {
          const r = bySite.get(s.site);
          return (
            <article key={s.site} className="tool">
              <div className="tool-head">
                <strong>{r?.name ?? s.site}</strong>
                {r && <span className={`tag ${r.type}`}>{r.type === "companion" ? "Companion app" : "General assistant"}</span>}
                <span className={`chip ${s.level}`}>{s.level}</span>
              </div>
              <dl className="stats">
                <div><dt>Time</dt><dd>{hours(s.active_minutes)}</dd></div>
                <div><dt>Late nights</dt><dd>{s.late_night_sessions}</dd></div>
                <div><dt>Voice</dt><dd>{hours(s.voice_minutes)}</dd></div>
                <div><dt>Plan</dt><dd>{s.paid_tier === null || s.paid_tier === undefined ? "Unknown" : s.paid_tier ? <span className="paid">Paid</span> : "Free"}</dd></div>
              </dl>
              {r && (
                <p className="rating">
                  <span className="muted">Ages {r.min_age}+ · teen safety settings: {r.teen_safety_settings ? "yes" : "no"}.</span>{" "}
                  {r.recommendation}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="card privacy">
      <h2>What you can and can't see</h2>
      <p><strong>You see:</strong> topics, how often they came up, time of day, and time spent per tool.</p>
      <p><strong>You never see:</strong> your teen's messages or any quotes, or anything about {EXCLUDED}.</p>
      <p className="muted small">Your teen can see that Bridge is on. Data is deleted automatically after 8 weeks.</p>
    </section>
  );
}
