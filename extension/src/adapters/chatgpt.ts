import type { Role, Turn } from "../../../core/src/types";

const USER = '[data-message-author-role="user"]';
const ASSISTANT = '[data-message-author-role="assistant"]';
const STOP = 'button[aria-label*="Stop" i]';
const CONVERSATION_PATH = /\/c\/([A-Za-z0-9-]+)/;
const DEBOUNCE_MS = 250;
const TICK_MS = 500;
const BOT_STABLE_MS = 1200;
const SETTLE_MS = 1000;

const conversationIdFromPath = () => location.pathname.match(CONVERSATION_PATH)?.[1] ?? "new";

function textOf(el: Element, role: Role): string {
  const source = el.querySelector(role === "user" ? ".whitespace-pre-wrap" : ".markdown") ?? el;
  const clone = source.cloneNode(true) as Element;
  clone.querySelectorAll("button, svg, [aria-hidden=\"true\"]").forEach((node) => node.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function startChatgptAdapter(onTurn: (turn: Turn) => void): () => void {
  const seen = new WeakSet<Element>();
  let conversationId = conversationIdFromPath();
  let settling = true;
  let settleCount = -1;
  let settleSince = Date.now();
  let awaitingBot = false;
  let botText = "";
  let botTextSince = 0;
  let debounce: number | undefined;

  const all = (selector: string) => Array.from(document.querySelectorAll(selector));

  function emit(role: Role, text: string, index: number) {
    onTurn({ id: `${conversationId}:${role}:${index}`, site: "chatgpt", conversationId, role, text, ts: Date.now() });
  }

  function settle(now: number) {
    const count = all(`${USER}, ${ASSISTANT}`).length;
    if (count !== settleCount) {
      settleCount = count;
      settleSince = now;
      return;
    }
    if (now - settleSince < SETTLE_MS) return;
    all(`${USER}, ${ASSISTANT}`).forEach((el) => seen.add(el));
    settling = false;
  }

  function checkNavigation() {
    const next = conversationIdFromPath();
    if (next === conversationId) return;
    conversationId = next;
    settling = true;
    settleCount = -1;
    settleSince = Date.now();
    awaitingBot = false;
    botText = "";
  }

  function checkUser() {
    const users = all(USER);
    const el = users.at(-1);
    if (!el || seen.has(el)) return;
    const text = textOf(el, "user");
    if (!text) return;
    seen.add(el);
    awaitingBot = true;
    botText = "";
    emit("user", text, users.length - 1);
  }

  function checkBot(now: number) {
    if (!awaitingBot) return;
    const bots = all(ASSISTANT);
    const el = bots.at(-1);
    if (!el || seen.has(el)) return;
    const text = textOf(el, "bot");
    if (text !== botText) {
      botText = text;
      botTextSince = now;
      return;
    }
    if (!text || document.querySelector(STOP) || now - botTextSince < BOT_STABLE_MS) return;
    seen.add(el);
    awaitingBot = false;
    emit("bot", text, bots.length - 1);
    botText = "";
  }

  function tick() {
    const now = Date.now();
    checkNavigation();
    if (settling) return settle(now);
    checkUser();
    checkBot(now);
  }

  const observer = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = window.setTimeout(tick, DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  const interval = window.setInterval(tick, TICK_MS);
  tick();

  return () => {
    observer.disconnect();
    clearInterval(interval);
    clearTimeout(debounce);
  };
}
