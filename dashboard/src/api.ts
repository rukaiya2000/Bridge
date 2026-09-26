// Typed client for the sync API. Types come from FastAPI's schema: run `npm run gen:api -w dashboard`
// after changing api/models.py or api/main.py. Never edit api-schema.d.ts by hand.
import createClient from "openapi-fetch";
import type { components, paths } from "./api-schema";

export type Week = components["schemas"]["SyncPayload"];

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
export const api = createClient<paths>({ baseUrl: API_URL });

// Latest synced week for a child, or null when nothing has been synced yet.
// Throws when the API is unreachable or returns an error.
export async function fetchLatestWeek(childId: string): Promise<Week | null> {
  const weeks = await api.GET("/children/{child_id}/weeks", { params: { path: { child_id: childId } } });
  if (weeks.error) throw new Error("could not list weeks");
  const latest = weeks.data[0];
  if (!latest) return null;
  const week = await api.GET("/children/{child_id}/weeks/{week_start}", {
    params: { path: { child_id: childId, week_start: latest } },
  });
  if (week.error) throw new Error(`could not load week ${latest}`);
  return week.data;
}
