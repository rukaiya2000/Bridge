// Runs on localhost pages, but only acts on the Bridge parent dashboard (it has <meta name="bridge-dashboard">).
// When someone logs in there, the extension in this browser logs in to the same account (service
// worker: adoptDashboardSession). Logging out of the dashboard leaves the extension logged in.
import type { ToWorker } from "../messages";

type Session = { token: string; email: string };

function send(s: Session | null) {
  if (!s?.token || !s.email) return;
  const msg: ToWorker = { type: "dashboard-session", token: s.token, email: s.email };
  void chrome.runtime.sendMessage(msg).catch(() => {});
}

if (document.querySelector('meta[name="bridge-dashboard"]')) {
  // Already logged in when the page opened (dashboard/src/api.ts keeps it under this key).
  try {
    send(JSON.parse(localStorage.getItem("bridge-session") ?? "null"));
  } catch { /* storage blocked: wait for a login */ }
  // A login on this page from now on.
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data?.bridge === "dashboard-session") send(e.data.session);
  });
}
