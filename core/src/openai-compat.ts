// Same labeling prompt as gemini.ts, sent to any OpenAI-compatible chat API through the official
// OpenAI SDK: UF Navigator (a LiteLLM proxy), OpenRouter, or OpenAI itself. The SDK handles
// retries (429 / 5xx) and timeouts.
import OpenAI from "openai";
import type { LabelOptions, Turn } from "./types.js";
import { DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL, LLM_TIMEOUT_MS } from "./config.js";
import { clip, PROMPT, RETRIES, validate, type GeminiLabels } from "./gemini.js";

// The label is a few hundred tokens of JSON. Without a cap, OpenRouter reserves the routed
// model's full output limit (65k) and rejects the call with 402 on a small credit balance.
const MAX_OUTPUT_TOKENS = 2048;

// Not every model or proxy honours response_format, so take the first {...} block even inside ```json fences.
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
}

// Returns null on any failure so the caller falls back to rules. Never logs text.
export async function openaiLabel(
  user: Turn,
  bot: Turn | null,
  opts: LabelOptions & { llmKey: string },
): Promise<GeminiLabels | null> {
  const started = Date.now();
  const client = new OpenAI({
    apiKey: opts.llmKey,
    baseURL: opts.llmBaseUrl || DEFAULT_LLM_BASE_URL,
    timeout: opts.timeoutMs ?? LLM_TIMEOUT_MS,
    maxRetries: RETRIES,
    fetch: opts.fetchImpl,
    dangerouslyAllowBrowser: true, // the key is the user's own, typed into the extension's options page
    defaultHeaders: { "x-title": "Bridge" }, // OpenRouter app name; ignored elsewhere
  });
  try {
    const res = await client.chat.completions.create({
      model: opts.llmModel || DEFAULT_LLM_MODEL,
      messages: [{ role: "user", content: `${PROMPT}\nTEEN: ${clip(user.text)}\nBOT: ${bot ? clip(bot.text) : "(no reply)"}` }],
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
    });
    return validate(extractJson(res.choices[0]?.message?.content ?? ""));
  } catch (e) {
    // Status only: a JSON parse error would quote the model's output, which could echo the teen's text.
    const status = e instanceof OpenAI.APIError ? ` status=${e.status}` : "";
    console.warn(`[bridge] llm failed${status} ms=${Date.now() - started}`);
    return null;
  }
}
