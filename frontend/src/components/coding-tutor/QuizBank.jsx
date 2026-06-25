import QuizProblemCard from "./QuizProblemCard";
import StatTiles from "./StatTiles";

function titleCase(value = "") {
  return value ? value[0].toUpperCase() + value.slice(1).replace("_", " ") : "";
}

const TOPIC_INSIGHTS = {
  strings: {
    objectives: ["String normalization", "Character comparison", "Edge case handling"],
    mistakes: ["Forgetting lowercase conversion", "Ignoring spaces or punctuation", "Using extra loops when a two-pointer pass fits"],
  },
  arrays: {
    objectives: ["Index tracking", "Single-pass updates", "Boundary checks"],
    mistakes: ["Skipping the first or last item", "Mutating input unexpectedly", "Using nested loops without needing them"],
  },
  "two pointers": {
    objectives: ["Pointer movement rules", "Loop stopping conditions", "Pair comparison"],
    mistakes: ["Moving both pointers too early", "Missing equal-value cases", "Not testing short inputs"],
  },
  loops: {
    objectives: ["Loop invariants", "Accumulator updates", "Manual tracing"],
    mistakes: ["Off-by-one ranges", "Resetting counters inside loops", "Returning before the loop finishes"],
  },
  hashmaps: {
    objectives: ["Frequency counting", "Lookup-first reasoning", "Key normalization"],
    mistakes: ["Checking after overwriting values", "Using the wrong key shape", "Forgetting default counts"],
  },
};

function insightForTopic(topic = "") {
  const normalized = topic.toLowerCase();
  const key = Object.keys(TOPIC_INSIGHTS).find(name => normalized.includes(name));
  return TOPIC_INSIGHTS[key] || {
    objectives: [`Practice ${topic || "problem"} reasoning`, "Trace examples by hand", "Test edge cases before finalizing"],
    mistakes: ["Skipping the smallest input", "Not explaining the approach first", "Changing too much code at once"],
  };
}

export default function QuizBank({
  questions,
  allQuestions = [],
  progressByQuestion,
  listLoading,
  difficulty,
  selectedLanguage,
  languageOptions,
  progressSummary,
  selectedTopicPack,
  onDifficultyChange,
  onLanguageChange,
  onClearTopicPack,
  onSelectProblem,
}) {
  const personalizedQuestions = questions.filter((question) => {
    const progress = progressByQuestion[question.id];
    return progress?.status === "solved" || progress?.status === "in_progress" || (progress?.attempt_count || 0) > 0;
  });
  const insightQuestions = personalizedQuestions.length ? personalizedQuestions : questions.slice(0, 8);
  const topics = [...new Set(insightQuestions.map(question => question.topic).filter(Boolean))];
  const objectives = [...new Set(topics.flatMap(topic => insightForTopic(topic).objectives))].slice(0, 5);
  const mistakes = [...new Set(topics.flatMap(topic => insightForTopic(topic).mistakes))].slice(0, 5);
  const hasPersonalizedInsights = personalizedQuestions.length > 0;
  const visibleQuestions = selectedTopicPack
    ? (allQuestions.length ? allQuestions : questions).filter(question => (question.topic || "").toLowerCase() === selectedTopicPack.toLowerCase())
    : questions;

  return (
    <section className="coding-page-panel quiz-bank-page">
      <StatTiles progressSummary={progressSummary} />
      <div className="quiz-bank-layout">
        <div className="quiz-library">
          <div className="quiz-bank-header">
            <div>
              <span className="coding-kicker">Question Library</span>
              <h2>{selectedTopicPack ? `${titleCase(selectedTopicPack)} Pack` : `${titleCase(difficulty)} Practice`}</h2>
            </div>
            <div className="practice-controls compact">
              <label>Difficulty
                <select className="coding-select" value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label>Language
                <select className="coding-select" value={selectedLanguage} onChange={(event) => onLanguageChange(event.target.value)}>
                  {languageOptions.map(language => <option key={language} value={language}>{language}</option>)}
                </select>
              </label>
            </div>
          </div>
          {selectedTopicPack && (
            <div className="topic-filter-banner">
              <span>Showing {visibleQuestions.length} {titleCase(selectedTopicPack)} problems across all difficulties</span>
              <button type="button" onClick={onClearTopicPack}>Show all topics</button>
            </div>
          )}
          {listLoading ? <div className="daily-challenge-loading">Loading CS Navigator practice...</div> : (
            <div className="quiz-card-grid">
              {visibleQuestions.map(question => (
                <QuizProblemCard
                  key={question.id}
                  question={question}
                  progress={progressByQuestion[question.id]}
                  onSelect={onSelectProblem}
                />
              ))}
              {!visibleQuestions.length && (
                <div className="daily-challenge-loading">No questions found for this topic yet.</div>
              )}
            </div>
          )}
        </div>
        <aside className="quiz-insight-panel">
          <section>
            <h3>Topics Covered</h3>
            {topics.length ? topics.map(topic => <p key={topic}>Done {topic}</p>) : <p>Load or attempt a question to populate topics.</p>}
          </section>
          <section>
            <h3>Learning Objectives</h3>
            {hasPersonalizedInsights ? objectives.map(item => <p key={item}>{item}</p>) : <p>Attempt a question to personalize objectives from your progress.</p>}
          </section>
          <section>
            <h3>Common Mistakes</h3>
            {hasPersonalizedInsights ? mistakes.map(item => <p key={item}>{item}</p>) : <p>Solve or run a problem first, then this panel will show likely mistakes for your topics.</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
