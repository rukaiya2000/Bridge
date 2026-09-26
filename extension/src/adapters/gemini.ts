// Captures chat turns from gemini.google.com. See docs/PHASE1.md §4.4.
// ALL Gemini selectors live in SELECTORS below. They are unverified guesses: check them in
// DevTools on a real conversation and record what you find in PHASE1.md §9.
import type { Role, Turn } from "../../../core/src/types";

export const SELECTORS = {
  userMessage: "user-query",
  userText: ".query-text",
  botMessage: "model-response",
  botText: "message-content",
  // Any of these existing means a reply is still streaming.
  stopButton: 'button[aria-label*="Stop" i]',
  // Screen-reader-only labels ("You said", "Gemini said") that must not count as message text.
  hiddenLabel: ".cdk-visually-hidden, .visually-hidden",
  // Privacy guard (privacy/guard.ts): the message box and its send button. Unverified guesses.
  composer: 'rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"]',
  sendButton: 'button[aria-label*="Send" i], button.send-button',
};

const CONVERSATION_PATH = /\/app\/([A-Za-z0-9_-]+)/;
const DEBOUNCE_MS = 300;
const TICK_MS = 500;
const BOT_STABLE_MS = 1500;
const SETTLE_MS = 1000;
// A move from "new" to /app/<id> within this long after sending is the same conversation.
const SAME_CONVERSATION_WINDOW_MS = 30_000;

export function conversationIdFromPath(path: string): string {
  return path.match(CONVERSATION_PATH)?.[1] ?? "new";
}

export function messageText(el: Element, textSelector: string): string {
  const source = el.querySelector(textSelector) ?? el;
  const clone = source.cloneNode(true) as Element;
  clone.querySelectorAll(SELECTORS.hiddenLabel).forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

// Only the LAST user and bot element on the page can be a new turn. Older history that
// Gemini lazy-loads is inserted above them, so it is never mistaken for a new message.
export function startGeminiAdapter(onTurn: (turn: Turn) => void): () => void {
  const seen = new WeakSet<Element>();
  let conversationId = conversationIdFromPath(location.pathname);
  let settling = true;
  let settleCount = -1;
  let settleSince = Date.now();
  let userCount = 0;
  let lastUserEmittedAt = 0;
  let awaitingBot = false;
  let botText = "";
  let botTextSince = 0;
  let debounce: number | undefined;

  const all = (sel: string) => Array.from(document.querySelectorAll(sel));
  const last = (sel: string) => all(sel).at(-1) ?? null;
  const messageCount = () => all(SELECTORS.userMessage).length + all(SELECTORS.botMessage).length;

  function emit(role: Role, text: string) {
    const index = all(role === "user" ? SELECTORS.userMessage : SELECTORS.botMessage).length - 1;
    onTurn({ id: `${conversationId}:${role}:${index}`, site: "gemini", conversationId, role, text, ts: Date.now() });
  }

  // Wait until the page stops adding messages, then mark everything on it as history.
  function beginSettle() {
    settling = true;
    settleCount = -1;
    settleSince = Date.now();
    awaitingBot = false;
    botText = "";
  }

  function settle(now: number) {
    const count = messageCount();
    if (count !== settleCount) {
      settleCount = count;
      settleSince = now;
      return;
    }
    if (now - settleSince < SETTLE_MS) return;
    all(`${SELECTORS.userMessage}, ${SELECTORS.botMessage}`).forEach((el) => seen.add(el));
    userCount = all(SELECTORS.userMessage).length;
    settling = false;
  }

  function checkNavigation(now: number) {
    const next = conversationIdFromPath(location.pathname);
    if (next === conversationId) return;
    const justSent = conversationId === "new" && now - lastUserEmittedAt < SAME_CONVERSATION_WINDOW_MS;
    conversationId = next;
    if (!justSent) beginSettle();
  }

  function checkUser(now: number) {
    const users = all(SELECTORS.userMessage);
    const el = users.at(-1);
    if (!el || seen.has(el)) return;
    const text = messageText(el, SELECTORS.userText);
    if (!text) return;
    seen.add(el);
    // A real new message adds an element. A re-render (common when "new" becomes /app/<id>)
    // replaces one, so the count stays the same and it isn't counted twice.
    const grew = users.length > userCount;
    userCount = users.length;
    if (!grew) return;
    lastUserEmittedAt = now;
    awaitingBot = true;
    botText = "";
    emit("user", text);
  }

  function checkBot(now: number) {
    // Only one bot turn per user turn, so re-renders and draft switches are ignored.
    if (!awaitingBot) return;
    const el = last(SELECTORS.botMessage);
    if (!el || seen.has(el)) return;
    const text = messageText(el, SELECTORS.botText);
    if (text !== botText) {
      botText = text;
      botTextSince = now;
      return;
    }
    const streaming = document.querySelector(SELECTORS.stopButton) !== null;
    if (!text || streaming || now - botTextSince < BOT_STABLE_MS) return;
    seen.add(el);
    awaitingBot = false;
    botText = "";
    emit("bot", text);
  }

  function tick() {
    const now = Date.now();
    checkNavigation(now);
    if (settling) return settle(now);
    checkUser(now);
    checkBot(now);
  }

  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = window.setTimeout(tick, DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Bot completion is time-based (text stable + no stop button), so also poll.
  const interval = window.setInterval(tick, TICK_MS);
  tick();

  return () => {
    observer.disconnect();
    clearInterval(interval);
    clearTimeout(debounce);
  };
}
