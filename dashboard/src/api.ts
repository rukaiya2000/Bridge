// Typed client for the sync API. Types come from FastAPI's schema: run `npm run gen:api -w dashboard`
// after changing api/models.py or api/main.py. Never edit api-schema.d.ts by hand.
import createClient from "openapi-fetch";
import type { components, paths } from "./api-schema";

type Schemas = components["schemas"];
export type Week = Schemas["SyncPayload"];
export type SiteAggregate = Schemas["SiteAggregate"];
export type TopicTrend = Schemas["TopicTrend"];
export type ToolRating = Schemas["ToolRating"];
export type Level = SiteAggregate["level"];

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const api = createClient<paths>({ baseUrl: API_URL });

// openapi-fetch returns { data, error } instead of throwing; TanStack Query expects a throw.
function ok<T>(res: { data?: T; error?: unknown }, what: string): T {
  if (res.error !== undefined || res.data === undefined) throw new Error(`could not load ${what}`);
  return res.data;
}

export const fetchWeeks = async (child: string) =>
  ok(await api.GET("/children/{child_id}/weeks", { params: { path: { child_id: child } } }), "weeks");

export const fetchWeek = async (child: string, week: string) =>
  ok(await api.GET("/children/{child_id}/weeks/{week_start}", { params: { path: { child_id: child, week_start: week } } }), "week");

export const fetchTopics = async (child: string, week: string) =>
  ok(await api.GET("/children/{child_id}/weeks/{week_start}/topics", { params: { path: { child_id: child, week_start: week } } }), "topics");

export const fetchRatings = async () => ok(await api.GET("/tools/ratings"), "tool ratings");

