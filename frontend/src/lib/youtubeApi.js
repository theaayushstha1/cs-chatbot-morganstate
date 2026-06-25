// Loads the official YouTube IFrame Player API once and resolves when ready.
// Using the API (instead of a raw <iframe src>) makes playback start reliably
// from a user click and is less likely to be blocked than a bare cross-origin
// embed iframe.

let readyPromise = null;

export function loadYouTubeApi() {
  if (readyPromise) return readyPromise;

  readyPromise = new Promise((resolve) => {
    // Already loaded.
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    // Chain onto any existing onYouTubeIframeAPIReady handler.
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") {
        try { prev(); } catch { /* ignore */ }
      }
      resolve(window.YT);
    };

    // Inject the script once.
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      document.head.appendChild(tag);
    }
  });

  return readyPromise;
}
