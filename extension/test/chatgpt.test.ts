// @vitest-environment jsdom
// The privacy guard and safety gate on ChatGPT's message box (ProseMirror #prompt-textarea + send button).
import { beforeEach, describe, expect, it } from "vitest";
import { startPrivacyGuard } from "../src/privacy/guard";
import { SELECTORS, startChatgptAdapter } from "../src/adapters/chatgpt";
import { mountShadow } from "../src/ui/shadow";
import type { Turn } from "../../core/src/types";

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
Object.defineProperty(HTMLElement.prototype, "innerText", { get() { return this.textContent; }, configurable: true });

let verdict = { block: false, categories: [] as string[] };
const checked: string[] = [];
const reports: [string, string[], string][] = [];
const root = mountShadow();
startPrivacyGuard({
  root, selectors: SELECTORS, isStrict: async () => false, report: (...a) => reports.push(a),
  checkSafety: async (text) => { checked.push(text); return verdict; },
});

let sends = 0;
function page() {
  document.querySelectorAll("form").forEach((n) => n.remove());
  const form = document.createElement("form");
  form.innerHTML = `<div id="prompt-textarea" class="ProseMirror" contenteditable="true"></div>
    <button type="button" aria-label="Dictate button">mic</button>
    <button type="button" id="composer-submit-button" data-testid="send-button" aria-label="Send prompt">send</button>`;
  document.body.append(form);
  form.querySelector("#composer-submit-button")!.addEventListener("click", () => sends++);
  return form.querySelector<HTMLElement>("#prompt-textarea")!;
}
const type = (editor: HTMLElement, text: string) => {
  editor.textContent = text;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
};
const enter = (editor: HTMLElement) =>
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
const card = () => root.querySelector(".privacy");

beforeEach(() => {
  sends = 0; checked.length = 0; reports.length = 0; card()?.remove();
  verdict = { block: false, categories: [] };
});

describe("ChatGPT privacy guard and safety gate", () => {
  it("checks the message and sends it with ChatGPT's send button", async () => {
    const editor = page();
    type(editor, "help me plan a birthday party");
    enter(editor);
    await tick();
    expect(checked).toEqual(["help me plan a birthday party"]);
    expect(sends).toBe(1);
  });

  it("blocks a message the safety gate flags, and keeps it in the box", async () => {
    verdict = { block: true, categories: ["self_harm"] };
    const editor = page();
    type(editor, "is it okay for me to eat poison");
    enter(editor);
    await tick();
    expect(sends).toBe(0);
    expect(card()).not.toBeNull();
    expect(editor.textContent).toBe("is it okay for me to eat poison");
    expect(reports.at(-1)).toEqual(["message", ["unsafe"], "held"]);
  });

  it("pauses a message with personal info before ChatGPT gets it", async () => {
    const editor = page();
    type(editor, "my card is 4111 1111 1111 1111");
    enter(editor);
    await tick();
    expect(sends).toBe(0);
    expect(card()).not.toBeNull();
  });
});

describe("ChatGPT adapter", () => {
  it("emits the user turn, then the bot turn once the reply stops changing", async () => {
    document.body.innerHTML = "";
    const turns: Turn[] = [];
    const stop = startChatgptAdapter((t) => turns.push(t));
    await tick(1200); // the adapter ignores messages already on the page when it starts
    document.body.insertAdjacentHTML("beforeend",
      `<div data-message-author-role="user"><div class="whitespace-pre-wrap">hi there</div></div>`);
    await tick(600);
    document.body.insertAdjacentHTML("beforeend",
      `<div data-message-author-role="assistant"><div class="markdown">Hello! How can I help?</div></div>`);
    await tick(2500);
    stop();
    expect(turns.map((t) => [t.site, t.role, t.text])).toEqual([
      ["chatgpt", "user", "hi there"],
      ["chatgpt", "bot", "Hello! How can I help?"],
    ]);
  }, 10_000);
});
