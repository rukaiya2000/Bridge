// @vitest-environment jsdom
import { expect, it } from "vitest";

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

// A stand-in for Chrome's speech recognizer (what Gemini's dictation mic uses).
class FakeRecognizer extends EventTarget {
  running = false;
  start() { if (this.running) throw new Error("already started"); this.running = true; }
  stop() { this.running = false; this.dispatchEvent(new Event("end")); }
}
(window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognizer;

const seen: string[] = [];
addEventListener("message", (e) => { if (e.data?.bridge) seen.push(e.data.bridge); });
await import("../src/inject/mic-hook");

it("reports when speech recognition starts and stops listening, once each", async () => {
  const rec = new FakeRecognizer();
  rec.start();
  expect(() => rec.start()).toThrow(); // a second start is the page's error, not a second session
  await tick();
  expect(seen).toEqual(["voice-start"]);
  rec.stop();
  await tick();
  expect(seen).toEqual(["voice-start"]); // waits in case listening resumes
  await tick(5100);
  expect(seen).toEqual(["voice-start", "voice-end"]);
}, 10_000);

it("treats dictation that restarts after a short pause as one session", async () => {
  seen.length = 0;
  const rec = new FakeRecognizer();
  rec.start();
  rec.stop();
  await tick(1000);
  rec.start(); // Gemini starts listening again after a pause
  rec.stop();
  await tick(5100);
  expect(seen).toEqual(["voice-start", "voice-end"]);
}, 10_000);
