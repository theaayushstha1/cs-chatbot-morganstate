export default function TutorStatusCard({ activeProblem, selectedLanguage, attempts, tutorMode }) {
  return (
    <div className="ai-status-card">
      <span className="coding-kicker">Currently helping with</span>
      <dl>
        <div><dt>Problem</dt><dd>{activeProblem?.title || "No problem loaded"}</dd></div>
        <div><dt>Language</dt><dd>{selectedLanguage}</dd></div>
        <div><dt>Attempts</dt><dd>{attempts}</dd></div>
        <div><dt>Mode</dt><dd>{tutorMode}</dd></div>
      </dl>
    </div>
  );
}
