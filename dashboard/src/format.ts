import { addDays, format, parseISO, subDays } from "date-fns";
import type { Level, SiteAggregate } from "./api";

export const isLate = (hour: number) => hour >= 23 || hour < 5;

const TOPIC_LABELS: Record<string, string> = { self_worth: "Self-worth", body_image: "Body image", guilt_shame: "Guilt / shame" };
export const topicLabel = (t: string) => TOPIC_LABELS[t] ?? t[0].toUpperCase() + t.slice(1);

export const LEVEL_COLOR: Record<Level, string> = { healthy: "teal", watch: "yellow", concerning: "orange", crisis: "grape" };

export const hours = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} h`);

// Same kinds as extension/src/privacy/detect.ts FINDING_LABEL. The dashboard only ever gets the kind.
export const FINDING_LABEL: Record<string, string> = {
  phone: "a phone number", email: "an email address", ssn: "a Social Security number", card: "a payment card number",
  bank: "a bank account number", address: "a home address", password: "a password", birthday: "a date of birth",
  student_id: "a student ID", id_document: "an ID, school or medical document",
  unsafe: "a message Bridge judged unsafe for a chatbot",
};

export const hourLabel =(h: number) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);

export const formatWeek = (start: string) => {
  const d = parseISO(start);
  return `${format(d, "MMM d")} – ${format(addDays(d, 6), "MMM d")}`;
};

export const previousWeek = (start: string) => format(subDays(parseISO(start), 7), "yyyy-MM-dd");

export const sum = (sites: SiteAggregate[], key: "active_minutes" | "late_night_sessions" | "voice_minutes" | "nudges_shown" | "privacy_pauses") =>
  sites.reduce((n, s) => n + s[key], 0);
