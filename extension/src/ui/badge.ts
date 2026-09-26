import { el } from "./shadow";

export function showBadge(root: ShadowRoot): void {
  const badge = el("div", "badge", "Bridge is on");
  const more = el("small", undefined, "Your parent sees topics and time, never your words.");
  more.hidden = true;
  badge.appendChild(more);
  badge.addEventListener("click", () => { more.hidden = !more.hidden; });
  root.appendChild(badge);
}
