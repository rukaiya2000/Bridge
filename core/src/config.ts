export const DEFAULT_MODEL = "gemini-3.8-flash";
export const DEFAULT_TIMEOUT_MS = 8000;
// OpenAI-compatible provider (openai-compat.ts). Default: UF Navigator, a LiteLLM proxy. It has no
// Gemini models; gemma-4-31b-it is Google's open model and labeled the test messages correctly.
export const DEFAULT_LLM_BASE_URL = "https://api.navigator.ai.ufl.edu/v1";
export const DEFAULT_LLM_MODEL = "gemma-4-31b-it";
// Proxies and routers may pick a reasoning model, which is slower than a direct Gemini call.
export const LLM_TIMEOUT_MS = 20000;
export const MAX_CHARS_PER_TURN = 2000;
