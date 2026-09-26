// Runs in the page's MAIN world at document_start on AI domains (feature 8).
// Reports only WHEN the page has a live microphone track. It never reads, records or forwards audio.
(() => {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return;
  const live = new Set<MediaStreamTrack>();
  const post = (bridge: "voice-start" | "voice-end") => window.postMessage({ bridge, ts: Date.now() }, location.origin);

  const drop = (t: MediaStreamTrack) => {
    if (live.delete(t) && live.size === 0) post("voice-end");
  };

  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
    const stream = await orig(constraints);
    for (const t of stream.getAudioTracks()) {
      if (live.size === 0) post("voice-start");
      live.add(t);
      t.addEventListener("ended", () => drop(t));
    }
    return stream;
  };

  // Pages usually end voice mode with track.stop(), which does not fire "ended".
  const origStop = MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop = function (this: MediaStreamTrack) {
    origStop.call(this);
    drop(this);
  };

  // Fallback for tracks dropped without stop() (for example, garbage-collected streams).
  setInterval(() => { for (const t of live) if (t.readyState === "ended") drop(t); }, 5000);
})();
