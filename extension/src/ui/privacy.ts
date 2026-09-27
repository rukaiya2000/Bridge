// "This looks personal" card. Shows the kinds of information found, never the values.
import { el } from "./shadow";
import { FINDING_LABEL, type Finding } from "../privacy/detect";

// held: nothing was sent · hidden: sent with the details replaced · sent: sent as typed ("Send anyway").
export type PauseOutcome = "held" | "hidden" | "sent";

const SHIELD = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z"/>
  <path d="M12 8v4"/><path d="M12 15.5h.01"/></svg>`;

const listOf = (items: string[]) => new Intl.ListFormat("en", { type: "conjunction" }).format(items);

// The cleaned message, with each "[… removed]" shown as a small tag. textContent stays the plain text.
function preview(text: string): HTMLElement {
  const box = el("div", "preview");
  const shown = text.length > 220 ? `${text.slice(0, 220)}…` : text;
  for (const part of shown.split(/(\[[a-z ]+ removed\])/i)) {
    if (part) box.append(/^\[[a-z ]+ removed\]$/i.test(part) ? el("span", "tag", part) : part);
  }
  return box;
}

function card(cls: string, title: string): HTMLDivElement {
  const c = el("div", cls);
  const head = el("div", "head");
  const icon = el("div", "icon");
  icon.innerHTML = SHIELD; // constant markup, no page or user data
  head.append(icon, el("h3", undefined, title));
  c.append(head);
  return c;
}

export function showPrivacyPause(
  root: ShadowRoot,
  opts: {
    what: "message" | "file"; findings: Finding[]; fileName?: string; strict: boolean;
    hidden?: string | null; // the message with its details replaced; offered as the first choice
  },
): Promise<PauseOutcome> {
  root.querySelector(".privacy")?.remove();
  return new Promise((resolve) => {
    const c = card("privacy", "This looks personal");
    c.setAttribute("role", "alertdialog");
    const found = listOf(opts.findings.map((f) => FINDING_LABEL[f]));
    const lead = opts.what === "file" ? `“${opts.fileName}” seems to contain ${found}.` : `Your message includes ${found}.`;
    c.setAttribute("aria-label", `This looks personal. ${lead}`);
    // With a preview, its tags already show what was found, so the sentence is left out to keep the card small.
    c.append(opts.hidden ? preview(opts.hidden) : el("p", "lead", lead));
    c.append(el("p", "why", "Your parent only sees that it was paused."));

    const done = (outcome: PauseOutcome) => { c.remove(); resolve(outcome); };
    c.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done("held"); } });

    const button = (cls: string, label: string, outcome: PauseOutcome) => {
      const b = el("button", cls, label);
      b.type = "button";
      b.addEventListener("click", () => done(outcome));
      return b;
    };
    // × (or Esc) goes back to the message box. "Edit my message" is only a button when there's no
    // cleaned version to offer, since otherwise the teen can just edit the placeholders.
    const close = button("x", "×", "held");
    close.setAttribute("aria-label", "Close and keep editing");
    close.title = "Close and keep editing";
    c.querySelector(".head")!.append(close);
    const back = opts.what === "file" ? "Don't upload" : "Edit my message";
    const first = opts.hidden ? button("primary", "Send without these details", "hidden") : button("primary", back, "held");
    const actions = el("div", "actions");
    actions.append(first);
    if (!opts.strict) actions.append(button("link", opts.what === "file" ? "Upload anyway" : "Send anyway", "sent"));
    c.append(actions);
    root.appendChild(c);
    first.focus();
  });
}

// Photos can't be read cheaply, so they get a reminder instead of a pause.
export function showPhotoReminder(root: ShadowRoot): void {
  root.querySelector(".privacy")?.remove();
  const c = card("privacy soft", "Quick reminder about photos");
  c.append(el("p", "why", "Photos can show your face, your school, or where you live. Only share what you'd be okay with anyone seeing."));
  const ok = el("button", "primary", "Got it");
  ok.type = "button";
  ok.addEventListener("click", () => c.remove());
  const actions = el("div", "actions");
  actions.append(ok);
  c.append(actions);
  root.appendChild(c);
  setTimeout(() => c.remove(), 12_000);
}

export function showSafetyBlock(root: ShadowRoot, categories: string[]): Promise<void> {
  root.querySelector(".privacy")?.remove();
  return new Promise((resolve) => {
    const c = card("privacy", "This message wasn't sent");
    c.setAttribute("role", "alertdialog");
    // Romance with the chatbot on its own gets its own line; anything dangerous gets the trusted-person one.
    const romanceOnly = categories.length > 0 && categories.every((x) => x === "ai_romance");
    c.append(el("p", "lead", romanceOnly
      ? "A chatbot can't be a real boyfriend or girlfriend. The people in your life can be there for you in ways it can't."
      : "This sounds like something to talk about with someone you trust, not a chatbot."));
    const done = () => { c.remove(); resolve(); };
    c.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } });
    const back = el("button", "primary", "Edit my message");
    back.type = "button";
    back.addEventListener("click", done);
    const actions = el("div", "actions");
    actions.append(back);
    c.append(actions);
    root.appendChild(c);
    back.focus();
  });
}
