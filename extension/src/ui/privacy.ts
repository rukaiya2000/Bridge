// "Wait, this looks personal" card. Shows the kinds of information found, never the values.
import { el } from "./shadow";
import { FINDING_LABEL, type Finding } from "../privacy/detect";

export interface PauseChoice { proceed: boolean }

export function showPrivacyPause(
  root: ShadowRoot,
  opts: { what: "message" | "file"; findings: Finding[]; fileName?: string; strict: boolean },
): Promise<PauseChoice> {
  root.querySelector(".privacy")?.remove();
  return new Promise((resolve) => {
    const card = el("div", "privacy");
    card.setAttribute("role", "alertdialog");
    card.append(el("h3", undefined, "Wait, this looks personal"));
    card.append(el("div", undefined, opts.what === "file"
      ? `“${opts.fileName}” seems to contain:`
      : "Your message seems to include:"));
    const list = el("ul");
    for (const f of opts.findings) list.append(el("li", undefined, FINDING_LABEL[f]));
    card.append(list);
    card.append(el("div", "why", "Chatbots can store what you send, and people at the company may see it. " +
      "Once it's shared, you can't take it back. Your parent will see that this was paused, not what it was."));

    const actions = el("div", "actions");
    const done = (proceed: boolean) => { card.remove(); resolve({ proceed }); };
    const back = el("button", "primary", opts.what === "file" ? "Don't upload" : "Edit my message");
    back.addEventListener("click", () => done(false));
    actions.append(back);
    if (!opts.strict) {
      const anyway = el("button", undefined, opts.what === "file" ? "Upload anyway" : "Send anyway");
      anyway.addEventListener("click", () => done(true));
      actions.append(anyway);
    }
    card.append(actions);
    root.appendChild(card);
    back.focus();
  });
}

// Photos can't be read cheaply, so they get a reminder instead of a pause.
export function showPhotoReminder(root: ShadowRoot): void {
  root.querySelector(".privacy")?.remove();
  const card = el("div", "privacy soft");
  card.append(el("h3", undefined, "Quick reminder about photos"));
  card.append(el("div", "why", "Photos can show your face, your school, or where you live. Only share what you'd be okay with anyone seeing."));
  const ok = el("button", "primary", "Got it");
  ok.addEventListener("click", () => card.remove());
  const actions = el("div", "actions");
  actions.append(ok);
  card.append(actions);
  root.appendChild(card);
  setTimeout(() => card.remove(), 12_000);
}
