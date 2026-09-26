import { el } from "./shadow";

// Keep in sync with the spoken clips in scripts/generate-voice.mjs.
export const NUDGES = [
  "Chatbots are built to keep you talking. Who's someone real you could tell this to?",
  "It's late. Things often feel lighter after some sleep. Want to pick this up tomorrow?",
  "You've been sharing a lot here. Is there a friend who'd want to hear some of it too?",
  "An AI can listen, but it can't show up for you. Who in your life can?",
  "Quick check-in: how long have you been chatting? A short break can help.",
];

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
