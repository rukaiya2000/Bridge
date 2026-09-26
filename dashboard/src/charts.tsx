// Recharts views. Colors come from CSS classes (styles.css) so light and dark mode both work.
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TopicTrend, Week } from "./api";
import { isLate, topicLabel } from "./format";

const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" };
const axisTick = { fill: "var(--muted)", fontSize: 12 };

const hourLabel = (h: number) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);

export function HoursChart({ week }: { week: Week }) {
  const data = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: week.hourly_topics.filter((t) => t.hour === hour).reduce((n, t) => n + t.count, 0),
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="hour" tickFormatter={hourLabel} ticks={[0, 6, 12, 18, 23]} tick={axisTick} tickLine={false} />
        <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={{ className: "cursor" }}
          contentStyle={tooltipStyle}
          labelFormatter={(h) => `${hourLabel(Number(h))}${isLate(Number(h)) ? " (late night)" : ""}`}
          formatter={(v) => [v, "topic mentions"]}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d) => <Cell key={d.hour} className={isLate(d.hour) ? "bar-late" : "bar"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopicsChart({ topics }: { topics: TopicTrend[] }) {
  const data = topics.map((t) => ({ ...t, label: topicLabel(t.topic) }));
  // Recharts' own legend colors its swatches from the `fill` prop, which our CSS classes don't reach.
  return (
    <>
      <p className="legend"><span className="swatch bar-prev" />Last week <span className="swatch bar" />This week</p>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 44)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 8 }} barGap={2}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={92} tick={axisTick} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ className: "cursor" }} contentStyle={tooltipStyle} />
          <Bar dataKey="last_week" name="Last week" className="bar-prev" radius={[0, 3, 3, 0]} isAnimationActive={false} />
          <Bar dataKey="this_week" name="This week" className="bar" radius={[0, 3, 3, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
