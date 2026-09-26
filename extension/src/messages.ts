// Messages between content scripts and the service worker. See docs/PHASE1.md §4.5.
import type { Site, Turn } from "../../core/src/types";

export type ToWorker =
  | { type: "turn"; turn: Turn }
  | { type: "heartbeat"; site: Site; ts: number; interacting: boolean };

export type ToContent =
  | { type: "show-nudge"; variant: number }
  | { type: "show-crisis"; abuseAtHome: boolean };
