// TypeSafe's Jev decision model on OpenRouter (jev.ts). Answers yes/no questions with a probability.
export const JEV_URL = "https://openrouter.ai/api/alpha/decisions";
export const JEV_MODEL = "typesafe/jev-1.13";
// A label counts when Jev puts its probability at or above this. Tune against eval/ gold labels.
export const JEV_THRESHOLD = 0.5;
export const JEV_TIMEOUT_MS = 20000;
export const MAX_CHARS_PER_TURN = 2000;
