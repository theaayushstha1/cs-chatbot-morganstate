const TITLE_STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "before", "could", "does",
  "from", "have", "help", "into", "like", "make", "need", "please",
  "should", "that", "there", "this", "what", "when", "where", "which",
  "with", "would", "your", "you", "can", "the", "and", "for", "how",
  "why", "are", "was", "were", "will", "want", "tell", "give", "show",
]);

function toTitleCase(text) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function getFirstUserText(messages = []) {
  return messages.find((message) => message.sender === "user")?.text || messages[0]?.text || "";
}

export function generateChatTitle(messages = [], mode = "regular") {
  const firstText = getFirstUserText(messages).replace(/```[\s\S]*?```/g, " code ");
  const normalized = firstText.toLowerCase();

  if (!firstText.trim()) {
    return mode === "coding_tutor" ? "Coding Tutor" : "New Chat";
  }

  if (mode === "coding_tutor") {
    if (/\b(rewrite|convert|translate|refactor)\b/.test(normalized)) return "Code Rewrite";
    if (/\b(generate|write|create|draft|starter|template|implement)\b/.test(normalized)) return "Code Generation";
    if (/\b(debug|error|traceback|exception|bug|fix)\b/.test(normalized)) return "Debug Help";
    if (/\b(review|feedback|improve)\b/.test(normalized) || /\b(def|function|class|const|let|var)\b/.test(firstText)) return "Code Review";
    if (/\b(quiz|practice quiz|questions)\b/.test(normalized)) return "Practice Quiz";
    if (/\b(interview|technical interview)\b/.test(normalized)) return "Interview Prep";
    if (/\b(leetcode|challenge|problem|algorithm)\b/.test(normalized)) return "Coding Practice";
  } else {
    if (/\b(gpa|grade|grades)\b/.test(normalized)) return "GPA Question";
    if (/\b(advisor|adviser|contact)\b/.test(normalized)) return "Advisor Help";
    if (/\b(internship|co-?op|career|job)\b/.test(normalized)) return "Career Help";
    if (/\b(course|prerequisite|sequence|schedule|class)\b/.test(normalized)) return "Course Planning";
    if (/\b(professor|faculty|research)\b/.test(normalized)) return "Faculty Info";
  }

  const topicWords = firstText
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2 && !TITLE_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 4);

  return topicWords.length ? toTitleCase(topicWords.join(" ")) : mode === "coding_tutor" ? "Coding Tutor" : "New Chat";
}

export function shouldAutoRenameSession(session, messages = []) {
  if (!session) return true;
  if (session.autoTitle === false) return false;
  const firstText = getFirstUserText(messages);
  const oldFirstMessageTitle = firstText ? firstText.slice(0, 30) : "";
  return !session.title
    || session.title === "New Chat"
    || session.title === "Chat"
    || session.title === "Coding Tutor"
    || session.title === oldFirstMessageTitle;
}
