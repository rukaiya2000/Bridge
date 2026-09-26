// Shared contract between core/ and extension/. Do not change without both people agreeing (PHASE1.md §9).

export type Site = "chatgpt" | "claude" | "characterai" | "gemini";
export type Level = "healthy" | "watch" | "concerning" | "crisis";
export type Role = "user" | "bot";

export const LEVELS: readonly Level[] = ["healthy", "watch", "concerning", "crisis"];

// Topics that may be shown to parents (as counts only).
export const TOPICS = [
  "loneliness", "sadness", "stress", "anxiety", "anger", "self_worth",
  "school", "friends", "family", "romance", "body_image", "boredom", "other",
] as const;
export type Topic = (typeof TOPICS)[number];

// Topics that are detected but NEVER reach parents.
export const EXCLUDED_TOPICS = [
  "sexual_orientation_gender_identity",
  "abuse_or_conflict_at_home",
  "sexual_health",
  "religion",
] as const;
export type ExcludedTopic = (typeof EXCLUDED_TOPICS)[number];

export interface Turn {
  id: string;             // stable per message (Gemini: "<conversationId>:<role>:<index>", see §4.4)
  site: Site;
  conversationId: string; // Gemini: the id in /app/<id>, or "new" before one exists
  role: Role;
  text: string;           // in memory only, never persisted
  ts: number;             // epoch ms
}

export interface TurnLabels {
  topics: Topic[];
  dependency: boolean;    // "you're the only one who gets me"
  isolation: boolean;     // withdrawing from friends/family
  botHook: boolean;       // bot discourages leaving, guilt-trips, escalates romance
  crisis: boolean;        // self-harm / suicide / crisis language
  abuseAtHome: boolean;   // abuse or conflict at home
  excludedTopics: ExcludedTopic[];
  source: "rules" | "rules+gemini";
}

export interface SessionEvent {
  site: Site;
  start: number;          // epoch ms
  end: number;            // epoch ms
  paidTier: boolean | null; // null in Phase 1
}

// One local calendar day of aggregates. Counts only, no text.
export interface DayBucket {
  date: string;           // "YYYY-MM-DD" in local time
  userTurns: number;
  topicCounts: Partial<Record<Topic, number>>;
  excludedCounts: Partial<Record<ExcludedTopic, number>>;
  dependency: number;
  isolation: number;
  botHook: number;
  crisis: number;
  abuseAtHome: number;
  lateNightTurns: number; // turns between 23:00 and 04:59 local
  sessions: number;
  activeMinutes: number;
  lateNightSessions: number; // sessions that started between 23:00 and 04:59
}

export interface Profile {
  site: Site;
  days: DayBucket[];      // oldest first, at most 7, only days with activity
}

export interface ScoreResult {
  level: Level;
  score: number;
  reasons: string[];      // short, text-free, e.g. "dependency language on 3 days"
}

export interface LabelOptions {
  geminiKey?: string;     // omit → rules only
  model?: string;         // default from core/src/config.ts
  timeoutMs?: number;     // default 8000
  fetchImpl?: typeof fetch;
}

// Both core/src/index.ts and extension/src/core-stub.ts export `core` of this type.
export interface CoreApi {
  // Synchronous, on-device, no network. Must run in under 5 ms.
  rulesLabel(user: Turn, bot: Turn | null): TurnLabels;
  // Rules + Gemini merged. Falls back to rules only on missing key, timeout or bad JSON.
  labelTurn(user: Turn, bot: Turn | null, opts?: LabelOptions): Promise<TurnLabels>;
  emptyProfile(site: Site): Profile;
  // Pure: returns a new Profile. Adds labels to the day of `ts`, drops days older than 7 days before `ts`.
  updateProfile(p: Profile, labels: TurnLabels, ts: number): Profile;
  // Pure: adds a finished session to the day of `s.start`.
  recordSession(p: Profile, s: SessionEvent): Profile;
  // `allProfiles` is used for "share of time on this site". `now` sets the 7-day window.
  scoreProfile(p: Profile, now: number, allProfiles?: Profile[]): ScoreResult;
  // Level for one message on its own. Used by the per-message ablation.
  scoreSingle(labels: TurnLabels): Level;
}
