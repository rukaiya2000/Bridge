// Typed client for the sync API. Types come from FastAPI's schema: run `npm run gen:api -w dashboard`
// after changing api/models.py or api/main.py. Never edit api-schema.d.ts by hand.
import createClient from "openapi-fetch";
import type { components, paths } from "./api-schema";

type Schemas = components["schemas"];
export type Week = Schemas["WeekSummary"]; // all of the child's devices added up
export type SiteAggregate = Schemas["SiteAggregate"];
export type TopicTrend = Schemas["TopicTrend"];
export type ToolRating = Schemas["ToolRating"];
export type Level = SiteAggregate["level"];

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TIMEOUT_MS = 15_000;
// Without a timeout a stuck API leaves the login button spinning forever.
const api = createClient<paths>({ baseUrl: API_URL, fetch: (req: Request) => fetch(req, { signal: AbortSignal.timeout(TIMEOUT_MS) }) });

// The logged-in account (api/auth.py). Kept in localStorage so a reload stays logged in.
export type Session = Schemas["LoginResult"];
const SESSION_KEY = "bridge-session";

export function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

// The Bridge extension, if installed in this browser, listens for this and logs in too
// (extension/src/content/dashboard.ts). The token stays on this page's origin.
export const announceSession = (s: Session | null) =>
  window.postMessage({ bridge: "dashboard-session", session: s }, window.location.origin);

export function saveSession(s: Session | null) {
  announceSession(s);
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* private window: stays logged in until the tab closes */ }
}

api.use({
  onRequest({ request }) {
    const s = loadSession();
    if (s) request.headers.set("authorization", `Bearer ${s.token}`);
    return request;
  },
});

// Thrown when the token is missing or expired, so the app can show the login screen again.
export class LoggedOut extends Error {}

// openapi-fetch returns { data, error } instead of throwing; TanStack Query expects a throw.
function ok<T>(res: { data?: T; error?: unknown; response: Response }, what: string): T {
  if (res.response.status === 401) throw new LoggedOut("log in again");
  if (res.error !== undefined || res.data === undefined) throw new Error(`could not load ${what}`);
  return res.data;
}

// Login and sign-up errors are shown to the user, so say what actually went wrong.
async function authed(call: Promise<{ data?: Session; error?: unknown; response: Response }>): Promise<Session> {
  let res;
  try {
    res = await call;
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === "TimeoutError";
    throw new Error(timedOut
      ? `The Bridge API at ${API_URL} didn't answer within ${TIMEOUT_MS / 1000} s. Check its terminal for errors.`
      : `Can't reach the Bridge API at ${API_URL}. Is it running? (uv run --group api uvicorn api.main:app --reload)`);
  }
  if (res.data) return res.data;
  const detail = (res.error as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "string") throw new Error(detail);
  if (Array.isArray(detail)) throw new Error("Enter a valid email and a password of at least 8 characters");
  throw new Error(`The Bridge API had an error (HTTP ${res.response.status}). Check its terminal for details.`);
}

export const logIn = (email: string, password: string) => authed(api.POST("/auth/login", { body: { email, password } }));

export const signUp = (email: string, password: string) => authed(api.POST("/auth/signup", { body: { email, password } }));

export const logOut = async () => {
  await api.POST("/auth/logout").catch(() => {});
  saveSession(null);
};

export const fetchWeeks = async (child: string) =>
  ok(await api.GET("/children/{child_id}/weeks", { params: { path: { child_id: child } } }), "weeks");

export const fetchWeek = async (child: string, week: string) =>
  ok(await api.GET("/children/{child_id}/weeks/{week_start}", { params: { path: { child_id: child, week_start: week } } }), "week");

export const fetchTopics = async (child: string, week: string) =>
  ok(await api.GET("/children/{child_id}/weeks/{week_start}/topics", { params: { path: { child_id: child, week_start: week } } }), "topics");

export const fetchRatings = async () => ok(await api.GET("/tools/ratings"), "tool ratings");

