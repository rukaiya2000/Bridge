import { addDays, format, parseISO, subDays } from "date-fns";
import type { Level, SiteAggregate } from "./api";

const LEVELS: Level[] = ["healthy", "watch", "concerning", "crisis"];

export const isLate = (hour: number) => hour >= 23 || hour < 5;

const TOPIC_LABELS: Record<string, string> = { self_worth: "Self-worth", body_image: "Body image" };
export const topicLabel = (t: string) => TOPIC_LABELS[t] ?? t[0].toUpperCase() + t.slice(1);

export const worstLevel = (sites: SiteAggregate[]): Level =>
  sites.reduce<Level>((w, s) => (LEVELS.indexOf(s.level) > LEVELS.indexOf(w) ? s.level : w), "healthy");

export const LEVEL_COLOR: Record<Level, string> = { healthy: "teal", watch: "yellow", concerning: "orange", crisis: "grape" };

export const LEVEL_TEXT: Record<Level, string> = {
  healthy: "Nothing stands out this week.",
  watch: "Some patterns worth keeping an eye on.",
  concerning: "A pattern has built up over several days. A calm conversation could help.",
  crisis: "Your teen was shown crisis resources this week. Consider talking to a counselor.",
};

export const hours = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`);

export const hourLabel = (h: number) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);

export const formatWeek = (start: string) => {
  const d = parseISO(start);
  return `${format(d, "MMM d")} – ${format(addDays(d, 6), "MMM d")}`;
};

export const previousWeek = (start: string) => format(subDays(parseISO(start), 7), "yyyy-MM-dd");

export const sum = (sites: SiteAggregate[], key: "active_minutes" | "late_night_sessions" | "voice_minutes" | "nudges_shown") =>
  sites.reduce((n, s) => n + s[key], 0);
