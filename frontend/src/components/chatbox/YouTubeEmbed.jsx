import { memo, useState } from "react";
import { getYouTubeVideoId } from "../../lib/youtube";

// Remembers which videos the user pressed play on, OUTSIDE React state, so a
// re-render/remount of the chat does not snap the player back to the thumbnail.
const PLAYING_VIDEO_IDS = new Set();

function YouTubeEmbed({ href, title, children }) {
  const videoId = getYouTubeVideoId(href);
  // Click-to-play facade: show the thumbnail first; on click, mount a standard
  // YouTube embed iframe INSIDE the chat (no redirect). Initialize from the
  // module-level set so a remount keeps it playing instead of reverting.
  const [playing, setPlaying] = useState(() => PLAYING_VIDEO_IDS.has(videoId));

  if (!videoId) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="message-link">
        {children}
      </a>
    );
  }

  const label = title || (Array.isArray(children) ? children.join("") : children) || "YouTube resource";

  return (
    <span className="youtube-resource-card">
      <span className="youtube-resource-frame">
        {playing ? (
          <iframe
            key={videoId}
            className="youtube-resource-iframe"
            width="560"
            height="315"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
            title={String(label)}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            className="youtube-resource-thumb"
            onClick={() => { PLAYING_VIDEO_IDS.add(videoId); setPlaying(true); }}
            aria-label={`Play ${String(label)}`}
            style={{
              backgroundImage: `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)`,
            }}
          >
            <span className="youtube-resource-play" aria-hidden="true">
              <svg viewBox="0 0 68 48" width="68" height="48">
                <path
                  d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z"
                  fill="#f00"
                />
                <path d="M45 24L27 14v20" fill="#fff" />
              </svg>
            </span>
          </button>
        )}
      </span>
      <span className="youtube-resource-meta">
        <strong>{label}</strong>
        <a href={href} target="_blank" rel="noopener noreferrer">
          Open on YouTube
        </a>
      </span>
    </span>
  );
}

// Memoize on href so the card is not rebuilt while a bot message streams.
export default memo(YouTubeEmbed, (prev, next) => prev.href === next.href);
