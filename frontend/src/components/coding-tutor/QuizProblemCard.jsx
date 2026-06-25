function titleCase(value = "") {
  return value ? value[0].toUpperCase() + value.slice(1).replace("_", " ") : "";
}

function statusLabel(progress) {
  return titleCase(progress?.status || "not_started");
}

export default function QuizProblemCard({ question, progress, onSelect }) {
  const status = progress?.status || "not_started";
  return (
    <button type="button" className={`quiz-problem-card ${status}`} onClick={() => onSelect(question)}>
      <div className="quiz-problem-title">
        <span className="quiz-status-dot" aria-hidden="true" />
        <strong>{question.title}</strong>
      </div>
      <small>{question.topic} / {titleCase(question.difficulty)}</small>
      <div className="quiz-meta-row">
        <span>{statusLabel(progress)}</span>
      </div>
    </button>
  );
}
