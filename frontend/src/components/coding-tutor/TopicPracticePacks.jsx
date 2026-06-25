import { FaBookOpen, FaPlayCircle, FaVideo } from "react-icons/fa";
import "./TopicPracticePacks.css";

function titleCase(value = "") {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default function TopicPracticePacks({ packs = [], selectedTopic, onSelectTopic, onFindVideo }) {
  if (!packs.length) return null;

  return (
    <section className="topic-pack-section" aria-label="Topic practice packs">
      <div className="topic-pack-header">
        <div>
          <span className="coding-kicker">Topic Practice Packs</span>
          <h2>Pick a focused pattern</h2>
        </div>
        <span className="topic-pack-note">All difficulties, one topic at a time</span>
      </div>
      <div className="topic-pack-grid">
        {packs.map((pack, index) => (
          <article
            key={pack.topic}
            className={`topic-pack-card tone-${index % 5} ${selectedTopic === pack.topic ? "active" : ""}`}
          >
            <div className="topic-pack-card-main">
              <span className="topic-pack-icon" aria-hidden="true">
                <FaBookOpen />
              </span>
              <div>
                <h3>{titleCase(pack.topic)}</h3>
                <p>{pack.count} questions - {pack.solved} solved - {pack.attempted} attempted</p>
              </div>
            </div>
            <div className="topic-pack-actions">
              <button type="button" onClick={() => onSelectTopic?.(pack.topic)}>
                <FaPlayCircle aria-hidden="true" />
                Practice
              </button>
              {pack.videoUrl ? (
                <a className="topic-video-btn" href={pack.videoUrl} target="_blank" rel="noreferrer">
                  <FaVideo aria-hidden="true" />
                  Video
                </a>
              ) : (
                <button type="button" className="topic-video-btn" onClick={() => onFindVideo?.(pack.topic)}>
                  <FaVideo aria-hidden="true" />
                  Video
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
