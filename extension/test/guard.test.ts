// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { startPrivacyGuard } from "../src/privacy/guard";
import { SELECTORS } from "../src/adapters/gemini";
import { mountShadow } from "../src/ui/shadow";

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// One guard for the whole file (it listens on window); each test gets fresh page elements.
let strict = false;
const reports: [string, string[], boolean][] = [];
const root = mountShadow();
startPrivacyGuard({ root, selectors: SELECTORS, isStrict: async () => strict, report: (...a) => reports.push(a) });

let sends = 0;
let files = 0;
function page(editorClass: string) {
  document.querySelectorAll(".page").forEach((n) => n.remove());
  const wrap = document.createElement("div");
  wrap.className = "page";
  wrap.innerHTML = `<div class="${editorClass}" contenteditable="true"></div>
    <button aria-label="Send message">send</button><input type="file">`;
  document.body.append(wrap);
  wrap.querySelector("button")!.addEventListener("click", () => sends++);
  wrap.querySelector("input")!.addEventListener("change", () => files++);
  return { editor: wrap.querySelector<HTMLElement>("[contenteditable]")!, send: wrap.querySelector("button")!, input: wrap.querySelector("input")! };
}
const type = (editor: HTMLElement, text: string) => {
  editor.textContent = text;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
};
const enter = (editor: HTMLElement) =>
  editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
const card = () => root.querySelector(".privacy");
const button = (label: string) => [...(card()?.querySelectorAll("button") ?? [])].find((b) => b.textContent === label);

beforeEach(() => { sends = 0; files = 0; strict = false; reports.length = 0; card()?.remove(); });

describe("typed messages", () => {
  it("lets clean messages through, by Enter or the send button", async () => {
    const { editor, send } = page("ql-editor");
    type(editor, "can you help with my history essay");
    expect(enter(editor)).toBe(true); // not cancelled
    send.click();
    await tick();
    expect(sends).toBe(1);
    expect(card()).toBeNull();
  });

  it("works even when the site renames its message box (no selector match)", async () => {
    const { editor } = page("brand-new-gemini-editor");
    type(editor, "my card is 4111 1111 1111 1111");
    expect(enter(editor)).toBe(false); // cancelled
    await tick();
    expect(card()).not.toBeNull();
  });

  it("always blocks card numbers: no 'Send anyway', even with strict mode off", async () => {
    const { editor, send } = page("brand-new-gemini-editor");
    type(editor, "4111.1111.1111.1111");
    send.click();
    await tick();
    expect(sends).toBe(0);
    expect(button("Send anyway")).toBeUndefined();
    expect(card()!.textContent).toContain("a payment card number");
    expect(card()!.textContent).not.toContain("4111");
    button("Edit my message")!.click();
    await tick();
    expect(reports.at(-1)).toEqual(["message", ["card"], false]);
  });

  it.each([["ssn", "my social security number is 536 22 1234"], ["bank", "routing number 021000021"]])(
    "always blocks %s", async (kind, text) => {
      const { editor } = page("x");
      type(editor, text);
      enter(editor);
      await tick();
      expect(card()).not.toBeNull();
      expect(button("Send anyway")).toBeUndefined();
      expect(reports.length).toBe(0); // still waiting for the teen
      button("Edit my message")!.click();
      await tick();
      expect(reports.at(-1)![1]).toContain(kind);
    },
  );

  it("lets the teen choose for lower-risk info (email), and 'Send anyway' sends once", async () => {
    const { editor, send } = page("x");
    type(editor, "my email is jake.miller2011@gmail.com");
    send.click();
    await tick();
    button("Send anyway")!.click();
    await tick();
    expect(sends).toBe(1);
    expect(reports.at(-1)).toEqual(["message", ["email"], true]);
  });

  it("strict mode removes 'Send anyway' for everything", async () => {
    strict = true;
    const { editor } = page("x");
    type(editor, "my email is jake.miller2011@gmail.com");
    enter(editor);
    await tick();
    expect(button("Send anyway")).toBeUndefined();
  });
});

describe("uploads", () => {
  const pick = (input: HTMLInputElement, f: File) => {
    Object.defineProperty(input, "files", { value: [f], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  it("lets an ordinary file through", async () => {
    const { input } = page("x");
    pick(input, new File(["Water cycle notes"], "bio.txt", { type: "text/plain" }));
    await tick(50);
    expect(files).toBe(1);
  });

  it("always blocks a file containing an SSN: no 'Upload anyway'", async () => {
    const { input } = page("x");
    pick(input, new File(["Student form. SSN: 536-22-1234"], "form.txt", { type: "text/plain" }));
    await tick(50);
    expect(files).toBe(0);
    expect(button("Upload anyway")).toBeUndefined();
    button("Don't upload")!.click();
    await tick();
    expect(files).toBe(0);
  });
});

describe("bypass attempts", () => {
  it("'Send anyway' approves only that exact text: editing it to a card number is blocked again", async () => {
    const { editor, send } = page("x");
    send.remove(); // no send button found, so the approval would otherwise linger
    type(editor, "my email is jake.miller2011@gmail.com");
    enter(editor);
    await tick();
    button("Send anyway")!.click();
    await tick();
    type(editor, "my card is 4111 1111 1111 1111");
    expect(enter(editor)).toBe(false); // still cancelled
    await tick();
    expect(card()).not.toBeNull();
    expect(button("Send anyway")).toBeUndefined();
  });

  it.each([["Ctrl+Enter", { ctrlKey: true }], ["Cmd+Enter", { metaKey: true }], ["Alt+Enter", { altKey: true }]])(
    "%s is guarded too", async (_name, mods) => {
      const { editor } = page("x");
      type(editor, "ssn 536-22-1234");
      const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...mods });
      expect(editor.dispatchEvent(ev)).toBe(false);
      await tick();
      expect(card()).not.toBeNull();
    },
  );

  it("clicking the icon inside the send button is guarded", async () => {
    const { editor, send } = page("x");
    send.innerHTML = "<span><svg></svg></span>";
    type(editor, "4111 1111 1111 1111");
    send.querySelector("svg")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await tick();
    expect(sends).toBe(0);
    expect(card()).not.toBeNull();
  });

  it("a plain <textarea> message box is guarded", async () => {
    document.querySelectorAll(".page").forEach((n) => n.remove());
    const wrap = document.createElement("div");
    wrap.className = "page";
    wrap.innerHTML = "<textarea></textarea>";
    document.body.append(wrap);
    const ta = wrap.querySelector("textarea")!;
    ta.value = "my card is 4111 1111 1111 1111";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    expect(ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))).toBe(false);
  });

  it("pressing Enter again while the card is open still doesn't send", async () => {
    const { editor, send } = page("x");
    type(editor, "4111 1111 1111 1111");
    enter(editor);
    enter(editor);
    send.click();
    await tick();
    expect(sends).toBe(0);
  });
});
