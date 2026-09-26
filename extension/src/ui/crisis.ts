import { el } from "./shadow";

const COOLDOWN_MS = 10 * 60_000;
let lastShown = 0;

function link(href: string, text: string) {
  const a = el("a", undefined, text);
  a.href = href;
  return a;
}

function item(parts: (string | Node)[]) {
  const li = el("li");
  for (const p of parts) li.append(p);
  return li;
}

export function showCrisis(root: ShadowRoot, abuseAtHome: boolean): void {
  if (Date.now() - lastShown < COOLDOWN_MS || root.querySelector(".crisis")) return;
  lastShown = Date.now();
  const panel = el("div", "crisis");
  panel.setAttribute("role", "dialog");
  panel.append(el("h2", undefined, "You don't have to handle this alone."));
  panel.append(el("div", undefined, "Talk to someone now, free and confidential, 24/7:"));
  const list = el("ul");
  list.append(item([el("strong", undefined, "988 Suicide & Crisis Lifeline"), ": call or text ", link("tel:988", "988")]));
  list.append(item([el("strong", undefined, "Crisis Text Line"), ": text ", link("sms:741741?&body=HOME", "HOME to 741741")]));
  if (abuseAtHome) {
    list.append(item([
      el("strong", undefined, "Childhelp National Child Abuse Hotline"), ": call or text ",
      link("tel:18004224453", "1-800-422-4453"),
    ]));
  }
  panel.append(list);
  const danger = el("div");
  danger.append("If you're in immediate danger, call ", link("tel:911", "911"), ".");
  panel.append(danger);
  const ok = el("button", undefined, "I'm okay for now");
  ok.addEventListener("click", () => panel.remove());
  panel.append(ok);
  root.appendChild(panel);
}
