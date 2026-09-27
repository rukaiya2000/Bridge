// All in-page UI lives in one Shadow DOM so the site's CSS and ours can't collide.
const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
  .nudge { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; max-width: 320px; background: #fff;
    color: #1f2933; border-radius: 12px; padding: 14px 36px 14px 14px; font-size: 14px; line-height: 1.4;
    box-shadow: 0 6px 24px rgba(0,0,0,.18); border-left: 4px solid #3e7cb1; }
  .close { position: absolute; top: 6px; right: 8px; border: 0; background: none; font-size: 16px; cursor: pointer; color: #52606d; }
  /* Privacy card: follow Gemini's look (Material 3 surfaces, pill buttons) in light and dark. */
  .privacy { --surface: #fff; --text: #1f1f1f; --muted: #5f6368; --line: #e3e3e3; --field: #f0f4f9;
    --accent: #0b57d0; --on-accent: #fff; --accent-soft: #d3e3fd; --warn: #b06000; --warn-soft: #feefc3;
    --tag: #e8eaed; --tag-text: #3c4043; }
  .privacy { position: fixed; left: 50%; bottom: 128px; z-index: 2147483001; width: min(360px, calc(100vw - 32px));
    transform: translateX(-50%); background: var(--surface); color: var(--text); border: 1px solid var(--line);
    border-radius: 20px; padding: 12px 14px 14px; font: 13.5px/1.4 "Google Sans Text", "Google Sans", Roboto, system-ui, sans-serif;
    box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.14); animation: bridge-rise .18s ease-out; }
  @media (prefers-color-scheme: dark) {
    .privacy { --surface: #1e1f20; --text: #e3e3e3; --muted: #a8abaf; --line: #3c4043; --field: #282a2c;
      --accent: #a8c7fa; --on-accent: #062e6f; --accent-soft: #0842a0; --warn: #fdd663; --warn-soft: rgba(253,214,99,.14);
      --tag: #3c4043; --tag-text: #e3e3e3; }
    .privacy { box-shadow: 0 12px 40px rgba(0,0,0,.5); }
  }
  @keyframes bridge-rise { from { opacity: 0; transform: translate(-50%, 8px); } }
  @media (prefers-reduced-motion: reduce) { .privacy { animation: none; } }
  .privacy * { font-family: inherit; }
  .privacy .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .privacy .icon { flex: none; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%;
    background: var(--warn-soft); color: var(--warn); }
  .privacy.soft .icon { background: var(--accent-soft); color: var(--accent); }
  .privacy h3 { margin: 0; font: 500 15px/1.3 "Google Sans", Roboto, system-ui, sans-serif; letter-spacing: .1px; }
  .privacy p { margin: 0 0 8px; }
  .privacy .why { color: var(--muted); font-size: 12px; margin-bottom: 10px; }
  .privacy .preview { background: var(--field); border-radius: 12px; padding: 8px 12px; margin: 0 0 8px;
    white-space: pre-wrap; word-break: break-word; max-height: 72px; overflow: auto; }
  .privacy .tag { display: inline-block; background: var(--tag); color: var(--tag-text); border-radius: 6px;
    padding: 0 5px; font-size: 12px; line-height: 1.5; }
  .privacy .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .privacy button { height: 34px; padding: 0 14px; border-radius: 17px; border: 1px solid transparent; cursor: pointer;
    font: 500 13.5px "Google Sans", Roboto, system-ui, sans-serif; background: none; color: var(--accent); transition: background .15s; }
  .privacy button:focus { outline: none; }
  .privacy button:focus-visible { box-shadow: 0 0 0 3px var(--accent-soft); }
  .privacy button.primary { flex: 1 1 auto; background: var(--accent); color: var(--on-accent); }
  .privacy button.primary:hover { filter: brightness(1.08); }
  .privacy button.link:hover { background: var(--field); }
  .privacy button.link { color: var(--muted); padding: 0 12px; }
  .privacy button.x { margin-left: auto; width: 28px; height: 28px; padding: 0; border-radius: 50%; color: var(--muted);
    font-size: 18px; line-height: 1; }
  .privacy button.x:hover { background: var(--field); }
`;

export function mountShadow(): ShadowRoot {
  const existing = document.getElementById("bridge-root");
  if (existing?.shadowRoot) return existing.shadowRoot;
  const host = document.createElement("div");
  host.id = "bridge-root";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  root.appendChild(style);
  return root;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
