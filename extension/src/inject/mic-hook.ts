// Runs in the page's MAIN world at document_start on AI domains (feature 8).
// Reports only WHEN the page is listening to the microphone. It never reads, records or forwards audio or words.
// Two ways a page listens: a getUserMedia audio track (voice modes, WebRTC), or the Web Speech API
// (SpeechRecognition), which is what Gemini's dictation mic uses and which never calls getUserMedia.
(() => {
  // Dictation stops and restarts listening at every pause, so a gap this short counts as the same session.
  const GAP_MS = 5000;
  const live = new Set<object>(); // audio tracks and speech recognizers currently listening
  let pendingEnd: ReturnType<typeof setTimeout> | undefined;
  const post = (bridge: "voice-start" | "voice-end", ts = Date.now()) => window.postMessage({ bridge, ts }, location.origin);
  const open = (src: object) => {
    if (live.has(src)) return;
    if (live.size === 0) {
      if (pendingEnd !== undefined) { clearTimeout(pendingEnd); pendingEnd = undefined; } // resumed: same session
      else post("voice-start");
    }
    live.add(src);
  };
  const close = (src: object) => {
    if (!live.delete(src) || live.size) return;
    const endedAt = Date.now(); // the session ends when listening stopped, not when the gap ran out
    pendingEnd = setTimeout(() => { pendingEnd = undefined; post("voice-end", endedAt); }, GAP_MS);
  };

  // ---- getUserMedia ----
  const md = navigator.mediaDevices;
  if (md?.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const stream = await orig(constraints);
      for (const t of stream.getAudioTracks()) {
        open(t);
        t.addEventListener("ended", () => close(t));
      }
      return stream;
    };

    // Pages usually end voice mode with track.stop(), which does not fire "ended".
    const origStop = MediaStreamTrack.prototype.stop;
    MediaStreamTrack.prototype.stop = function (this: MediaStreamTrack) {
      origStop.call(this);
      close(this);
    };

    // Fallback for tracks dropped without stop() (for example, garbage-collected streams).
    setInterval(() => {
      for (const t of live) if (t instanceof MediaStreamTrack && t.readyState === "ended") close(t);
    }, 5000);
  }

  // ---- Web Speech API ----
  // "end" fires however listening stops: stop(), abort(), silence, or an error.
  type Recognizer = EventTarget & { start: (...a: unknown[]) => void };
  const w = window as unknown as Record<string, { prototype: Recognizer } | undefined>;
  const patched = new Set<Recognizer>();
  for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
    const proto = w[name]?.prototype;
    if (!proto || patched.has(proto)) continue; // Chrome has both names for the same class
    patched.add(proto);
    const origStart = proto.start;
    proto.start = function (this: Recognizer, ...args: unknown[]) {
      origStart.apply(this, args); // throws if already started; then nothing is counted
      open(this);
      this.addEventListener("end", () => close(this), { once: true });
    };
  }
})();
