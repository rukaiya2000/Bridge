// TypeSafe's Jev decision model on OpenRouter (jev.ts). Answers yes/no questions with a probability.
export const JEV_URL = "https://openrouter.ai/api/alpha/decisions";
export const JEV_MODEL = "typesafe/jev-1.13";
// A label counts when Jev puts its probability at or above this. Tune against eval/ gold labels.
export const JEV_THRESHOLD = 0.5;
export const JEV_TIMEOUT_MS = 20000;
export const MAX_CHARS_PER_TURN = 2000;
// Send-time safety gate (safety.ts): a message is blocked before it reaches the chatbot when the
// highest danger probability (Jev or the on-device rules) is at or above this. The extension's
// Options page can override it per install; this is the default everywhere else.
export const SAFETY_THRESHOLD = 0.7;
// The teen is waiting on Send, so the gate gives Jev less time than labeling does.
export const SAFETY_TIMEOUT_MS = 5000;
