// MV3 service workers can't play audio, so spoken nudges play here (feature 8).
import type { ToOffscreen } from "../messages";

let current: HTMLAudioElement | null = null;

chrome.runtime.onMessage.addListener((msg: ToOffscreen) => {
  if (msg.type !== "play-audio") return;
  current?.pause();
  current = new Audio(chrome.runtime.getURL(msg.file));
  // Missing clip (not generated yet) just fails quietly; the text card still shows.
  current.play().catch(() => {});
});
