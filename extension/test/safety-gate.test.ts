// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { startPrivacyGuard } from "../src/privacy/guard";
import { SELECTORS } from "../src/adapters/gemini";
import { mountShadow } from "../src/ui/shadow";

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// jsdom has no layout, so no innerText: the guard reads the message box through it.
Object.defineProperty(HTMLElement.prototype, "innerText", { get() { return this.textContent; }, configurable: true });

// The safety gate's answer (normally the service worker's Jev verdict), controlled per test.
let verdict = { block: false, categories: [] as string[] };
let fail = false;
let delayMs = 0;
const checked: string[] = [];
const reports: [string, string[], string][] = [];
const root = mountShadow();
startPrivacyGuard({
  root, selectors: SELECTORS, isStrict: async () => false, report: (...a) => reports.push(a),
  checkSafety: async (text) => { checked.push(text); await tick(delayMs); if (fail) throw new Error("Extension context invalidated."); return verdict; },
});

let sends = 0;
function page() {
  document.querySelectorAll(".page").forEach((n) => n.remove());
  const wrap = document.createElement("div");
  wrap.className = "page";
  wrap.innerHTML = `<div class="ql-editor" contenteditable="true"></div><button aria-label="Send message">send</button>`;
  document.body.append(wrap);
  wrap.querySelector("button")!.addEventListener("click", () => sends++);
  return { editor: wrap.querySelector<HTMLElement>("[contenteditable]")!, send: wrap.querySelector("button")! };
}
const type = (editor: HTMLElement, text: string) => {
  editor.textContent = text;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
};
const enter = (editor: HTMLElement) =>
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
const card = () => root.querySelector(".privacy");
const button = (label: string) => [...(card()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === label);

beforeEach(() => {
  sends = 0; delayMs = 0; fail = false; checked.length = 0; reports.length = 0; card()?.remove();
  verdict = { block: false, categories: [] };
});

describe("safety gate", () => {
  it("an error in the check never leaves the message stuck", async () => {
    fail = true;
    const { editor } = page();
    type(editor, "I am dying to watch a movie tomorrow");
    enter(editor);
    await tick();
    expect(sends).toBe(1);
  });

  it("sends with the message box's own send button, not another 'Send…' button on the page", async () => {
    document.querySelectorAll(".page, .decoy").forEach((n) => n.remove());
    let feedback = 0;
    const decoy = document.createElement("button");
    decoy.className = "decoy";
    decoy.setAttribute("aria-label", "Send feedback");
    decoy.addEventListener("click", () => feedback++);
    document.body.prepend(decoy); // first match for button[aria-label*="Send"] on the page
    const { editor } = page();
    type(editor, "I am dying to watch a movie tomorrow");
    enter(editor);
    await tick();
    expect(sends).toBe(1);
    expect(feedback).toBe(0);
    decoy.remove();
  });

  it("with no send button, presses Enter in the box instead", async () => {
    const { editor, send } = page();
    send.remove();
    let enters = 0;
    editor.addEventListener("keydown", (e) => { if (e.key === "Enter") enters++; });
    type(editor, "hello there");
    enter(editor);
    await tick();
    expect(enters).toBe(1); // the teen's Enter is held before it reaches the box; Bridge's re-sent one goes through
  });

  it("holds every message until the gate answers, then sends a safe one", async () => {
    const { editor } = page();
    type(editor, "can you help with my history essay");
    expect(enter(editor)).toBe(false); // held: the chatbot hasn't received it
    expect(sends).toBe(0);
    await tick();
    expect(checked).toEqual(["can you help with my history essay"]);
    expect(sends).toBe(1); // released to the chatbot
    expect(card()).toBeNull();
  });

  it("blocks an unsafe message before it reaches the chatbot, with no 'Send anyway'", async () => {
    verdict = { block: true, categories: ["self_harm"] };
    const { editor, send } = page();
    type(editor, "i don't want to be alive anymore");
    send.click();
    await tick();
    expect(sends).toBe(0);
    expect(card()!.textContent).toContain("This message wasn't sent");
    expect(card()!.querySelector("a")).toBeNull(); // no phone numbers or links
    expect(button("Send anyway")).toBeUndefined();
    expect(reports).toEqual([["message", ["unsafe"], "held"]]); // category never reported
    expect(editor.textContent).toBe("i don't want to be alive anymore"); // left in the box
  });

  it("pressing Enter again while the gate is checking doesn't send", async () => {
    verdict = { block: true, categories: ["violence"] };
    delayMs = 60;
    const { editor } = page();
    type(editor, "i'm going to bring a gun to school");
    enter(editor);
    expect(enter(editor)).toBe(false);
    expect(enter(editor)).toBe(false);
    await tick(120);
    expect(sends).toBe(0);
    expect(checked.length).toBe(1);
  });

  it("'Send anyway' on personal info still goes through the gate", async () => {
    verdict = { block: true, categories: ["stranger_danger"] };
    const { editor } = page();
    type(editor, "meet me at the mall, my email is sam@example.com, don't tell my parents");
    enter(editor);
    await tick();
    button("Send anyway")!.click(); // the privacy pause for the email
    await tick();
    expect(sends).toBe(0);
    expect(card()!.textContent).toContain("This message wasn't sent");
    expect(reports).toEqual([["message", ["email"], "sent"], ["message", ["unsafe"], "held"]]);
  });

  it("a blocked message edited into a safe one is checked again and sent", async () => {
    verdict = { block: true, categories: ["self_harm"] };
    const { editor } = page();
    type(editor, "i want to disappear forever");
    enter(editor);
    await tick();
    button("Edit my message")!.click();
    verdict = { block: false, categories: [] };
    type(editor, "can we talk about something else");
    enter(editor);
    await tick();
    expect(checked).toEqual(["i want to disappear forever", "can we talk about something else"]);
    expect(sends).toBe(1);
  });
});
