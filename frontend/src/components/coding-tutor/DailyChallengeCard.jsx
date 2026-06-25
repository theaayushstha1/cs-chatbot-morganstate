export default function DailyChallengeCard({ dailyChallenge, loading, variant = "page", onStartChallenge, onPracticeWithHints }) {
  const difficulty = dailyChallenge?.difficulty || "Easy";
  const estimatedTime = String(difficulty).toLowerCase() === "hard"
    ? "25 min"
    : String(difficulty).toLowerCase() === "medium"
      ? "15 min"
      : "5 min";

  if (variant === "dashboard") {
    return (
      <button type="button" className="daily-feature-card dashboard-daily" onClick={onStartChallenge}>
        <span className="coding-kicker">Today&apos;s Challenge</span>
        <strong>{dailyChallenge?.title || "Daily coding challenge"}</strong>
        <small>Difficulty: {difficulty}</small>
        <small>Estimated Time: {estimatedTime}</small>
        <span className="daily-practice-btn inline">Start Challenge</span>
      </button>
    );
  }

  return (
    <section className="coding-page-panel daily-page">
      <div className="daily-feature-card">
        <span className="coding-kicker">Today&apos;s Challenge</span>
        {loading ? (
          <div className="daily-challenge-loading">Loading today&apos;s challenge...</div>
        ) : (
          <>
            <h2>{dailyChallenge?.title || "Daily coding challenge"}</h2>
            <dl>
              <div><dt>Difficulty</dt><dd>{difficulty}</dd></div>
              <div><dt>Estimated Time</dt><dd>{estimatedTime}</dd></div>
              <div><dt>Source</dt><dd>{dailyChallenge?.source || "LeetCode"}</dd></div>
            </dl>
            {dailyChallenge?.tags?.length > 0 && (
              <div className="daily-tags">{dailyChallenge.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
            )}
            <div className="daily-actions">
              <button type="button" className="daily-practice-btn" onClick={onStartChallenge}>Start Challenge</button>
              <button type="button" className="daily-practice-btn secondary" onClick={onPracticeWithHints}>Practice with Hints</button>
              {dailyChallenge?.url && <a href={dailyChallenge.url} target="_blank" rel="noopener noreferrer" className="daily-link">Open Source</a>}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
