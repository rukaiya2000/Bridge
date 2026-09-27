// Pauses a message or upload that contains personal information before the chatbot receives it.
// Listeners run in the capture phase on window, so they see Enter, send clicks, file picks, drops
// and pastes before the page's own handlers. Detection is synchronous, so clean messages are never delayed.
import { ALWAYS_BLOCKED, findInText, hideDetails, type Finding } from "./detect";
import { checkFile } from "./files";
import { showPhotoReminder, showPrivacyPause, type PauseOutcome } from "../ui/privacy";

export interface GuardOptions {
  root: ShadowRoot;
  selectors: { composer: string; sendButton: string };
  isStrict: () => Promise<boolean>;
  report: (what: "message" | "file", findings: Finding[], outcome: PauseOutcome) => void;
}

const EDITABLE = '[contenteditable="true"], [contenteditable=""], textarea';

// Cards, SSNs and bank numbers never get a "send anyway", whatever the strict setting.
const mustBlock = async (findings: Finding[], isStrict: () => Promise<boolean>) =>
  findings.some((f) => ALWAYS_BLOCKED.includes(f)) || (await isStrict());

// How long "Send without these details" waits after rewriting the box before it clicks send.
const SETTLE_MS = 150;

export function startPrivacyGuard(opts: GuardOptions): void {
  const { root, selectors } = opts;

  // The message box is whatever the teen is actually typing in (from the events themselves), so the
  // guard keeps working when the site renames its classes. selectors.composer is only a fallback.
  let lastBox: HTMLElement | null = null;
  let announced = false;
  const boxOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>(EDITABLE) : null);
  const currentBox = () => (lastBox?.isConnected ? lastBox : document.querySelector<HTMLElement>(selectors.composer));
  const textOf = (box: HTMLElement | null) =>
    (box instanceof HTMLTextAreaElement ? box.value : box?.innerText ?? box?.textContent ?? "").trim();

  // Replaces the box's text the way typing would, so the site's editor (Quill on Gemini) updates its
  // own state and sends the new text. execCommand is deprecated but is still the only way to do that.
  const setText = (box: HTMLElement, text: string) => {
    if (box instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
    } else {
      box.focus();
      const range = document.createRange();
      range.selectNodeContents(box);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      if (!document.execCommand?.("insertText", false, text) || textOf(box) !== text.trim()) box.textContent = text;
    }
    box.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const remember = (e: Event) => {
    const box = boxOf(e.target);
    if (!box) return;
    lastBox = box;
    if (!announced) {
      announced = true;
      console.info(`[Bridge] privacy guard is watching the message box <${box.tagName.toLowerCase()}${box.className ? "." + [...box.classList].join(".") : ""}>`);
    }
  };
  for (const type of ["focusin", "input", "keydown"]) addEventListener(type, remember, true);
  console.info("[Bridge] privacy guard active");

  // ---- typed messages ----
  // "Send anyway" approves only the exact text the teen saw on the card. Any edit afterwards is
  // checked again, so the approval can't be reused for a card number typed in its place.
  let approvedText: string | null = null;

  async function pauseSend(box: HTMLElement | null, findings: Finding[]) {
    const strict = await mustBlock(findings, opts.isStrict);
    const hidden = box ? hideDetails(textOf(box)) : null;
    let outcome = await showPrivacyPause(root, { what: "message", findings, strict, hidden });
    if (outcome === "hidden" && box && hidden) {
      setText(box, hidden);
      // Gemini's editor copies the box into its own state a moment later; clicking send before
      // that would send the old text. Then check again: if anything personal is left, don't send.
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      if (findInText(textOf(box)).length) {
        console.warn("[Bridge] privacy guard could not replace the details, so the message was not sent");
        outcome = "held";
      }
    }
    opts.report("message", findings, outcome);
    if (outcome === "held" || !box) return box?.focus();
    // If the send button isn't found, the teen's next Enter or click sends it, as long as the text is unchanged.
    approvedText = textOf(box);
    document.querySelector<HTMLElement>(selectors.sendButton)?.click();
  }

  function interceptSend(e: Event, box: HTMLElement | null) {
    const text = textOf(box);
    if (approvedText !== null && text === approvedText) { approvedText = null; return; }
    approvedText = null;
    const findings = findInText(text);
    if (!findings.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    console.info(`[Bridge] privacy guard held a message with [${findings}]`);
    void pauseSend(box, findings);
  }

  addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    const box = boxOf(e.target);
    if (box) interceptSend(e, box);
  }, true);

  addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest(selectors.sendButton)) interceptSend(e, currentBox());
  }, true);

  // ---- uploads: file picker, drag-and-drop, paste ----
  const released = new WeakSet<Event>();

  // Returns true if the files may go through (clean, or the teen chose to continue).
  async function reviewFiles(files: File[]): Promise<boolean> {
    const checks = await Promise.all(files.map(checkFile));
    const flagged = checks.filter((c) => c.findings.length);
    if (!flagged.length) {
      if (checks.some((c) => c.photo)) showPhotoReminder(root);
      return true;
    }
    for (const c of flagged) {
      const strict = await mustBlock(c.findings, opts.isStrict);
      const outcome = await showPrivacyPause(root, { what: "file", findings: c.findings, fileName: c.name, strict });
      opts.report("file", c.findings, outcome);
      if (outcome !== "sent") return false;
    }
    return true;
  }

  const hold = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };

  addEventListener("change", (e) => {
    const input = e.target;
    if (released.has(e) || !(input instanceof HTMLInputElement) || input.type !== "file" || !input.files?.length) return;
    hold(e);
    void reviewFiles([...input.files]).then((ok) => {
      if (!ok) { input.value = ""; return; }
      const again = new Event("change", { bubbles: true });
      released.add(again);
      input.dispatchEvent(again);
    });
  }, true);

  const withFiles = (files: File[]) => {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    return dt;
  };

  addEventListener("drop", (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (released.has(e) || !files.length || !(e.target instanceof EventTarget)) return;
    hold(e);
    const target = e.target;
    void reviewFiles(files).then((ok) => {
      if (!ok) return;
      const again = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: withFiles(files) });
      released.add(again);
      target.dispatchEvent(again);
    });
  }, true);

  addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (released.has(e) || !files.length || !(e.target instanceof EventTarget)) return;
    hold(e);
    const target = e.target;
    void reviewFiles(files).then((ok) => {
      if (!ok) return;
      const again = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: withFiles(files) });
      released.add(again);
      target.dispatchEvent(again);
    });
  }, true);
}
