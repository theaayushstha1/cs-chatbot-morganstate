import { FaStop } from "react-icons/fa";
import { estimateComplexity } from "../../lib/complexity";

function statusLabel(status) {
  if (status === "passed") return "Passed";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  if (status === "error") return "Error";
  if (status === "ran") return "Done";
  return "Ready";
}

function formatValue(value) {
  if (typeof value === "undefined") return "undefined";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function TerminalOutputPane({ output, tests, onExplainError }) {
  const capturedOutput = [output.stdout, output.stderr].filter(Boolean).join("\n");
  const hasRunResults = ["passed", "failed", "error"].includes(output.status) && tests.length > 0;
  const returnOutput = hasRunResults
    ? tests.map((test) => {
        if (test.error) return test.error;
        return formatValue(test.actual);
      }).join("\n")
    : "";
  // An actual crash/runtime/syntax error: status "error" or stderr present.
  const hasError = output.status === "error" || Boolean(output.stderr);

  return (
    <section className="terminal-panel-output" aria-label="Terminal output">
      <div className="terminal-panel-heading">
        <span>Output</span>
        {hasError && onExplainError && (
          <button type="button" className="terminal-explain-btn" onClick={onExplainError}>
            Explain this error
          </button>
        )}
      </div>
      {capturedOutput ? (
        <>
          <span className="terminal-output-kind">Program output</span>
          <pre>{capturedOutput}</pre>
        </>
      ) : returnOutput ? (
        <>
          <span className="terminal-output-kind">Return value</span>
          <pre>{returnOutput}</pre>
        </>
      ) : (
        <div className="terminal-panel-empty">
          Terminal output is empty. Return values will appear here after a run, and print / console output will appear here when your code writes it.
        </div>
      )}
    </section>
  );
}

// Estimated time complexity from the current code (heuristic). Shown so the
// student gets a sense of efficiency without needing a separate "Complexity"
// button or an AI call.
function ComplexityEstimate({ code, language }) {
  const est = code && code.trim() ? estimateComplexity(code, language) : null;
  if (!est) return null;
  return (
    <div className={`terminal-complexity confidence-${est.confidence}`}>
      <span className="terminal-complexity-kind">Est. time complexity</span>
      <strong>{est.label}</strong>
      <span className="terminal-complexity-why">{est.rationale}</span>
    </div>
  );
}

function TerminalTestsPane({ output, tests, code, language, onExplainFailedTests, onRequestReview }) {
  const hasSummary = typeof output.passed === "number" && typeof output.total === "number";
  const hasFailedTests = tests.some(test => !test.passed);
  const checklist = Array.isArray(output.quality_checklist) ? output.quality_checklist : [];

  if (output.free_run) {
    return (
      <section className="terminal-panel-tests" aria-label="Run summary">
        <div className="terminal-panel-heading">
          <span>Run</span>
          {typeof output.duration_ms === "number" && <em>{Math.round(output.duration_ms)} ms</em>}
          {onRequestReview && (
            <button type="button" className="terminal-explain-btn" onClick={onRequestReview}>
              Ask for a review
            </button>
          )}
        </div>
        {output.message && <p className="terminal-panel-message">{output.message}</p>}
        <ComplexityEstimate code={code} language={language} />
        <p className="terminal-panel-message">Personal code runs are not auto-graded. Use the floating Coding Tutor for review or hints.</p>
      </section>
    );
  }

  return (
    <section className="terminal-panel-tests" aria-label="Test cases">
      <div className="terminal-panel-heading">
        <span>Tests</span>
        {hasSummary && (
          <strong>
            {output.passed}/{output.total} passed
          </strong>
        )}
        {typeof output.duration_ms === "number" && <em>{Math.round(output.duration_ms)} ms</em>}
        {hasFailedTests && onExplainFailedTests && (
          <button type="button" className="terminal-explain-btn" onClick={onExplainFailedTests}>
            Explain failed tests
          </button>
        )}
        {!hasFailedTests && onRequestReview && (
          <button type="button" className="terminal-explain-btn" onClick={onRequestReview}>
            Ask for a review
          </button>
        )}
      </div>
      {output.message && <p className="terminal-panel-message">{output.message}</p>}
      <ComplexityEstimate code={code} language={language} />
      {checklist.length > 0 && (
        <div className="terminal-quality-checklist">
          <strong>Code quality checklist</strong>
          <ul>{checklist.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      )}
      {tests.length > 0 ? (
        <div className="terminal-panel-test-list">
          {tests.map((test, index) => (
            <article key={`${test.name || "test"}-${index}`} className={`terminal-panel-test ${test.passed ? "passed" : "failed"}`}>
              <span>{test.passed ? "PASS" : "FAIL"}</span>
              <div className="terminal-panel-test-detail">
                <strong>{test.name || `Test ${index + 1}`}</strong>
                <code>Input: {formatValue(test.args)}</code>
                <code>Expected: {formatValue(test.expected)}</code>
                <code>Actual: {formatValue(test.actual)}</code>
                {test.error && <small>{test.error}</small>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="terminal-panel-empty">
          Test cases will appear here after you run a local practice problem.
        </div>
      )}
    </section>
  );
}

export default function TerminalPanel({
  testOutput,
  code,
  language,
  isRunning = false,
  expanded = false,
  onClose,
  onStop,
  onExplainFailedTests,
  onExplainError,
  onRequestReview,
}) {
  const output = typeof testOutput === "string" ? { status: "ready", message: testOutput } : (testOutput || {});
  const tests = output.tests || [];
  const running = isRunning || output.status === "running";

  return (
    <div className={`coding-terminal terminal-panel ${expanded ? "expanded" : ""}`} aria-live="polite">
      <div className="coding-terminal-header">
        <div className="coding-terminal-tabs" aria-label="Workspace panel tabs">
          <span className="active">Terminal</span>
        </div>
        <div className="coding-terminal-controls">
          <span className={`terminal-status ${output.status || "ready"}`}>{statusLabel(output.status)}</span>
          {running && onStop && (
            <button
              type="button"
              className="terminal-stop-btn"
              onClick={onStop}
              aria-label="Stop running"
              title="Stop (use if the run is stuck or looping)"
            >
              <FaStop aria-hidden="true" />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close terminal" title="Close terminal">
              x
            </button>
          )}
        </div>
      </div>
      <div className="terminal-panel-body">
        <TerminalOutputPane output={output} tests={tests} onExplainError={onExplainError} />
        <TerminalTestsPane
          output={output}
          tests={tests}
          code={code}
          language={language}
          onExplainFailedTests={onExplainFailedTests}
          onRequestReview={onRequestReview}
        />
      </div>
    </div>
  );
}
