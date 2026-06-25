import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function HintPanel({ hints, revealedHints, onShowHint, onShowAllHints, codeRenderer }) {
  return (
    <div className="workspace-hints-panel">
      <div className="daily-actions">
        <button type="button" className="daily-practice-btn secondary" onClick={onShowHint}>Show Hint</button>
        <button type="button" className="daily-practice-btn secondary" onClick={onShowAllHints}>Show All</button>
      </div>
      {revealedHints > 0 ? (
        <ol>
          {hints.slice(0, revealedHints).map(hint => (
            <li key={hint.level}>
              <strong>{hint.title}:</strong>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: codeRenderer }}>
                {hint.body}
              </ReactMarkdown>
            </li>
          ))}
        </ol>
      ) : <p>Hints unlock progressively. Try the strategy hint first, then run attempts to unlock the near-solution hint.</p>}
    </div>
  );
}
