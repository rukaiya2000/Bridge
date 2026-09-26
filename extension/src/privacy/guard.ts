// Pauses a message or upload that contains personal information before the chatbot receives it.
// Listeners run in the capture phase on window, so they see Enter, send clicks, file picks, drops
// and pastes before the page's own handlers. Detection is synchronous, so clean messages are never delayed.
import { findInText, type Finding } from "./detect";
import { checkFile } from "./files";
import { showPhotoReminder, showPrivacyPause } from "../ui/privacy";

export interface GuardOptions {
  root: ShadowRoot;
  selectors: { composer: string; sendButton: string };
  isStrict: () => Promise<boolean>;
  report: (what: "message" | "file", findings: Finding[], proceeded: boolean) => void;
}

export function startPrivacyGuard(opts: GuardOptions): void {
  const { root, selectors } = opts;
  const composer = () => document.querySelector<HTMLElement>(selectors.composer);
  const composerText = () => composer()?.innerText.trim() ?? "";

  // ---- typed messages ----
  let allowNextSend = false;

  async function pauseSend(findings: Finding[]) {
    const strict = await opts.isStrict();
    const { proceed } = await showPrivacyPause(root, { what: "message", findings, strict });
    opts.report("message", findings, proceed);
    if (!proceed) return composer()?.focus();
    allowNextSend = true;
    document.querySelector<HTMLElement>(selectors.sendButton)?.click();
  }

  function interceptSend(e: Event) {
    if (allowNextSend) { allowNextSend = false; return; }
    const findings = findInText(composerText());
    if (!findings.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void pauseSend(findings);
  }

  addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    if (!(e.target instanceof Node) || !composer()?.contains(e.target)) return;
    interceptSend(e);
  }, true);

  addEventListener("click", (e) => {
    if (e.target instanceof Element && e.target.closest(selectors.sendButton)) interceptSend(e);
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
    const strict = await opts.isStrict();
    for (const c of flagged) {
      const { proceed } = await showPrivacyPause(root, { what: "file", findings: c.findings, fileName: c.name, strict });
      opts.report("file", c.findings, proceed);
      if (!proceed) return false;
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
