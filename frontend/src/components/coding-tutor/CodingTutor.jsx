import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  FaBook,
  FaChartLine,
  FaChevronDown,
  FaEye,
  FaEyeSlash,
  FaHome,
  FaLaptopCode,
  FaUserGraduate,
} from "react-icons/fa";
import { toast } from "sonner";
import CodeWorkspace from "./CodeWorkspace";
import DailyChallengeCard from "./DailyChallengeCard";
import PersonalPanel from "./PersonalPanel";
import ProblemPanel from "./ProblemPanel";
import ProgressBadges from "./ProgressBadges";
import QuizBank from "./QuizBank";
import StatTiles from "./StatTiles";
import TopicPracticePacks from "./TopicPracticePacks";
import { listSnippets, saveSnippet, deleteSnippet, syncSnippetsFromServer, extractCodeFromFile, languageFromFilename } from "../../lib/snippets";
import "./CodingTutor.css";

const CODE_LANGUAGES = ["Python", "Java", "JavaScript", "C++"];
const PRACTICE_LANGUAGE_API = {
  Python: "python",
  Java: "java",
  JavaScript: "javascript",
  "C++": "cpp",
};
const PRACTICE_LANGUAGE_KEYS = ["python", "java", "javascript", "cpp"];
const PRACTICE_DIFFICULTIES = ["easy", "medium", "hard"];

// Home is NOT in this list — it has its own "Back to Home" button beside the nav.
const CODING_PAGES = [
  { id: "quiz", label: "Quiz Bank", icon: FaBook },
  { id: "interview", label: "Interview Prep", icon: FaUserGraduate },
  { id: "workspace", label: "Workspace", icon: FaLaptopCode },
  { id: "progress", label: "Progress", icon: FaChartLine },
];

const LANGUAGE_FORMATS = {
  Python: { file: "solution.py", style: "Function-focused" },
  Java: { file: "Solution.java", style: "Class method" },
  JavaScript: { file: "solution.js", style: "Function export" },
  "C++": { file: "solution.cpp", style: "Solution class" },
};

function progressKey(questionId, language) {
  return `coding_practice_progress:${questionId}:${language}`;
}

function readLocalProgress(questionId, language) {
  try {
    const raw = localStorage.getItem(progressKey(questionId, language));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("[coding-progress] local fallback read failed", error);
    return null;
  }
}

function writeLocalProgress(questionId, language, progress) {
  try {
    localStorage.setItem(progressKey(questionId, language), JSON.stringify(progress));
  } catch (error) {
    console.warn("[coding-progress] local fallback write failed", error);
  }
}

function clearLocalProgress(questionId, language) {
  try {
    localStorage.removeItem(progressKey(questionId, language));
  } catch (error) {
    console.warn("[coding-progress] local fallback clear failed", error);
  }
}

// ── Daily-challenge streak (gamification, #8) ─────────────────────────────
// We record the local date (YYYY-MM-DD) each day the student practices the daily
// challenge, then count back from today to get a real consecutive-day streak.
// Per-device only (localStorage) — no backend needed.
const DAILY_STREAK_KEY = "coding_daily_streak_days";

function localDateKey(date = new Date()) {
  // Local calendar date, not UTC, so "today" matches the student's clock.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readDailyStreakDays() {
  try {
    const raw = localStorage.getItem(DAILY_STREAK_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    console.warn("[coding-streak] read failed", error);
    return [];
  }
}

// Mark today as a daily-challenge completion. Returns the updated day list.
function recordDailyChallengeDay() {
  const today = localDateKey();
  const days = readDailyStreakDays();
  if (!days.includes(today)) days.push(today);
  // Keep the list bounded — a year of dates is plenty for a streak count.
  const trimmed = days.sort().slice(-370);
  try {
    localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.warn("[coding-streak] write failed", error);
  }
  return trimmed;
}

// Count consecutive days ending today (or yesterday — so an unfinished today
// doesn't break a streak until the day actually rolls over).
function computeDailyStreak(days = readDailyStreakDays()) {
  if (!days.length) return 0;
  const set = new Set(days);
  const cursor = new Date();
  // If today isn't done yet but yesterday was, the streak still stands.
  if (!set.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (set.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// True only when today's daily challenge is already recorded.
function isDailyDoneToday(days = readDailyStreakDays()) {
  return days.includes(localDateKey());
}

// ── Language personalization (#6) ─────────────────────────────────────────
// From the per-language progress map, find the language the student has touched
// most (solved counts double), and suggest a different language to try next.
const LANGUAGE_LABELS = { python: "Python", java: "Java", javascript: "JavaScript", cpp: "C++" };

function computeLanguageStats(progressByLanguage = {}) {
  const counts = { python: 0, java: 0, javascript: 0, cpp: 0 };
  Object.values(progressByLanguage).forEach((perLanguage) => {
    Object.entries(perLanguage || {}).forEach(([language, item]) => {
      if (!(language in counts) || !item) return;
      const solved = item.status === "solved" ? 2 : 0;
      const attempted = (item.attempt_count || 0) > 0 || item.status === "in_progress" ? 1 : 0;
      counts[language] += solved + attempted;
    });
  });
  const ranked = Object.entries(counts)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [topLanguage] = ranked[0];
  // Suggest the first language the student has used LEAST (or not at all).
  const suggestion = ["python", "javascript", "java", "cpp"].find(
    (language) => language !== topLanguage && (counts[language] || 0) < counts[topLanguage]
  ) || null;
  return {
    topLanguage,
    topLabel: LANGUAGE_LABELS[topLanguage],
    suggestionKey: suggestion,
    suggestionLabel: suggestion ? LANGUAGE_LABELS[suggestion] : null,
  };
}

function normalizeSnippet(text = "") {
  return String(text).split("\n").filter(line => line.trim()).slice(0, 5).join("\n");
}

function buildShapeSnippet(solution = {}) {
  const referenceLines = String(solution.reference_solution || "")
    .split("\n")
    .filter(line => line.trim() && !/^\s*(import|from\s+.+\s+import|def\s+|class\s+)/.test(line));
  if (referenceLines.length) return referenceLines.slice(0, 4).join("\n");
  const guided = solution.guided_steps || [];
  const codeLikeStep = guided.find(step => /[=()[\]{}:]|return|for |while |if /.test(String(step)));
  return normalizeSnippet(codeLikeStep || solution.starter_code || "");
}

function normalizeCodeForCompare(value = "") {
  return String(value).replace(/\r\n/g, "\n").trim();
}

function hasStarterCodeChanged(code = "", starterCode = "") {
  const normalizedCode = normalizeCodeForCompare(code);
  const normalizedStarter = normalizeCodeForCompare(starterCode);
  return Boolean(normalizedCode) && normalizedCode !== normalizedStarter;
}

function detectLanguageMismatch(code = "", languageKey = "python") {
  const source = String(code);
  const looksPython = /^\s*def\s+\w+\s*\(/m.test(source)
    || /^\s*from\s+\w+/m.test(source)
    || /^\s*import\s+\w+/m.test(source)
    || /\bNone\b|\bTrue\b|\bFalse\b/.test(source);
  const looksJavaScript = /\bfunction\s+\w+\s*\(/.test(source)
    || /=>/.test(source)
    || /^\s*export\s+/m.test(source)
    || /\bconst\s+\w+|\blet\s+\w+|\bvar\s+\w+/.test(source);

  if (languageKey === "python" && looksJavaScript) {
    return "This code looks like JavaScript, but Python is selected. Switch the language dropdown to JavaScript or load the Python starter before running.";
  }
  if (languageKey === "javascript" && looksPython) {
    return "This code looks like Python, but JavaScript is selected. Switch the language dropdown to Python or load the JavaScript starter before running.";
  }
  return "";
}

function aggregateQuestionProgress(languageProgress = {}) {
  const items = Object.values(languageProgress).filter(Boolean);
  if (!items.length) return null;
  const solved = items.find(item => item.status === "solved");
  const inProgress = items.find(item => item.status === "in_progress" || (item.attempt_count || 0) > 0);
  const base = solved || inProgress || items[0];
  return {
    ...base,
    status: solved ? "solved" : inProgress ? "in_progress" : "not_started",
    attempt_count: items.reduce((sum, item) => sum + (item.attempt_count || 0), 0),
    solved_languages: items.filter(item => item.status === "solved").map(item => item.language),
  };
}

function aggregateProgressMap(progressByLanguage = {}) {
  return Object.fromEntries(
    Object.entries(progressByLanguage)
      .map(([questionId, languageProgress]) => [questionId, aggregateQuestionProgress(languageProgress)])
      .filter(([, progress]) => progress)
  );
}

function estimateChallengeTime(difficulty = "Easy") {
  const normalized = String(difficulty).toLowerCase();
  if (normalized === "hard") return "25 min";
  if (normalized === "medium") return "15 min";
  return "5 min";
}

function summarizeRunForTutor(output = {}) {
  if (!output || output.status === "ready") return "";
  const tests = Array.isArray(output.tests) ? output.tests : [];
  const failed = tests.filter(test => !test.passed);
  const summary = [
    `Runner status: ${output.status || "unknown"}`,
    typeof output.passed === "number" && typeof output.total === "number" ? `Tests: ${output.passed}/${output.total} passed` : "",
    typeof output.duration_ms === "number" ? `Duration: ${Math.round(output.duration_ms)} ms` : "",
    output.stdout ? `stdout:\n${output.stdout}` : "",
    output.stderr ? `stderr:\n${output.stderr}` : "",
    failed.length ? `Failed tests:\n${failed.slice(0, 3).map(test => [
      `- ${test.name || "Unnamed test"}`,
      `  Input: ${JSON.stringify(test.args)}`,
      `  Expected: ${JSON.stringify(test.expected)}`,
      `  Actual: ${JSON.stringify(test.actual)}`,
      test.error ? `  Error: ${test.error}` : "",
    ].filter(Boolean).join("\n")).join("\n")}` : "",
  ].filter(Boolean);
  return summary.join("\n");
}

function buildQualityChecklist(language, output = {}) {
  if (output.status !== "passed") return [];
  return [
    "All local tests passed.",
    `Review ${language} naming, indentation, and readability before submitting.`,
    "Check one empty/minimum input and one larger input by hand.",
    "Confirm the time and space complexity match your intended approach.",
  ];
}

function topicVideoUrl(topic = "") {
  const normalized = topic.toLowerCase();
  if (normalized.includes("two pointers") || normalized.includes("palindrome")) return "https://www.youtube.com/watch?v=On03HWe2tZM";
  if (normalized.includes("hash") || normalized.includes("set")) return "https://www.youtube.com/watch?v=shs0KM3wKv8";
  if (normalized.includes("recursion") || normalized.includes("tree")) return "https://www.youtube.com/watch?v=mz6tAJMVmfM";
  if (normalized.includes("dynamic")) return "https://www.youtube.com/watch?v=oBt53YbR9Kk";
  if (normalized.includes("graph") || normalized.includes("bfs") || normalized.includes("dfs")) return "https://www.youtube.com/watch?v=pcKY4hjDrxk";
  if (normalized.includes("binary")) return "https://www.youtube.com/watch?v=s4DPM8ct1pI";
  if (normalized.includes("stack")) return "https://www.youtube.com/watch?v=Pr6T-3yB9RM";
  return "https://www.youtube.com/watch?v=MK-NZ4hN7rs";
}

function buildHintSteps(problem, solution, attempts) {
  if (!problem) return [];
  const topic = problem.topic || "the main pattern";
  const givenHints = problem.hints || [];
  const guided = solution?.guided_steps || [];
  const shapeSnippet = buildShapeSnippet(solution || {});
  return [
    {
      level: 1,
      title: "Strategy",
      body: givenHints[0] || `Describe the ${topic} idea in plain English first. Name what you compare, count, or store before writing the loop.`,
      locked: false,
    },
    {
      level: 2,
      title: "Key Condition",
      body: givenHints[1] || guided[0] || "Find the exact condition that changes your answer. Test that condition with the smallest input first.",
      locked: false,
    },
    {
      level: 3,
      title: "Code Shape",
      body: shapeSnippet
        ? `Use this only as a shape check:\n\n\`\`\`\n${shapeSnippet}\n\`\`\``
        : givenHints[2] || guided[1] || "Write just the loop or branch that updates your answer, then stop and test it manually.",
      locked: false,
    },
    {
      level: 4,
      title: "Near Solution",
      body: guided[2] || givenHints[2] || "Connect the helper logic to the return value, then test an empty, one-item, and typical input.",
      locked: attempts < 2,
    },
  ];
}

// Three distinct dashboard cards:
//  1. Resume   — the most recent IN-PROGRESS problem (or a prompt to start one)
//  2. Up Next  — the recommended next problem to try
//  3. My Snippets — the personal workspace (accented so it stands out)
function RecentActivity({ questions, progressByQuestion, nextUpQuestion, onResume, onSelect, onOpenSnippets }) {
  // Most recent in-progress problem (not solved).
  const resumeItem = Object.entries(progressByQuestion || {})
    .map(([id, p]) => ({ id, progress: p, question: questions.find(q => q.id === id) }))
    .filter(item => item.question && item.progress
      && item.progress.status !== "solved"
      && (item.progress.attempt_count > 0 || item.progress.status === "in_progress"))
    .sort((a, b) => new Date(b.progress.updated_at || 0) - new Date(a.progress.updated_at || 0))[0] || null;

  // Don't recommend the same problem the user is already resuming.
  const upNext = nextUpQuestion && (!resumeItem || nextUpQuestion.id !== resumeItem.question.id)
    ? nextUpQuestion
    : null;

  return (
    <section className="coding-recent-activity coding-dashboard-section" aria-label="Your coding shortcuts">
      <span className="coding-kicker">Jump back in</span>
      <div className="coding-recent-grid">
        {/* 1. Resume */}
        <article className="coding-recent-card">
          <div className="coding-recent-card-top">
            <span className="coding-recent-label">Resume</span>
            {resumeItem ? (
              <>
                <strong className="coding-recent-title">{resumeItem.question.title}</strong>
                <span className="coding-recent-category">
                  <span className={`recent-diff ${String(resumeItem.question.difficulty || "easy").toLowerCase()}`}>{resumeItem.question.difficulty || "Easy"}</span>
                  {resumeItem.question.topic && <span className="recent-topic">{resumeItem.question.topic}</span>}
                </span>
              </>
            ) : (
              <span className="coding-recent-empty">No problem in progress yet.</span>
            )}
          </div>
          <div className="coding-recent-card-bottom">
            {resumeItem ? (
              <>
                <button type="button" className="coding-recent-resume-btn" onClick={() => onResume(resumeItem.question)}>Resume</button>
                <span className="recent-status in-progress">In progress</span>
              </>
            ) : (
              <button type="button" className="coding-recent-resume-btn" onClick={() => upNext && onSelect(upNext)} disabled={!upNext}>Start one</button>
            )}
          </div>
        </article>

        {/* 2. Up Next */}
        <article className="coding-recent-card coding-upnext-card">
          <div className="coding-recent-card-top">
            <span className="coding-recent-label">Up Next</span>
            {upNext ? (
              <>
                <strong className="coding-recent-title">{upNext.title}</strong>
                <span className="coding-recent-category">
                  <span className={`recent-diff ${String(upNext.difficulty || "easy").toLowerCase()}`}>{upNext.difficulty || "Easy"}</span>
                  {upNext.topic && <span className="recent-topic">{upNext.topic}</span>}
                </span>
              </>
            ) : (
              <span className="coding-recent-empty">You&apos;ve started everything — nice!</span>
            )}
          </div>
          <div className="coding-recent-card-bottom">
            <button type="button" className="coding-recent-resume-btn upnext-start-btn" onClick={() => upNext && onSelect(upNext)} disabled={!upNext}>Start</button>
          </div>
        </article>

        {/* 3. My Snippets — accented personal workspace card */}
        <article className="coding-recent-card coding-snippets-card">
          <div className="coding-recent-card-top">
            <span className="coding-recent-label">Personal</span>
            <strong className="coding-recent-title">My Snippets</strong>
            <span className="coding-recent-category">
              <span className="recent-topic">Write, run &amp; save your own code.</span>
            </span>
          </div>
          <div className="coding-recent-card-bottom">
            <button type="button" className="coding-recent-resume-btn snippets-open-btn" onClick={onOpenSnippets}>
              Open Workspace
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

export default function CodingTutor({
  apiBase,
  codeRenderer,
  messages = [],
  onContextChange,
  onActivePageChange,
  onStartFreshChat,
  onSendToChat,
}) {
  const location = useLocation();
  const [activePage, setActivePage] = useState("dashboard");
  const [lastNonWorkspacePage, setLastNonWorkspacePage] = useState("dashboard");
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState("Editor");
  const [dailyChallenge, setDailyChallenge] = useState(null);
  const [dailyChallengeLoading, setDailyChallengeLoading] = useState(false);
  // Recorded local dates (YYYY-MM-DD) the student practiced the daily challenge.
  // Drives the real "day streak" tile instead of a derived guess.
  const [dailyStreakDays, setDailyStreakDays] = useState(() => readDailyStreakDays());
  const [difficulty, setDifficulty] = useState("easy");
  const [selectedTopicPack, setSelectedTopicPack] = useState("");
  const [practiceLanguage, setPracticeLanguage] = useState("Python");
  const [selectedLanguage, setSelectedLanguage] = useState("Python");
  const [questions, setQuestions] = useState([]);
  const [allQuestions, setAllQuestions] = useState([]);
  const [progressByQuestion, setProgressByQuestion] = useState({});
  const [progressByLanguage, setProgressByLanguage] = useState({});
  const [activeProblem, setActiveProblem] = useState(null);
  const [activeSolution, setActiveSolution] = useState(null);
  const [problemLoading, setProblemLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  // True once the first practice-progress fetch has settled. Until then we don't
  // know if a signed-in user is actually new, so we must NOT show the new-user
  // hero — otherwise it flashes on every tab switch before progress loads.
  const [progressLoaded, setProgressLoaded] = useState(false);
  // Personal "My Snippets" workspace: a fresh, non-graded space separate from the
  // Quiz Bank. snippets are stored per-device in localStorage.
  const [snippets, setSnippets] = useState(() => listSnippets());
  const [activeSnippetId, setActiveSnippetId] = useState(null);
  const personalFileInputRef = useRef(null);
  // The code as it was last saved/loaded, used to detect unsaved changes in the
  // personal workspace so we can warn before the student loses work.
  const [personalSavedCode, setPersonalSavedCode] = useState("");
  // A pending navigation action held while the "unsaved changes" prompt is shown.
  const [unsavedPrompt, setUnsavedPrompt] = useState(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [testOutput, setTestOutput] = useState({ status: "ready", message: "" });
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  // Lets the Stop button abort an in-flight run. The backend's hard CPU/time
  // limit also kills a truly stuck process, so this frees the UI immediately.
  const runAbortRef = useRef(null);

  const stopRun = useCallback(() => {
    if (runAbortRef.current) {
      runAbortRef.current.abort();
      runAbortRef.current = null;
    }
    setIsRunning(false);
    setTestOutput({ status: "error", free_run: true, tests: [], stdout: "", stderr: "Run stopped.", message: "You stopped the run." });
  }, []);
  const [revealedHints, setRevealedHints] = useState(0);
  const [tutorMode, setTutorMode] = useState("Guided Tutor");
  const [quizPdfStartIndex, setQuizPdfStartIndex] = useState(null);
  const [workspaceSnapshots, setWorkspaceSnapshots] = useState({});
  const questionCacheRef = useRef({});
  const solutionCacheRef = useRef({});
  const selectedLanguageKey = PRACTICE_LANGUAGE_API[selectedLanguage] || "python";
  const activeLanguageProgress = activeProblem ? progressByLanguage[activeProblem.id]?.[selectedLanguageKey] : null;
  const activeProgress = activeLanguageProgress || (activeProblem ? progressByQuestion[activeProblem.id] : null);
  const attempts = activeProgress?.attempt_count || 0;
  const hintSteps = useMemo(() => buildHintSteps(activeProblem, activeSolution, attempts), [activeProblem, activeSolution, attempts]);
  const latestFeedback = messages.slice().reverse().find((msg) => msg.sender === "bot" && msg.text)?.text || "";
  const suggestedCodeBlock = latestFeedback.match(/```(?:\w+)?\n([\s\S]*?)```/)?.[1]?.trim() || "";
  const latestQuizResponse = quizPdfStartIndex !== null
    ? messages.slice(quizPdfStartIndex).slice().reverse().find((msg) => msg.sender === "bot" && msg.text)?.text || ""
    : "";
  const languageFormat = LANGUAGE_FORMATS[selectedLanguage] || LANGUAGE_FORMATS.Python;
  const activeQuestionIndex = activeProblem?.source !== "leetcode"
    ? questions.findIndex(question => question.id === activeProblem?.id)
    : -1;
  const isQuizBankProblem = Boolean(activeProblem && activeQuestionIndex >= 0 && activeProblem.source !== "personal");
  const isPersonalMode = activeProblem?.source === "personal";
  // Next/Back cycle only through unsolved problems. Solved problems can still be
  // opened directly from Quiz Bank, but are skipped here to focus on what is left.
  const findAdjacentUnsolvedIndex = useCallback((fromIndex, direction) => {
    for (let index = fromIndex + direction; index >= 0 && index < questions.length; index += direction) {
      if (progressByQuestion[questions[index].id]?.status !== "solved") return index;
    }
    return -1;
  }, [questions, progressByQuestion]);
  const canGoPrevious = activeQuestionIndex >= 0 && findAdjacentUnsolvedIndex(activeQuestionIndex, -1) >= 0;
  const canGoNext = activeQuestionIndex >= 0 && findAdjacentUnsolvedIndex(activeQuestionIndex, 1) >= 0;
  const activeQuestionProgress = activeProblem ? progressByQuestion[activeProblem.id] : null;
  const activeSolvedLanguages = activeQuestionProgress?.solved_languages || [];
  const isActiveProblemSolved = isQuizBankProblem
    && (activeQuestionProgress?.status === "solved" || activeLanguageProgress?.status === "solved");

  const progressQuestions = useMemo(
    () => (allQuestions.length ? allQuestions : questions),
    [allQuestions, questions]
  );
  const progressItems = useMemo(
    () => progressQuestions.map(question => ({ question, progress: progressByQuestion[question.id] })),
    [progressQuestions, progressByQuestion]
  );
  const solvedCount = progressItems.filter(item => item.progress?.status === "solved").length;
  const attemptedCount = progressItems.filter(item => (item.progress?.attempt_count || 0) > 0 || item.progress?.status === "solved").length;
  const totalAttempts = progressItems.reduce((sum, item) => sum + (item.progress?.attempt_count || 0), 0);
  const completionPercent = progressQuestions.length ? Math.round((solvedCount / progressQuestions.length) * 100) : 0;
  // Real consecutive-day streak from daily-challenge completions.
  const displayStreak = useMemo(() => computeDailyStreak(dailyStreakDays), [dailyStreakDays]);
  const dailyDoneToday = useMemo(() => isDailyDoneToday(dailyStreakDays), [dailyStreakDays]);
  const languageStats = useMemo(() => computeLanguageStats(progressByLanguage), [progressByLanguage]);
  const progressSummary = { solvedCount, attemptedCount, totalAttempts, completionPercent, displayStreak };
  // Brand-new user: nothing solved, nothing attempted, no saved snippets, and no
  // daily streak. We show a warm "Start here" hero instead of empty stat tiles.
  // Gate on progressLoaded so the hero never flashes for a returning user before
  // their saved progress comes back from the server on a tab switch / mount.
  const isNewUser = progressLoaded
    && solvedCount === 0
    && attemptedCount === 0
    && snippets.length === 0
    && dailyStreakDays.length === 0;

  // "Up Next" recommendation: the first question the student hasn't started yet
  // (not solved, no attempts). Falls back to the first non-solved if every
  // question has at least been touched. Easy problems come first when ordered.
  const nextUpQuestion = useMemo(() => {
    const ordered = [...progressQuestions].sort((a, b) => {
      const rank = { easy: 0, medium: 1, hard: 2 };
      return (rank[String(a.difficulty || "easy").toLowerCase()] ?? 1)
        - (rank[String(b.difficulty || "easy").toLowerCase()] ?? 1);
    });
    const untouched = ordered.find(q => {
      const p = progressByQuestion[q.id];
      return !p || (p.status !== "solved" && (p.attempt_count || 0) === 0 && p.status !== "in_progress");
    });
    return untouched || ordered.find(q => progressByQuestion[q.id]?.status !== "solved") || null;
  }, [progressQuestions, progressByQuestion]);
  const topicPacks = useMemo(() => {
    const grouped = new Map();
    allQuestions.forEach((question) => {
      const topic = question.topic || "practice";
      const existing = grouped.get(topic) || { topic, count: 0, solved: 0, attempted: 0, videoUrl: topicVideoUrl(topic) };
      const progress = progressByQuestion[question.id];
      existing.count += 1;
      if (progress?.status === "solved") existing.solved += 1;
      if ((progress?.attempt_count || 0) > 0 || progress?.status === "solved") existing.attempted += 1;
      grouped.set(topic, existing);
    });
    return [...grouped.values()].sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)).slice(0, 8);
  }, [allQuestions, progressByQuestion]);
  const activeSnapshotKey = activeProblem ? `${activeProblem.id}:${selectedLanguageKey}` : "personal";
  const activeSnapshots = useMemo(
    () => workspaceSnapshots[activeSnapshotKey] || {},
    [activeSnapshotKey, workspaceSnapshots]
  );
  const runnerSummary = useMemo(() => summarizeRunForTutor(testOutput), [testOutput]);
  const applyAiCode = useCallback(() => {
    if (!suggestedCodeBlock) return;
    setCode(suggestedCodeBlock);
    setWorkspaceSnapshots(prev => ({
      ...prev,
      [activeSnapshotKey]: {
        ...(prev[activeSnapshotKey] || {}),
        aiRewrite: suggestedCodeBlock,
        current: suggestedCodeBlock,
      },
    }));
    toast.success("AI code applied to workspace");
  }, [activeSnapshotKey, suggestedCodeBlock]);

  const explainFailedTests = useCallback(() => {
    const summary = summarizeRunForTutor(testOutput);
    if (!summary) {
      toast.info("Run your code first so the tutor can see the test output.");
      return;
    }
    setTutorMode("Debugging");
    onSendToChat?.([
      "Explain these failed tests in small chunks. Point out the likely code issue first, then give one focused next step.",
      "",
      summary,
    ].join("\n"), true);
  }, [onSendToChat, testOutput]);

  const explainError = useCallback(() => {
    const out = testOutput || {};
    const errorText = [out.stderr, out.message].filter(Boolean).join("\n").trim();
    if (!errorText) {
      toast.info("Run your code first so the tutor can see the error.");
      return;
    }
    setTutorMode("Debugging");
    onSendToChat?.([
      "My code produced this error when I ran it. In plain English: what does this error mean, what is the most likely cause, and what is one focused fix to try? Do not rewrite my whole program.",
      "",
      `Language: ${selectedLanguage}`,
      "Error output:",
      "```",
      errorText.slice(0, 1500),
      "```",
    ].join("\n"), true);
  }, [onSendToChat, testOutput, selectedLanguage]);

  const requestReview = useCallback(() => {
    if (!code || !code.trim()) {
      toast.info("Write some code first so the tutor has something to review.");
      return;
    }
    setTutorMode("Reviewing");
    onSendToChat?.("Review my current code for correctness and style. Point out the single biggest issue first, then any smaller ones. Don't rewrite the whole thing — guide me.", true);
  }, [onSendToChat, code]);

  useEffect(() => {
    // Pull the account's saved snippets from the server once on load and merge
    // them into the local cache, so My Snippets follows the user across devices.
    // No-op (keeps local cache) when signed out or offline.
    let cancelled = false;
    syncSnippetsFromServer().then(() => {
      if (!cancelled) setSnippets(listSnippets());
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // The chat should use the student's workspace code whenever there IS code (or
    // a loaded problem) — not only while the Workspace tab is the active page. This
    // keeps the floating chat grounded in the current attempt from any sub-page.
    const hasWorkspaceCode = Boolean(code && code.trim());
    const useWorkspace = hasWorkspaceCode || Boolean(activeProblem);
    onContextChange?.({
      activeProblem: useWorkspace ? activeProblem : null,
      selectedLanguage,
      code: useWorkspace ? code : "",
      attempts: useWorkspace ? attempts : 0,
      workspaceTab: activePage === "workspace" && workspaceVisible ? workspaceTab : activePage,
      note: useWorkspace ? note : "",
      tutorMode,
      runnerSummary: useWorkspace ? runnerSummary : "",
      workspaceSnapshots: useWorkspace ? activeSnapshots : {},
      suggestedCodeBlock,
      onApplyAICode: suggestedCodeBlock ? applyAiCode : null,
    });
  }, [activePage, activeProblem, attempts, code, note, onContextChange, selectedLanguage, suggestedCodeBlock, tutorMode, workspaceTab, workspaceVisible, runnerSummary, activeSnapshots, applyAiCode]);

  useEffect(() => {
    onActivePageChange?.(activePage);
  }, [activePage, onActivePageChange]);

  useEffect(() => {
    const requestedPage = new URLSearchParams(location.search).get("page");
    if (!requestedPage) return;

    const allowedPages = new Set(["dashboard", "quiz", "interview", "workspace", "progress"]);
    if (!allowedPages.has(requestedPage)) return;

    if (requestedPage !== "workspace") setLastNonWorkspacePage(requestedPage);
    if (requestedPage === "workspace") setWorkspaceVisible(true);
    setActivePage(requestedPage);
  }, [location.search]);

  useEffect(() => {
    if (!activeProblem || !code) return;
    setWorkspaceSnapshots(prev => ({
      ...prev,
      [activeSnapshotKey]: {
        ...(prev[activeSnapshotKey] || {}),
        current: code,
      },
    }));
  }, [activeProblem, activeSnapshotKey, code]);

  useEffect(() => {
    let cancelled = false;
    const fetchDailyChallenge = async () => {
      setDailyChallengeLoading(true);
      try {
        const response = await fetch(`${apiBase}/api/coding/daily-challenge`);
        const data = await response.json();
        if (!cancelled) setDailyChallenge(data);
      } catch (error) {
        console.error("[coding-daily] failed", error);
        if (!cancelled) {
          setDailyChallenge({
            available: false,
            title: "Daily practice",
            difficulty: "Easy",
            message: "Daily challenge is unavailable right now.",
            url: "https://leetcode.com/problemset/",
          });
        }
      } finally {
        if (!cancelled) setDailyChallengeLoading(false);
      }
    };
    fetchDailyChallenge();
    return () => { cancelled = true; };
  }, [apiBase]);

  useEffect(() => {
    let cancelled = false;
    const fetchPractice = async () => {
      setListLoading(true);
      try {
        const token = localStorage.getItem("token");
        const progressRequests = token
          ? PRACTICE_LANGUAGE_KEYS.map(language => fetch(`${apiBase}/api/coding/practice/progress?language=${language}`, {
              headers: { Authorization: `Bearer ${token}` },
            }).then(response => ({ language, response })))
          : [];
        const cachedQuestions = questionCacheRef.current[difficulty];
        const allQuestionRequests = PRACTICE_DIFFICULTIES.map(level => (
          questionCacheRef.current[level]
            ? Promise.resolve({ level, questions: questionCacheRef.current[level] })
            : fetch(`${apiBase}/api/coding/practice/questions?difficulty=${level}`)
                .then(async response => {
                  if (!response.ok) throw new Error(`questions ${level} ${response.status}`);
                  const data = await response.json();
                  questionCacheRef.current[level] = data.questions || [];
                  return { level, questions: data.questions || [] };
                })
        ));
        const [questionResponse, allQuestionResults, ...progressResults] = await Promise.all([
          cachedQuestions
            ? Promise.resolve(null)
            : fetch(`${apiBase}/api/coding/practice/questions?difficulty=${difficulty}`),
          Promise.all(allQuestionRequests),
          ...progressRequests,
        ]);
        let nextQuestions = cachedQuestions || [];
        if (!cachedQuestions) {
          if (!questionResponse.ok) throw new Error(`questions ${questionResponse.status}`);
          const questionData = await questionResponse.json();
          nextQuestions = questionData.questions || [];
          questionCacheRef.current[difficulty] = nextQuestions;
        }
        const nextAllQuestions = allQuestionResults.flatMap(result => result.questions || []);
        const nextLanguageProgress = {};
        for (const result of progressResults) {
          if (result?.response?.ok) {
            const progressData = await result.response.json();
            (progressData.items || []).forEach((item) => {
              nextLanguageProgress[item.question_id] = {
                ...(nextLanguageProgress[item.question_id] || {}),
                [result.language]: item,
              };
            });
          } else if (result?.response) {
            console.warn("[coding-progress] list request failed", result.language, result.response.status, await result.response.text());
          }
        }
        nextAllQuestions.forEach((question) => {
          PRACTICE_LANGUAGE_KEYS.forEach((language) => {
            const local = readLocalProgress(question.id, language);
            if (local && !nextLanguageProgress[question.id]?.[language]) {
              nextLanguageProgress[question.id] = {
                ...(nextLanguageProgress[question.id] || {}),
                [language]: local,
              };
            }
          });
        });
        if (!cancelled) {
          setQuestions(nextQuestions);
          setAllQuestions(nextAllQuestions);
          setProgressByLanguage(nextLanguageProgress);
          setProgressByQuestion(aggregateProgressMap(nextLanguageProgress));
        }
      } catch (error) {
        console.error("[coding-practice] load failed", error);
        if (!cancelled) {
          setQuestions([]);
          setAllQuestions([]);
          setProgressByQuestion({});
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
          setProgressLoaded(true);
        }
      }
    };
    fetchPractice();
    return () => { cancelled = true; };
  }, [apiBase, difficulty]);

  const saveProgress = async (questionId, updates = {}, language = selectedLanguageKey) => {
    if (!questionId) return null;
    const current = progressByLanguage[questionId]?.[language] || readLocalProgress(questionId, language) || {
      question_id: questionId,
      language,
      status: "not_started",
      code: "",
      attempt_count: 0,
    };
    const optimistic = {
      ...current,
      ...updates,
      language,
      status: updates.status || current.status || "not_started",
      code: updates.code ?? current.code ?? "",
      attempt_count: updates.increment_attempt ? (current.attempt_count || 0) + 1 : (current.attempt_count || 0),
      updated_at: new Date().toISOString(),
    };
    writeLocalProgress(questionId, language, optimistic);
    setProgressByLanguage(prev => {
      const next = {
        ...prev,
        [questionId]: {
          ...(prev[questionId] || {}),
          [language]: optimistic,
        },
      };
      setProgressByQuestion(aggregateProgressMap(next));
      return next;
    });

    const token = localStorage.getItem("token");
    if (!token) return optimistic;
    try {
      const response = await fetch(`${apiBase}/api/coding/practice/questions/${questionId}/progress`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language, ...updates }),
      });
      if (!response.ok) {
        console.warn("[coding-progress] backend save failed", response.status, await response.text());
        return optimistic;
      }
      const saved = await response.json();
      writeLocalProgress(questionId, language, saved);
      setProgressByLanguage(prev => {
        const next = {
          ...prev,
          [questionId]: {
            ...(prev[questionId] || {}),
            [language]: saved,
          },
        };
        setProgressByQuestion(aggregateProgressMap(next));
        return next;
      });
      return saved;
    } catch (error) {
      console.warn("[coding-progress] backend save unavailable; using local fallback", error);
      return optimistic;
    }
  };

  const loadQuestionSolution = async (problem, languageName, existingCode = null) => {
    const language = PRACTICE_LANGUAGE_API[languageName] || "python";
    const solutionCacheKey = `${problem.id}:${language}`;
    let solution = solutionCacheRef.current[solutionCacheKey];
    if (!solution) {
      const response = await fetch(`${apiBase}/api/coding/practice/questions/${problem.id}/solution?language=${language}`);
      if (!response.ok) throw new Error(`solution ${response.status}`);
      solution = await response.json();
      solutionCacheRef.current[solutionCacheKey] = solution;
    }
    let progress = progressByLanguage[problem.id]?.[language] || readLocalProgress(problem.id, language);
    const isStarterOnlyProgress = progress?.status === "in_progress"
      && (progress?.attempt_count || 0) === 0
      && !hasStarterCodeChanged(progress?.code || "", solution?.starter_code || "");
    if (isStarterOnlyProgress) {
      clearLocalProgress(problem.id, language);
      progress = null;
      setProgressByLanguage(prev => {
        const next = { ...prev, [problem.id]: { ...(prev[problem.id] || {}) } };
        delete next[problem.id][language];
        if (!Object.keys(next[problem.id]).length) delete next[problem.id];
        setProgressByQuestion(aggregateProgressMap(next));
        return next;
      });
    }
    setActiveProblem(problem);
    setActiveSolution(solution);
    setSelectedLanguage(languageName);
    setPracticeLanguage(languageName);
    const nextCode = existingCode ?? progress?.code ?? solution?.starter_code ?? "";
    setCode(nextCode);
    setWorkspaceSnapshots(prev => ({
      ...prev,
      [`${problem.id}:${language}`]: {
        ...(prev[`${problem.id}:${language}`] || {}),
        starter: solution?.starter_code || "",
        current: nextCode,
      },
    }));
    setNote(`Practice problem: ${problem.title}`);
    const runnerLabel = `${languageName} local tests can run from the terminal below the editor.`;
    setTestOutput({ status: "ready", message: `${problem.title} loaded in ${languageName}. ${runnerLabel}` });
    setTerminalOpen(false);
    setActivePage("workspace");
    setWorkspaceVisible(true);
    setWorkspaceTab("Editor");
    setRevealedHints(0);
  };

  // Persist the CURRENT quiz problem as in-progress if its code changed from the
  // starter, so editing a problem (even without running it) makes it show up under
  // "Continue where you left off". Skips personal/leetcode/solved.
  const savePendingProblemProgress = async () => {
    if (!activeProblem || !isQuizBankProblem) return;
    if (activeLanguageProgress?.status === "solved") return;
    if (!hasStarterCodeChanged(code, activeSolution?.starter_code)) return;
    try {
      await saveProgress(activeProblem.id, { status: "in_progress", code }, selectedLanguageKey);
    } catch (error) {
      console.warn("[coding-practice] save pending progress failed", error);
    }
  };

  const selectQuestion = async (problem) => {
    setProblemLoading(true);
    try {
      // Save edits to the problem we're leaving before loading the new one.
      await savePendingProblemProgress();
      await loadQuestionSolution(problem, practiceLanguage);
    } catch (error) {
      console.error("[coding-practice] select failed", error);
      toast.error("Could not load that practice problem");
    } finally {
      setProblemLoading(false);
    }
  };

  const changeSelectedLanguage = async (languageName) => {
    if (!activeProblem || activeProblem.source === "leetcode" || activeProblem.source === "personal") {
      setSelectedLanguage(languageName);
      setPracticeLanguage(languageName);
      return;
    }
    setProblemLoading(true);
    try {
      if (hasStarterCodeChanged(code, activeSolution?.starter_code)) {
        await saveProgress(activeProblem.id, { status: activeLanguageProgress?.status === "solved" ? "solved" : "in_progress", code }, selectedLanguageKey);
      }
      await loadQuestionSolution(activeProblem, languageName);
    } catch (error) {
      console.error("[coding-practice] language switch failed", error);
      toast.error("Could not switch language for this problem");
    } finally {
      setProblemLoading(false);
    }
  };

  const startDailyChallenge = (withHints = false) => {
    // Practicing the daily challenge counts toward the day streak (gamification).
    setDailyStreakDays(recordDailyChallengeDay());
    const title = dailyChallenge?.title || "Daily coding challenge";
    const prompt = dailyChallenge?.available
      ? `Solve today's LeetCode daily challenge: ${title}. Open the LeetCode link for the full prompt, then use this workspace for notes and code.`
      : "Daily challenge is unavailable. Use this workspace for a short practice prompt or open Quiz Bank.";
    setActiveProblem({
      id: `daily-${new Date().toISOString().slice(0, 10)}`,
      title,
      difficulty: dailyChallenge?.difficulty || "Easy",
      topic: dailyChallenge?.tags?.[0] || "Daily Challenge",
      prompt,
      examples: [],
      constraints: dailyChallenge?.url ? [`Source: ${dailyChallenge.url}`] : [],
      source: "leetcode",
    });
    setActiveSolution(null);
    setSelectedLanguage(practiceLanguage);
    setCode("");
    setNote(withHints ? `Daily challenge: ${title}. I want hints first.` : `Daily challenge: ${title}`);
    setTestOutput({ status: "ready", message: "Daily challenge loaded. LeetCode daily problems are source-linked practice only; local auto-grading is for CS Navigator quiz-bank questions." });
    setTerminalOpen(false);
    setTutorMode(withHints ? "Hinting" : "Guided Tutor");
    setActivePage("workspace");
    setWorkspaceVisible(true);
    setWorkspaceTab("Editor");
    setRevealedHints(0);
  };

  // Open the fresh PERSONAL workspace (My Snippets) — a synthetic personal
  // "problem" so the existing workspace renders the editor/terminal, but the left
  // panel shows the snippets list instead of quiz guidance. Reachable ONLY from
  // the home button, not the nav.
  const openPersonalWorkspace = (snippet = null) => {
    setActiveSolution(null);
    setActiveProblem({ id: "personal", source: "personal", title: snippet?.name || "My Snippet" });
    setActiveSnippetId(snippet?.id || null);
    setCode(snippet?.code || "");
    setPersonalSavedCode(snippet?.code || ""); // baseline for unsaved-change detection
    if (snippet?.language) {
      setSelectedLanguage(snippet.language);
      setPracticeLanguage(snippet.language);
    }
    setNote("");
    setRevealedHints(0);
    setWorkspaceTab("Editor");
    setTerminalOpen(false);
    setTestOutput({ status: "ready", message: "" });
    setWorkspaceVisible(true);
    setActivePage("workspace");
    setSnippets(listSnippets());
  };

  // True when in the personal workspace and the code differs from what was last
  // saved/loaded (and there's actually something to lose).
  const hasUnsavedPersonalChanges = isPersonalMode
    && code.trim() !== ""
    && normalizeCodeForCompare(code) !== normalizeCodeForCompare(personalSavedCode);

  // Run `proceed` immediately if there's nothing unsaved; otherwise stash it and
  // show the "unsaved changes" prompt (Save / Discard / Cancel).
  const guardPersonalNav = (proceed) => {
    if (hasUnsavedPersonalChanges) {
      setUnsavedPrompt(() => proceed);
      return;
    }
    proceed();
  };

  const newSnippet = () => openPersonalWorkspace(null);

  // Language personalization (#6): open the recommended next problem in the
  // suggested language, so "try a Java problem?" lands the student in Java.
  const tryLanguageOnNext = async (languageName) => {
    const target = nextUpQuestion || progressQuestions.find(q => progressByQuestion[q.id]?.status !== "solved");
    if (!target) {
      toast.info("No practice problem available to open right now.");
      return;
    }
    setPracticeLanguage(languageName);
    setProblemLoading(true);
    try {
      await loadQuestionSolution(target, languageName);
    } catch (error) {
      console.error("[coding-practice] try-language failed", error);
      toast.error("Could not open that problem.");
    } finally {
      setProblemLoading(false);
    }
  };

  // Home "My Snippets" card: reopen the most recently saved snippet (so the user
  // resumes what they were working on); if none saved, open a clean workspace.
  const openMySnippets = () => {
    const saved = listSnippets();
    openPersonalWorkspace(saved.length ? saved[0] : null);
  };

  // Returns the saved record, or null if the user cancelled the name prompt.
  const handleSaveSnippet = () => {
    if (!code.trim()) {
      toast.info("Write some code before saving.");
      return null;
    }
    const suggested = activeProblem?.title && activeProblem.title !== "My Snippet"
      ? activeProblem.title
      : "My snippet";
    const name = window.prompt("Name this snippet:", suggested);
    if (name === null) return null; // cancelled
    const record = saveSnippet({ id: activeSnippetId, name, language: selectedLanguage, code });
    setActiveSnippetId(record.id);
    setActiveProblem(prev => (prev ? { ...prev, title: record.name } : prev));
    setPersonalSavedCode(code); // baseline updated — no longer "unsaved"
    setSnippets(listSnippets());
    toast.success("Snippet saved.");
    return record;
  };

  const handleDeleteSnippet = (id) => {
    if (!window.confirm("Delete this snippet? This cannot be undone.")) return;
    deleteSnippet(id);
    setSnippets(listSnippets());
    if (id === activeSnippetId) {
      setActiveSnippetId(null);
    }
    toast.success("Snippet deleted.");
  };

  const handleUploadSnippetFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    const lower = file.name.toLowerCase();
    const allowed = [".py", ".ipynb", ".js", ".jsx", ".ts", ".tsx", ".java", ".cpp", ".cc", ".c", ".h", ".hpp", ".txt"];
    if (!allowed.some(ext => lower.endsWith(ext))) {
      toast.error("Unsupported file. Upload a .py, .ipynb, or other code/text file.");
      return;
    }
    if (file.size > 512 * 1024) {
      toast.error("That file is too large (max 512 KB).");
      return;
    }
    try {
      const text = await file.text();
      const extracted = extractCodeFromFile(file.name, text);
      setCode(extracted);
      const lang = languageFromFilename(file.name);
      if (lang) {
        setSelectedLanguage(lang);
        setPracticeLanguage(lang);
      }
      setActiveSnippetId(null);
      setActiveProblem(prev => (prev ? { ...prev, title: file.name } : prev));
      toast.success(`Loaded ${file.name} into the editor.`);
    } catch (error) {
      console.error("[snippets] upload failed", error);
      toast.error("Could not read that file.");
    }
  };

  const sendDashboardPrompt = (text, options = {}) => {
    if (options.quizPdf) setQuizPdfStartIndex(messages.length);
    if (onStartFreshChat) {
      onStartFreshChat({
        type: "send",
        title: options.title || "Coding Tutor",
        text,
      });
      return;
    }
    onSendToChat?.(text, true);
  };

  const openTopicPack = (topic) => {
    setSelectedTopicPack(topic);
    setActivePage("quiz");
    setLastNonWorkspacePage("quiz");
  };

  const findTopicVideo = (topic) => {
    window.open(topicVideoUrl(topic), "_blank", "noopener,noreferrer");
  };

  const saveLatestQuizAsPdf = () => {
    if (!latestQuizResponse) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      toast.error("Allow popups to save the generated quiz as a PDF.");
      return;
    }
    const escapedContent = latestQuizResponse
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>CS Navigator Generated Quiz</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 40px; line-height: 1.5; }
            h1 { color: #1d4ed8; margin-bottom: 4px; }
            small { color: #6b7280; }
            pre { white-space: pre-wrap; font-family: inherit; margin-top: 28px; }
          </style>
        </head>
        <body>
          <h1>CS Navigator Generated Quiz</h1>
          <small>${new Date().toLocaleString()}</small>
          <pre>${escapedContent}</pre>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const navigatePracticeProblem = async (direction) => {
    if (activeQuestionIndex < 0) return;
    const targetIndex = findAdjacentUnsolvedIndex(activeQuestionIndex, direction);
    if (targetIndex < 0) return;
    const nextQuestion = questions[targetIndex];
    if (!nextQuestion) return;
    setProblemLoading(true);
    try {
      if (activeProblem && activeProblem.source !== "leetcode") {
        if (hasStarterCodeChanged(code, activeSolution?.starter_code)) {
          await saveProgress(activeProblem.id, { status: activeLanguageProgress?.status === "solved" ? "solved" : "in_progress", code }, selectedLanguageKey);
        }
      }
      await loadQuestionSolution(nextQuestion, practiceLanguage);
    } catch (error) {
      console.error("[coding-practice] navigation failed", error);
      toast.error("Could not load the next practice problem");
    } finally {
      setProblemLoading(false);
    }
  };

  const runFreeform = async () => {
    if (!["python", "javascript", "java", "cpp"].includes(selectedLanguageKey)) {
      setTestOutput({ status: "error", message: "Free run supports Python, JavaScript, Java, and C++." });
      setTerminalOpen(true);
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      setTestOutput({ status: "error", message: "Please sign in before running code." });
      setTerminalOpen(true);
      return;
    }
    setIsRunning(true);
    setTerminalOpen(true);
    setTestOutput({ status: "running", message: `Running your ${selectedLanguage} code...` });
    const controller = new AbortController();
    runAbortRef.current = controller;
    try {
      const response = await fetch(`${apiBase}/api/coding/practice/freerun`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language: selectedLanguageKey, code }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `runner ${response.status}`);
      setTestOutput(data);
      setWorkspaceSnapshots(prev => ({
        ...prev,
        [activeSnapshotKey]: {
          ...(prev[activeSnapshotKey] || {}),
          current: code,
          lastRun: summarizeRunForTutor(data),
        },
      }));
    } catch (error) {
      if (error.name === "AbortError") return; // stopRun already set the message
      console.error("[coding-freerun] failed", error);
      setTestOutput({ status: "error", free_run: true, message: "The local runner could not complete.", stderr: String(error.message || error) });
    } finally {
      if (runAbortRef.current === controller) runAbortRef.current = null;
      setIsRunning(false);
    }
  };

  const runAttempt = async () => {
    if (!activeProblem || activeProblem.source === "personal") {
      await runFreeform();
      return;
    }
    if (activeProblem.source === "leetcode") {
      setTestOutput({ status: "error", message: "Daily LeetCode challenges are not auto-graded in CS Navigator yet. Open the Source link for official tests." });
      setTerminalOpen(true);
      return;
    }
    if (!isQuizBankProblem) {
      await runFreeform();
      return;
    }
    if (!["python", "javascript"].includes(selectedLanguageKey)) {
      setTestOutput({ status: "error", message: "The V2.1 runner supports Python and JavaScript. Switch to one of those languages, edit your solution, and retry." });
      setTerminalOpen(true);
      return;
    }
    if (!hasStarterCodeChanged(code, activeSolution?.starter_code)) {
      setTestOutput({ status: "ready", message: "Make a change to the starter code before running tests. Loading a starter does not count as progress." });
      setTerminalOpen(true);
      return;
    }
    const mismatchMessage = detectLanguageMismatch(code, selectedLanguageKey);
    if (mismatchMessage) {
      setTestOutput({ status: "error", message: mismatchMessage });
      setTerminalOpen(true);
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      setTestOutput({ status: "error", message: "Please sign in before running local practice tests." });
      setTerminalOpen(true);
      return;
    }

    setIsRunning(true);
    setTerminalOpen(true);
    setTestOutput({ status: "running", message: `Running local ${selectedLanguage} tests...` });
    const controller = new AbortController();
    runAbortRef.current = controller;
    try {
      const response = await fetch(`${apiBase}/api/coding/practice/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question_id: activeProblem.id, language: selectedLanguageKey, code }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || `runner ${response.status}`);
      const enrichedData = {
        ...data,
        quality_checklist: buildQualityChecklist(selectedLanguage, data),
      };
      setTestOutput(enrichedData);
      setWorkspaceSnapshots(prev => ({
        ...prev,
        [activeSnapshotKey]: {
          ...(prev[activeSnapshotKey] || {}),
          current: code,
          lastRun: summarizeRunForTutor(enrichedData),
          ...(enrichedData.status === "passed" ? { lastPassing: code } : {}),
        },
      }));
      if (data.progress) {
        writeLocalProgress(activeProblem.id, selectedLanguageKey, data.progress);
        setProgressByLanguage(prev => {
          const next = {
            ...prev,
            [activeProblem.id]: {
              ...(prev[activeProblem.id] || {}),
              [selectedLanguageKey]: data.progress,
            },
          };
          setProgressByQuestion(aggregateProgressMap(next));
          return next;
        });
      } else if (data.status === "passed") {
        const localProgress = {
          question_id: activeProblem.id,
          language: selectedLanguageKey,
          status: "solved",
          code,
          attempt_count: (activeProgress?.attempt_count || 0) + 1,
          updated_at: new Date().toISOString(),
          solved_at: new Date().toISOString(),
        };
        writeLocalProgress(activeProblem.id, selectedLanguageKey, localProgress);
        setProgressByLanguage(prev => {
          const next = {
            ...prev,
            [activeProblem.id]: {
              ...(prev[activeProblem.id] || {}),
              [selectedLanguageKey]: localProgress,
            },
          };
          setProgressByQuestion(aggregateProgressMap(next));
          return next;
        });
      }
      if (data.status === "passed") {
        toast.success("All local tests passed. Problem marked solved.");
      }
    } catch (error) {
      if (error.name === "AbortError") return; // stopRun already set the message
      console.error("[coding-runner] failed", error);
      setTestOutput({ status: "error", message: "The local runner could not complete.", stderr: String(error.message || error) });
    } finally {
      if (runAbortRef.current === controller) runAbortRef.current = null;
      setIsRunning(false);
    }
  };

  const markSolved = async () => {
    if (!activeProblem || !isQuizBankProblem) return;
    await saveProgress(activeProblem.id, { status: "solved", code });
    setTerminalOpen(true);
    setTestOutput({ status: "passed", message: "Marked solved manually. Your current code was saved with this problem.", passed: 0, total: 0, tests: [] });
    toast.success("Practice problem marked solved");
  };

  const clearWorkspace = async () => {
    // Save the current quiz problem first so reopening it later restores the
    // latest code, then unload it and leave a blank scratchpad.
    if (activeProblem && activeProblem.source !== "leetcode" && activeProblem.source !== "personal") {
      if (hasStarterCodeChanged(code, activeSolution?.starter_code)) {
        try {
          await saveProgress(
            activeProblem.id,
            { status: activeLanguageProgress?.status === "solved" ? "solved" : "in_progress", code },
            selectedLanguageKey,
          );
        } catch (error) {
          console.warn("[coding-practice] save before clear failed", error);
        }
      }
    }
    setActiveProblem(null);
    setActiveSolution(null);
    setCode("");
    setNote("");
    setRevealedHints(0);
    setWorkspaceTab("Editor");
    setTerminalOpen(false);
    setTestOutput({ status: "ready", message: "Workspace cleared. Write your own Python or JavaScript and press Run to test it (not graded)." });
    toast.success("Workspace cleared. Reopen a problem from Quiz Bank to restore it.");
  };

  const showNextHint = () => {
    const unlocked = hintSteps.filter(hint => !hint.locked).length;
    if (revealedHints >= unlocked && hintSteps.some(hint => hint.locked)) {
      toast.info("Final hint unlocks after 2 Run attempts.");
      return;
    }
    setRevealedHints(prev => Math.min(prev + 1, unlocked));
    setWorkspaceTab("Hints");
  };

  const showAllHints = () => {
    const unlocked = hintSteps.filter(hint => !hint.locked).length;
    if (unlocked < hintSteps.length) toast.info("Final hint unlocks after 2 Run attempts.");
    setRevealedHints(unlocked);
    setWorkspaceTab("Hints");
  };

  const openPage = (pageId) => {
    // Guard: leaving the personal workspace with unsaved code prompts to save first.
    guardPersonalNav(() => {
      // Record edits to a quiz problem before navigating away (so it appears under
      // "Continue where you left off" even if it was never run).
      savePendingProblemProgress();
      if (pageId !== "workspace") setLastNonWorkspacePage(pageId);
      if (pageId === "workspace") {
        setWorkspaceVisible(true);
        // The nav "Workspace" tab is the CODING (Quiz Bank) workspace. If we were in
        // the personal "My Snippets" workspace, leave it so this shows the quiz
        // empty state with "Open Quiz Bank" — the personal workspace is reached only
        // from the Home button.
        if (activeProblem?.source === "personal") {
          setActiveProblem(null);
          setActiveSolution(null);
          setActiveSnippetId(null);
          setCode("");
          setPersonalSavedCode("");
          setTestOutput({ status: "ready", message: "" });
          setTerminalOpen(false);
        }
      }
      setActivePage(pageId);
    });
  };

  const toggleWorkspace = () => {
    if (activePage === "workspace" && workspaceVisible) {
      setWorkspaceVisible(false);
      setActivePage(lastNonWorkspacePage || "dashboard");
      return;
    }
    setWorkspaceVisible(true);
    setActivePage("workspace");
  };

  const renderDashboard = () => (
    <section className="coding-dashboard">
      {isNewUser ? (
        <section className="coding-welcome-hero coding-dashboard-section" aria-label="Get started">
          <span className="coding-kicker">Welcome to the Coding Tutor</span>
          <h2 className="coding-welcome-title">Let&apos;s solve your first problem.</h2>
          <p className="coding-welcome-sub">
            Pick a short, beginner-friendly problem and the tutor will guide you with
            hints — no full solutions, just nudges. You can run your code right here.
          </p>
          <div className="coding-welcome-actions">
            <button
              type="button"
              className="coding-welcome-primary"
              onClick={() => nextUpQuestion && selectQuestion(nextUpQuestion)}
              disabled={!nextUpQuestion}
            >
              {nextUpQuestion ? `Start: ${nextUpQuestion.title}` : "Loading a starter problem…"}
            </button>
            <button type="button" className="coding-welcome-secondary" onClick={() => openPage("quiz")}>
              Browse the Quiz Bank
            </button>
            <button type="button" className="coding-welcome-secondary" onClick={openMySnippets}>
              Open a blank workspace
            </button>
          </div>
          <p className="coding-welcome-hint">
            Tip: try today&apos;s challenge to start a daily streak 🔥
          </p>
        </section>
      ) : (
        <StatTiles progressSummary={progressSummary} />
      )}
      <RecentActivity
        questions={allQuestions.length ? allQuestions : questions}
        progressByQuestion={progressByQuestion}
        nextUpQuestion={nextUpQuestion}
        onResume={selectQuestion}
        onSelect={selectQuestion}
        onOpenSnippets={openMySnippets}
      />
      {languageStats?.suggestionLabel && (
        <section className="coding-language-personalization coding-dashboard-section" aria-label="Language suggestion">
          <span className="coding-kicker">Personalized for you</span>
          <p className="coding-language-line">
            You&apos;re strongest in <strong>{languageStats.topLabel}</strong>.
            Ready to stretch? Try the next problem in <strong>{languageStats.suggestionLabel}</strong>.
          </p>
          <button
            type="button"
            className="coding-language-try-btn"
            onClick={() => tryLanguageOnNext(languageStats.suggestionLabel)}
          >
            Try a {languageStats.suggestionLabel} problem
          </button>
        </section>
      )}
      <section className="coding-blurb-section">
        <div className="coding-dashboard-prompts" aria-label="Coding tutor prompt suggestions">
          <button type="button" className="coding-prompt-card blue" onClick={() => sendDashboardPrompt("Can you generate a practice quiz for me on arrays, strings, and loops?", { quizPdf: true, title: "Practice quiz" })}>
            Can you generate a practice quiz for me?
          </button>
          <button type="button" className="coding-prompt-card gold" onClick={() => sendDashboardPrompt("Help me prepare for a technical interview problem with hints first.", { title: "Interview prep" })}>
            Help me prepare for a technical interview problem.
          </button>
        </div>
        {latestQuizResponse && (
          <button type="button" className="save-quiz-pdf-btn" onClick={saveLatestQuizAsPdf}>
            Save generated quiz as PDF
          </button>
        )}
      </section>
      <section className="daily-feature-card dashboard-daily coding-dashboard-section">
        <span className="coding-kicker">Today&apos;s Challenge</span>
        <h2>{dailyChallenge?.title || "Daily practice"}</h2>
        <div className="daily-meta-row">
          <span className={`daily-difficulty ${String(dailyChallenge?.difficulty || "Easy").toLowerCase()}`}>{dailyChallenge?.difficulty || "Easy"}</span>
          <span className="daily-eta-pill">Estimated Time: {estimateChallengeTime(dailyChallenge?.difficulty)}</span>
          {dailyDoneToday
            ? <span className="daily-streak-pill done">Done today ✓ · {displayStreak}-day streak 🔥</span>
            : displayStreak > 0 && <span className="daily-streak-pill">{displayStreak}-day streak 🔥 · keep it going</span>}
        </div>
        {dailyChallenge?.available === false && <p>{dailyChallenge.message}</p>}
        <div className="daily-actions">
          <button type="button" className="daily-practice-btn" onClick={() => startDailyChallenge(true)}>
            Practice
          </button>
          {dailyChallenge?.url && (
            <a href={dailyChallenge.url} target="_blank" rel="noopener noreferrer" className="daily-link">
              Source
            </a>
          )}
        </div>
      </section>
    </section>
  );

  const renderWorkspace = () => (
    <section className={`coding-workbench ${terminalOpen ? "terminal-open" : "terminal-closed"} ${isPersonalMode ? "personal-workspace" : ""}`}>
      <div className="coding-workbench-main">
        {isPersonalMode ? (
          <PersonalPanel
            snippets={snippets}
            activeSnippetId={activeSnippetId}
            onNewSnippet={() => guardPersonalNav(() => newSnippet())}
            onOpenSnippet={(snippet) => guardPersonalNav(() => openPersonalWorkspace(snippet))}
            onDeleteSnippet={handleDeleteSnippet}
          />
        ) : (
          <ProblemPanel
            problem={activeProblem}
            solution={activeSolution}
            attempts={attempts}
            problemLoading={problemLoading}
            isSolved={isActiveProblemSolved}
            solvedLanguages={activeSolvedLanguages}
            showProblemNavigation={isQuizBankProblem}
            canGoPrevious={canGoPrevious}
            canGoNext={canGoNext}
            onPreviousProblem={() => navigatePracticeProblem(-1)}
            onNextProblem={() => navigatePracticeProblem(1)}
            onShowHint={showNextHint}
            onShowAllHints={showAllHints}
            onOpenQuizBank={() => openPage("quiz")}
          />
        )}
        <CodeWorkspace
          activeProblem={activeProblem}
          code={code}
          selectedLanguage={selectedLanguage}
          languageOptions={CODE_LANGUAGES}
          languageFormat={languageFormat}
          workspaceTab={workspaceTab}
          hints={hintSteps}
          revealedHints={revealedHints}
          isRunning={isRunning}
          latestFeedback={latestFeedback}
          suggestedCodeBlock={suggestedCodeBlock}
          terminalOpen={terminalOpen}
          testOutput={testOutput}
          canMarkSolved={isQuizBankProblem}
          isPersonalMode={isPersonalMode}
          onCodeChange={setCode}
          onLanguageChange={changeSelectedLanguage}
          onTabChange={setWorkspaceTab}
          onToggleTerminal={() => setTerminalOpen(prev => !prev)}
          onCloseTerminal={() => setTerminalOpen(false)}
          onRun={runAttempt}
          onMarkSolved={markSolved}
          onCopyCode={() => navigator.clipboard.writeText(code)}
          onApplyAICode={applyAiCode}
          onClearWorkspace={clearWorkspace}
          onShowHint={showNextHint}
          onShowAllHints={showAllHints}
          onExplainFailedTests={explainFailedTests}
          onExplainError={explainError}
          onStopRun={stopRun}
          onRequestReview={requestReview}
          onSaveSnippet={handleSaveSnippet}
          onUploadFile={() => personalFileInputRef.current?.click()}
          codeRenderer={codeRenderer}
        />
      </div>
      <input
        ref={personalFileInputRef}
        type="file"
        accept=".py,.ipynb,.js,.jsx,.ts,.tsx,.java,.cpp,.cc,.c,.h,.hpp,.txt"
        style={{ display: "none" }}
        onChange={handleUploadSnippetFile}
      />
    </section>
  );

  const renderProgress = () => (
    <section className="coding-page-panel progress-page">
      <StatTiles progressSummary={progressSummary} />
      <ProgressBadges
        questions={allQuestions.length ? allQuestions : questions}
        progressByQuestion={progressByQuestion}
        progressByLanguage={progressByLanguage}
        progressSummary={progressSummary}
      />
    </section>
  );

  const renderInterviewPrep = () => (
    <section className="coding-page-panel interview-prep-page">
      <div className="interview-prep-hero">
        <span className="coding-kicker">Interview Prep</span>
        <h2>Practice by topic</h2>
        <p>
          Pick a topic pack to filter Quiz Bank across Easy, Medium, and Hard problems.
          Use the video link when you want a quick refresher before practicing.
        </p>
      </div>
      <TopicPracticePacks
        packs={topicPacks}
        selectedTopic={selectedTopicPack}
        onSelectTopic={openTopicPack}
        onFindVideo={findTopicVideo}
      />
    </section>
  );

  const renderPage = () => {
    if (activePage === "dashboard") return renderDashboard();
    if (activePage === "daily") {
      return (
        <DailyChallengeCard
          dailyChallenge={dailyChallenge}
          loading={dailyChallengeLoading}
          onStartChallenge={() => startDailyChallenge(false)}
          onPracticeWithHints={() => startDailyChallenge(true)}
        />
      );
    }
    if (activePage === "quiz") {
      return (
        <QuizBank
          questions={questions}
          allQuestions={allQuestions}
          progressByQuestion={progressByQuestion}
          listLoading={listLoading}
          difficulty={difficulty}
          selectedLanguage={practiceLanguage}
          languageOptions={CODE_LANGUAGES}
          progressSummary={progressSummary}
          selectedTopicPack={selectedTopicPack}
          onDifficultyChange={setDifficulty}
          onLanguageChange={setPracticeLanguage}
          onClearTopicPack={() => setSelectedTopicPack("")}
          onSelectProblem={selectQuestion}
        />
      );
    }
    if (activePage === "interview") return renderInterviewPrep();
    if (activePage === "progress") return renderProgress();
    if (activePage === "workspace" && !workspaceVisible) {
      return (
        <section className="coding-page-panel workspace-hidden-panel">
          <span className="coding-kicker">Workspace Hidden</span>
          <h2>Your active workspace is saved.</h2>
          <p>Show it again from the mini sidebar when you want to keep coding.</p>
          <button type="button" className="daily-practice-btn" onClick={toggleWorkspace}>Show Workspace</button>
        </section>
      );
    }
    return renderWorkspace();
  };

  return (
    <div className={`coding-app ${activePage === "workspace" ? "coding-workspace-active" : ""} ${terminalOpen ? "terminal-open" : "terminal-closed"}`}>
      <div className="coding-nav-row">
        <button
          type="button"
          className={`coding-back-home-btn ${activePage === "dashboard" ? "active" : ""}`}
          onClick={() => { openPage("dashboard"); setMobileNavOpen(false); }}
          title="Back to Home"
        >
          <FaHome aria-hidden="true" />
          <span className="coding-back-home-label">Back to Home</span>
        </button>
        <nav className={`coding-section-nav ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Coding tutor navigation">
        {/* Single dropdown toggle on every screen. The bar shows the active tab's
            icon + name (name hidden on mobile via CSS). Clicking opens the menu;
            the chevron rotates; picking a section navigates and closes. */}
        {(() => {
          const current = CODING_PAGES.find(p => p.id === activePage);
          const CurrentIcon = current?.icon;
          // On Home (not in the section list) show a neutral "Sections" label.
          return (
            <button
              type="button"
              className="coding-nav-mobile-toggle"
              onClick={() => setMobileNavOpen(prev => !prev)}
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {CurrentIcon && (
                <span className="coding-nav-icon coding-nav-current-icon" aria-hidden="true"><CurrentIcon /></span>
              )}
              <span className="coding-nav-mobile-current">{current?.label || "Sections"}</span>
              <FaChevronDown className="coding-nav-chevron" aria-hidden="true" />
            </button>
          );
        })()}

        {CODING_PAGES.map(page => {
          const Icon = page.icon;
          return (
          <button
            key={page.id}
            type="button"
            className={activePage === page.id ? "active" : ""}
            onClick={() => { openPage(page.id); setMobileNavOpen(false); }}
            title={page.label}
          >
            <span className="coding-nav-icon" aria-hidden="true"><Icon /></span>
            <span className="coding-nav-label">{page.label}</span>
          </button>
          );
        })}
        <button type="button" className="coding-nav-workspace-toggle" onClick={() => { toggleWorkspace(); setMobileNavOpen(false); }} title={workspaceVisible ? "Hide Workspace" : "Show Workspace"}>
          <span className="coding-nav-icon" aria-hidden="true">{workspaceVisible ? <FaEyeSlash /> : <FaEye />}</span>
          <span className="coding-nav-label">{activePage === "workspace" && workspaceVisible ? "Hide Workspace" : "Show Workspace"}</span>
        </button>
        </nav>
      </div>
      <div className="coding-app-main">
        <div className="coding-app-content">{renderPage()}</div>
      </div>

      {unsavedPrompt && (
        <div className="unsaved-overlay" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
          <div className="unsaved-modal">
            <h3 id="unsaved-title">Unsaved changes</h3>
            <p>You have unsaved code in this workspace. Save it as a snippet before leaving, or discard your changes.</p>
            <div className="unsaved-actions">
              <button
                type="button"
                className="unsaved-btn unsaved-save"
                onClick={() => {
                  const proceed = unsavedPrompt;
                  const saved = handleSaveSnippet();
                  if (saved) { setUnsavedPrompt(null); proceed(); }
                  // if the name prompt was cancelled, keep the dialog open
                }}
              >
                Save
              </button>
              <button
                type="button"
                className="unsaved-btn unsaved-discard"
                onClick={() => { const proceed = unsavedPrompt; setUnsavedPrompt(null); proceed(); }}
              >
                Discard
              </button>
              <button
                type="button"
                className="unsaved-btn unsaved-cancel"
                onClick={() => setUnsavedPrompt(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
