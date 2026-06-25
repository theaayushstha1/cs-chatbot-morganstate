import { FaPlus, FaTrashAlt, FaCode } from "react-icons/fa";

// The left panel of the PERSONAL workspace (My Snippets). Replaces the quiz
// ProblemPanel/guidance card: a "New snippet" action plus the student's saved
// snippets to reopen or delete. No grading, no guidance — this is their space.
export default function PersonalPanel({
  snippets = [],
  activeSnippetId = null,
  onNewSnippet,
  onOpenSnippet,
  onDeleteSnippet,
}) {
  return (
    <aside className="coding-problem-panel personal-panel">
      <div className="personal-panel-head">
        <div>
          <span className="coding-kicker">My Snippets</span>
          <h2>Your personal workspace</h2>
        </div>
        <button type="button" className="personal-new-btn" onClick={onNewSnippet} title="Open new workspace">
          <FaPlus aria-hidden="true" /> New
        </button>
      </div>
      <p className="personal-panel-blurb">
        Write or upload your own code (.py or .ipynb), run it, and save it here. Not graded.
      </p>

      {snippets.length === 0 ? (
        <div className="personal-empty">
          <FaCode aria-hidden="true" />
          <p>No saved snippets yet. Write some code and press <strong>Save</strong>, or upload a file.</p>
        </div>
      ) : (
        <ul className="personal-snippet-list">
          {snippets.map(snippet => (
            <li key={snippet.id} className={`personal-snippet-item ${snippet.id === activeSnippetId ? "active" : ""}`}>
              <button type="button" className="personal-snippet-open" onClick={() => onOpenSnippet(snippet)}>
                <strong>{snippet.name}</strong>
                <span className="personal-snippet-meta">{snippet.language}</span>
              </button>
              <button
                type="button"
                className="personal-snippet-delete"
                onClick={() => onDeleteSnippet(snippet.id)}
                aria-label={`Delete ${snippet.name}`}
                title="Delete snippet"
              >
                <FaTrashAlt aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
