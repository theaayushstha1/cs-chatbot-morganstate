// At-a-glance momentum tiles: 🔥 streak, ✅ solved, ✍️ attempted, 📊 % complete.
// Reuses progressSummary (no new data). Shared by the Home dashboard, Quiz Bank,
// and the Progress tab so the progress UI is consistent everywhere.
export default function StatTiles({ progressSummary }) {
  const tiles = [
    { key: "streak", icon: "🔥", value: progressSummary.displayStreak, label: "Day streak" },
    { key: "solved", icon: "✅", value: progressSummary.solvedCount, label: "Solved" },
    { key: "attempted", icon: "✍️", value: progressSummary.attemptedCount, label: "Attempted" },
    { key: "complete", icon: "📊", value: `${progressSummary.completionPercent}%`, label: "Complete" },
  ];
  return (
    <div className="coding-stat-tiles" aria-label="Your coding progress at a glance">
      {tiles.map(tile => (
        <div className={`coding-stat-tile stat-${tile.key}`} key={tile.key}>
          <span className="coding-stat-icon" aria-hidden="true">{tile.icon}</span>
          <strong className="coding-stat-value">{tile.value}</strong>
          <span className="coding-stat-label">{tile.label}</span>
        </div>
      ))}
    </div>
  );
}
