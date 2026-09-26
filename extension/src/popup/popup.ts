// Debug popup: shows captured turn metadata (never text). Grows into the full view in docs/PHASE1.md §4.11.
import { load } from "../storage";

async function render() {
  const { recentTurns } = await load("debug");
  const table = document.getElementById("turns") as HTMLTableElement;
  const body = table.querySelector("tbody")!;
  document.getElementById("empty")!.hidden = recentTurns.length > 0;
  table.hidden = recentTurns.length === 0;
  body.replaceChildren(
    ...[...recentTurns].reverse().map((t) => {
      const row = document.createElement("tr");
      for (const value of [new Date(t.ts).toLocaleTimeString(), t.role, String(t.chars), t.id]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }),
  );
}

document.getElementById("reset")!.addEventListener("click", async () => {
  await chrome.storage.local.remove(["profiles", "state", "sessions", "nudges", "debug"]);
  await render();
});

chrome.storage.onChanged.addListener(render);
render();
