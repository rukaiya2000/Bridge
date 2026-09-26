// ALL Gemini selectors live in this file. They are a starting guess (PHASE1.md §4.4):
// verify each one in DevTools on gemini.google.com and record what you found in PHASE1.md §9.
import type { Role, Turn } from "../../../core/src/types";

export const SELECTORS = {
  user: "user-query",
  userText: ".query-text",
  bot: "model-response",
  botText: "message-content .markdown, message-content",
  stopButton: 'button[aria-label*="Stop" i]',
};

const SETTLE_MS = 1000;      // history must be stable this long before the "seen" snapshot
const DEBOUNCE_MS = 300;
const BOT_QUIET_MS = 1500;   // bot text unchanged this long (and no stop button) = finished
const BOT_POLL_MS = 500;

const conversationId = () => location.pathname.match(/\/app\/([^/?#]+)/)?.[1] ?? "new";

function textOf(el: Element, role: Role): string {
  const inner = el.querySelector(role === "user" ? SELECTORS.userText : SELECTORS.botText) ?? el;
  return (inner as HTMLElement).innerText?.trim() ?? "";
}

const elements = (role: Role) =>
  [...document.querySelectorAll(role === "user" ? SELECTORS.user : SELECTORS.bot)];

export function startGeminiAdapter(onTurn: (turn: Turn) => void): () => void {
  const emitted = new Set<string>();           // "<role>:<index>" on the current page
  const botWatch = new Map<string, { text: string; changedAt: number }>();
  let ready = false;
  let path = location.pathname;
  let debounce: number | undefined;

  function snapshot() {
    ready = false;
    emitted.clear();
    botWatch.clear();
    let last = -1;
    const check = () => {
      const count = elements("user").length + elements("bot").length;
      if (count !== last) { last = count; setTimeout(check, SETTLE_MS); return; }
      for (const role of ["user", "bot"] as const) elements(role).forEach((_, i) => emitted.add(`${role}:${i}`));
      ready = true;
    };
    check();
  }

  function emit(role: Role, index: number, text: string) {
    emitted.add(`${role}:${index}`);
    const conv = conversationId();
    onTurn({ id: `${conv}:${role}:${index}`, site: "gemini", conversationId: conv, role, text, ts: Date.now() });
  }

  function scan() {
    if (location.pathname !== path) {
      // A move from "new" to /app/<id> after the first message is the same page: keep `emitted`.
      const wasNew = !/\/app\//.test(path);
      path = location.pathname;
      if (!wasNew) { snapshot(); return; }
    }
    if (!ready) return;
    elements("user").forEach((el, i) => {
      if (emitted.has(`user:${i}`)) return;
      const text = textOf(el, "user");
      if (text) emit("user", i, text);
    });
    const streaming = Boolean(document.querySelector(SELECTORS.stopButton));
    elements("bot").forEach((el, i) => {
      const key = `bot:${i}`;
      if (emitted.has(key)) return;
      // Only the draft currently shown is in the DOM text, so switching drafts changes text, not index.
      const text = textOf(el, "bot");
      const w = botWatch.get(key);
      if (!w || w.text !== text) { botWatch.set(key, { text, changedAt: Date.now() }); return; }
      if (text && !streaming && Date.now() - w.changedAt >= BOT_QUIET_MS) {
        botWatch.delete(key);
        emit("bot", i, text);
      }
    });
  }

  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = window.setTimeout(scan, DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const poll = window.setInterval(scan, BOT_POLL_MS);
  snapshot();

  return () => { observer.disconnect(); clearInterval(poll); clearTimeout(debounce); };
}
