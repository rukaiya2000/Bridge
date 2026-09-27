// Claude and Character.AI: heartbeat and voice only. ChatGPT also captures new turns.
import { startCommon } from "./common";
import { startChatgptAdapter } from "../adapters/chatgpt";

const site = startCommon();
if (site === "chatgpt") {
	startChatgptAdapter((turn) => {
		console.info(`[Bridge] captured ${turn.role} message: ${turn.text.length} chars (${turn.id})`);
		chrome.runtime.sendMessage({ type: "turn", turn }).catch(() => {});
	});
}
