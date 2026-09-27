import type { ToWorker } from "../messages";

// After the extension is reloaded or updated, scripts already running in open tabs are cut off from it:
// chrome.runtime.id disappears and sendMessage throws "Extension context invalidated" synchronously,
// so a .catch() alone doesn't stop the console error. Returns false once this tab is cut off.
export function toWorker(msg: ToWorker): boolean {
  if (!chrome.runtime?.id) return false;
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
