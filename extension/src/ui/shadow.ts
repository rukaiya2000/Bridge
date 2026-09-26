// All in-page UI lives in one Shadow DOM so the site's CSS and ours can't collide.
const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
  .badge { position: fixed; left: 12px; bottom: 12px; z-index: 2147483000; background: #243b53; color: #fff;
    border-radius: 999px; padding: 6px 12px; font-size: 12px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
  .badge small { display: block; font-size: 11px; opacity: .85; margin-top: 2px; }
  .nudge { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; max-width: 320px; background: #fff;
    color: #1f2933; border-radius: 12px; padding: 14px 36px 14px 14px; font-size: 14px; line-height: 1.4;
    box-shadow: 0 6px 24px rgba(0,0,0,.18); border-left: 4px solid #3e7cb1; }
  .close { position: absolute; top: 6px; right: 8px; border: 0; background: none; font-size: 16px; cursor: pointer; color: #52606d; }
  .crisis { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483001; background: #eef4fb; color: #102a43;
    padding: 18px 24px; font-size: 15px; line-height: 1.5; box-shadow: 0 4px 20px rgba(0,0,0,.15); }
  .crisis h2 { margin: 0 0 6px; font-size: 18px; }
  .crisis ul { margin: 6px 0; padding-left: 20px; }
  .crisis a { color: #0b4f8a; font-weight: 700; }
  .crisis button { margin-top: 8px; padding: 6px 14px; border-radius: 8px; border: 1px solid #9fb3c8; background: #fff; cursor: pointer; }
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
