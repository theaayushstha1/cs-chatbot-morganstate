import {
  FaBolt,
  FaBrain,
  FaBug,
  FaCheckCircle,
  FaCode,
  FaCompass,
  FaCubes,
  FaDatabase,
  FaFire,
  FaGraduationCap,
  FaJsSquare,
  FaKeyboard,
  FaLayerGroup,
  FaLightbulb,
  FaMedal,
  FaPython,
  FaRocket,
  FaSeedling,
  FaShieldAlt,
  FaStar,
  FaTasks,
  FaTrophy,
} from "react-icons/fa";
import "./ProgressBadges.css";

function countSolvedByTopic(questions = [], progressByQuestion = {}) {
  return questions.reduce((acc, question) => {
    const topic = question.topic || "practice";
    if (progressByQuestion[question.id]?.status === "solved") {
      acc[topic] = (acc[topic] || 0) + 1;
    }
    return acc;
  }, {});
}

function countSolvedByDifficulty(questions = [], progressByQuestion = {}) {
  return questions.reduce((acc, question) => {
    if (progressByQuestion[question.id]?.status === "solved") {
      const difficulty = (question.difficulty || "easy").toLowerCase();
      acc[difficulty] = (acc[difficulty] || 0) + 1;
    }
    return acc;
  }, {});
}

function countAttemptedByDifficulty(questions = [], progressByQuestion = {}) {
  return questions.reduce((acc, question) => {
    const progress = progressByQuestion[question.id];
    if (progress?.status === "solved" || progress?.status === "in_progress" || (progress?.attempt_count || 0) > 0) {
      const difficulty = (question.difficulty || "easy").toLowerCase();
      acc[difficulty] = (acc[difficulty] || 0) + 1;
    }
    return acc;
  }, {});
}

function hasSolvedLanguage(progressByLanguage = {}, language) {
  return Object.values(progressByLanguage).some(item => item?.[language]?.status === "solved");
}

function hasSolvedTopic(solvedByTopic = {}, topicPart = "") {
  return Object.entries(solvedByTopic).some(([topic, count]) => topic.toLowerCase().includes(topicPart) && count > 0);
}

export default function ProgressBadges({ questions = [], progressByQuestion = {}, progressByLanguage = {}, progressSummary = {} }) {
  const solvedByTopic = countSolvedByTopic(questions, progressByQuestion);
  const solvedByDifficulty = countSolvedByDifficulty(questions, progressByQuestion);
  const attemptedByDifficulty = countAttemptedByDifficulty(questions, progressByQuestion);
  const uniqueTopicsSolved = Object.keys(solvedByTopic).length;
  const solvedCount = progressSummary.solvedCount || 0;
  const attemptedCount = progressSummary.attemptedCount || 0;
  const totalAttempts = Object.values(progressByQuestion).reduce((sum, item) => sum + (item?.attempt_count || 0), 0);
  const solvedPython = hasSolvedLanguage(progressByLanguage, "python");
  const solvedJavaScript = hasSolvedLanguage(progressByLanguage, "javascript");
  const badges = [
    {
      id: "first-run",
      label: "First Run",
      detail: "Ran your first local test",
      icon: FaBolt,
      earned: attemptedCount >= 1,
      tone: "blue",
    },
    {
      id: "first-solve",
      label: "First Solve",
      detail: "Solved one practice problem",
      icon: FaMedal,
      earned: solvedCount >= 1,
      tone: "orange",
    },
    {
      id: "topic-sampler",
      label: "Topic Sampler",
      detail: "Solved problems in two topics",
      icon: FaStar,
      earned: uniqueTopicsSolved >= 2,
      tone: "purple",
    },
    {
      id: "python-path",
      label: "Python Path",
      detail: "Solved a Python problem",
      icon: FaPython,
      earned: solvedPython,
      tone: "green",
    },
    {
      id: "javascript-path",
      label: "JavaScript Path",
      detail: "Solved a JavaScript problem",
      icon: FaJsSquare,
      earned: solvedJavaScript,
      tone: "gold",
    },
    {
      id: "five-solved",
      label: "Five Solved",
      detail: "Solve 5 Problems",
      icon: FaTrophy,
      earned: solvedCount >= 5,
      tone: "red",
    },
    {
      id: "steady-streak",
      label: "Steady Streak",
      detail: "Reached a 3 day practice streak",
      icon: FaFire,
      earned: (progressSummary.displayStreak || 0) >= 3,
      tone: "pink",
    },
    {
      id: "halfway",
      label: "Halfway There",
      detail: "Completed 50% of this set",
      icon: FaCode,
      earned: (progressSummary.completionPercent || 0) >= 50,
      tone: "cyan",
    },
    {
      id: "ten-solved",
      label: "Ten Solved",
      detail: "Solve 10 problems",
      icon: FaRocket,
      earned: solvedCount >= 10,
      tone: "blue",
    },
    {
      id: "twenty-solved",
      label: "Twenty Solved",
      detail: "Solved 20 total problems",
      icon: FaGraduationCap,
      earned: solvedCount >= 20,
      tone: "purple",
    },
    {
      id: "completionist",
      label: "Completionist",
      detail: "Solved every visible problem",
      icon: FaCheckCircle,
      earned: (progressSummary.completionPercent || 0) >= 100,
      tone: "green",
    },
    {
      id: "three-runs",
      label: "Three Runs",
      detail: "Ran tests at least 3 times",
      icon: FaTasks,
      earned: totalAttempts >= 3,
      tone: "cyan",
    },
    {
      id: "ten-runs",
      label: "Test Driver",
      detail: "Ran tests at least 10 times",
      icon: FaKeyboard,
      earned: totalAttempts >= 10,
      tone: "orange",
    },
    {
      id: "easy-starter",
      label: "Easy Starter",
      detail: "Solved an Easy problem",
      icon: FaSeedling,
      earned: (solvedByDifficulty.easy || 0) >= 1,
      tone: "green",
    },
    {
      id: "medium-climber",
      label: "Medium Climber",
      detail: "Solved a Medium problem",
      icon: FaCompass,
      earned: (solvedByDifficulty.medium || 0) >= 1,
      tone: "gold",
    },
    {
      id: "hard-hunter",
      label: "Hard Hunter",
      detail: "Solved a Hard problem",
      icon: FaShieldAlt,
      earned: (solvedByDifficulty.hard || 0) >= 1,
      tone: "red",
    },
    {
      id: "strings-spark",
      label: "Strings Spark",
      detail: "Solved a strings problem",
      icon: FaLightbulb,
      earned: hasSolvedTopic(solvedByTopic, "string"),
      tone: "orange",
    },
    {
      id: "arrays-ace",
      label: "Arrays Ace",
      detail: "Solved an arrays problem",
      icon: FaLayerGroup,
      earned: hasSolvedTopic(solvedByTopic, "array"),
      tone: "blue",
    },
    {
      id: "sets-scout",
      label: "Sets Scout",
      detail: "Solved a sets problem",
      icon: FaDatabase,
      earned: hasSolvedTopic(solvedByTopic, "set"),
      tone: "cyan",
    },
    {
      id: "graph-guide",
      label: "Graph Guide",
      detail: "Solved a graph problem",
      icon: FaCubes,
      earned: hasSolvedTopic(solvedByTopic, "graph"),
      tone: "purple",
    },
    {
      id: "debug-persistence",
      label: "Debugger",
      detail: "Kept working through failed runs",
      icon: FaBug,
      earned: totalAttempts >= solvedCount + 3 && totalAttempts >= 3,
      tone: "pink",
    },
    {
      id: "polyglot",
      label: "Polyglot",
      detail: "Solve a problem in different languages",
      icon: FaBrain,
      earned: solvedPython && solvedJavaScript,
      tone: "gold",
    },
    {
      id: "warmup-master",
      label: "Warmup Master",
      detail: "Attempted 5 Easy problems",
      icon: FaFire,
      earned: (attemptedByDifficulty.easy || 0) >= 5,
      tone: "red",
    },
    {
      id: "interview-ready",
      label: "Interview Ready",
      detail: "Solve problems across three different topics",
      icon: FaTrophy,
      earned: solvedCount >= 8 && uniqueTopicsSolved >= 3,
      tone: "green",
    },
  ];

  return (
    <section className="progress-badge-section" aria-label="Coding progress badges">
      <div className="progress-badge-header">
        <div>
          <span className="coding-kicker">Badges</span>
          <h2>Practice milestones</h2>
        </div>
        <span>{badges.filter(badge => badge.earned).length}/{badges.length} earned</span>
      </div>
      <div className="progress-badge-grid">
        {badges.map((badge) => {
          const Icon = badge.icon;
          return (
            <article key={badge.id} className={`progress-badge-card ${badge.tone} ${badge.earned ? "earned" : "locked"}`}>
              <span className="progress-badge-icon" aria-hidden="true"><Icon /></span>
              <div>
                <h3>{badge.label}</h3>
                <p>{badge.detail}</p>
              </div>
              <strong>{badge.earned ? "Earned" : "Locked"}</strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}
