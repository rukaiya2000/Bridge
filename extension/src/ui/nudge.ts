import { el } from "./shadow";
// One source for the on-screen card and the spoken clips (scripts/generate-voice.mjs).
import NUDGES from "./nudges.json";

export function showNudge(root: ShadowRoot, variant: number): void {
  root.querySelector(".nudge")?.remove();
  const card = el("div", "nudge", NUDGES[variant % NUDGES.length]);
  const close = el("button", "close", "✕");
  close.setAttribute("aria-label", "Dismiss");
  close.addEventListener("click", () => card.remove());
  card.appendChild(close);
  root.appendChild(card);
  setTimeout(() => card.remove(), 20_000);
}
