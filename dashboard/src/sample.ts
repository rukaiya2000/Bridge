import type { Week } from "./api";
import sampleWeek from "../../api/fixtures/sample_week.json";

// Shown when the API is unreachable. Same file the API tests use and the README seed command posts.
export const SAMPLE_WEEK = sampleWeek as Week;

// TODO(phase 2): vetted template set stored in MongoDB, never free generation (desc.md feature 2).
export const STARTERS: Record<string, string> = {
  loneliness: "I've been feeling stretched lately. How are things with your friends?",
  friends: "Who have you been hanging out with lately? I'd love to hear about them.",
  default: "What's been the best and hardest part of your week?",
};
