export default function ProblemPanel({
  problem,
  solution,
  problemLoading,
  isSolved = false,
  solvedLanguages = [],
  showProblemNavigation = false,
  canGoPrevious = false,
  canGoNext = false,
  onPreviousProblem,
  onNextProblem,
  onOpenQuizBank,
}) {
  return (
    <aside className="coding-problem-panel">
      {problemLoading ? <div className="coding-problem-empty">Loading problem...</div> : problem ? (
        <div className="coding-problem-content">
          <div className="daily-challenge-title-row">
            <h2>{problem.title}</h2>
            <span className="problem-meta-pills">
              <span className={`daily-difficulty ${String(problem.difficulty || "easy").toLowerCase()}`}>{problem.difficulty}</span>
              {isSolved && (
                <span
                  className="problem-solved-badge"
                  title={solvedLanguages.length ? `Solved in ${solvedLanguages.join(", ")}` : "You have solved this problem"}
                >
                  Solved
                </span>
              )}
            </span>
          </div>
          <div className="daily-tags">
            <span>{problem.topic}</span>
            {solution?.function_name && <span>{solution.function_name}</span>}
          </div>
          {showProblemNavigation && (
            <div className="problem-navigation">
              <button type="button" onClick={onPreviousProblem} disabled={!canGoPrevious} title="Previous unsolved problem (solved problems are skipped)">Back</button>
              <button type="button" onClick={onNextProblem} disabled={!canGoNext} title="Next unsolved problem (solved problems are skipped)">Next</button>
            </div>
          )}
          <p>{problem.prompt}</p>
          {(solution?.starter_guidance || solution?.guided_steps?.length > 0) && (
            <section className="starter-guidance-panel">
              <h3>Starter Guidance</h3>
              {solution?.starter_guidance && <p>{solution.starter_guidance}</p>}
              {solution?.guided_steps?.length > 0 && (
                <ul>{solution.guided_steps.slice(0, 3).map((step, index) => <li key={index}>{step}</li>)}</ul>
              )}
            </section>
          )}
          {problem.examples?.length > 0 && (
            <section>
              <h3>Examples</h3>
              {problem.examples.map((example, index) => (
                <div className="problem-example" key={index}>
                  <code>Input: {example.input}</code>
                  <code>Output: {example.output}</code>
                </div>
              ))}
            </section>
          )}
          {problem.constraints?.length > 0 && (
            <section className="problem-constraints-card">
              <h3>Constraints</h3>
              <ul>{problem.constraints.map((constraint, index) => <li key={index}>{constraint}</li>)}</ul>
            </section>
          )}
        </div>
      ) : (
        <div className="coding-problem-empty">
          <h2>No problem loaded</h2>
          <p>Open Quiz Bank for a graded problem, or write your own code and press Run.</p>
          <button type="button" onClick={onOpenQuizBank}>Open Quiz Bank</button>
        </div>
      )}
    </aside>
  );
}

