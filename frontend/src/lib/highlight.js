// Lightweight, dependency-free syntax highlighter for the practice editor.
// It tokenizes comments, strings, numbers, and language keywords, and returns
// HTML with <span class="tok-*"> wrappers. Designed to sit in a <pre> overlay
// behind a transparent <textarea> — so it does NOT need to be a perfect parser,
// just good-enough coloring that stays aligned with the text.

const KEYWORDS = {
  python: [
    "False", "None", "True", "and", "as", "assert", "async", "await", "break",
    "class", "continue", "def", "del", "elif", "else", "except", "finally",
    "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
    "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
    "self", "print", "range", "len", "int", "str", "list", "dict", "set",
  ],
  javascript: [
    "await", "break", "case", "catch", "class", "const", "continue", "debugger",
    "default", "delete", "do", "else", "export", "extends", "finally", "for",
    "function", "if", "import", "in", "instanceof", "let", "new", "of", "return",
    "static", "super", "switch", "this", "throw", "try", "typeof", "var", "void",
    "while", "yield", "true", "false", "null", "undefined", "console",
  ],
  java: [
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
    "class", "const", "continue", "default", "do", "double", "else", "enum",
    "extends", "final", "finally", "float", "for", "if", "implements", "import",
    "instanceof", "int", "interface", "long", "new", "package", "private",
    "protected", "public", "return", "short", "static", "super", "switch",
    "synchronized", "this", "throw", "throws", "try", "void", "while",
    "true", "false", "null", "String", "Object", "System",
  ],
  cpp: [
    "auto", "bool", "break", "case", "catch", "char", "class", "const",
    "continue", "default", "delete", "do", "double", "else", "enum", "explicit",
    "export", "extern", "false", "float", "for", "friend", "goto", "if",
    "inline", "int", "long", "namespace", "new", "operator", "private",
    "protected", "public", "return", "short", "signed", "sizeof", "static",
    "struct", "switch", "template", "this", "throw", "true", "try", "typedef",
    "typename", "union", "unsigned", "using", "virtual", "void", "while",
    "std", "string", "vector", "cout", "cin", "endl", "nullptr",
  ],
};

const LINE_COMMENT = {
  python: "#",
  javascript: "//",
  java: "//",
  cpp: "//",
};

function normalizeLang(language) {
  const l = String(language || "").toLowerCase();
  if (l.startsWith("py")) return "python";
  if (l.includes("javascript") || l === "js") return "javascript";
  if (l === "c++" || l === "cpp") return "cpp";
  if (l.startsWith("java")) return "java";
  return "python";
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Returns highlighted HTML for the given source + language. Trailing newline is
// preserved so the overlay's height matches the textarea exactly.
export function highlightCode(source, language) {
  const lang = normalizeLang(language);
  const keywords = new Set(KEYWORDS[lang] || []);
  const lineComment = LINE_COMMENT[lang] || "#";
  const code = source || "";

  let out = "";
  let i = 0;
  const n = code.length;

  const isWordChar = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < n) {
    const c = code[i];

    // Line comment
    if (code.startsWith(lineComment, i)) {
      let j = i;
      while (j < n && code[j] !== "\n") j++;
      out += `<span class="tok-comment">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Block comment /* ... */ (not Python)
    if (lang !== "python" && c === "/" && code[i + 1] === "*") {
      let j = i + 2;
      while (j < n && !(code[j] === "*" && code[j + 1] === "/")) j++;
      j = Math.min(j + 2, n);
      out += `<span class="tok-comment">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Strings: ", ', or ` — consume until the matching unescaped quote or newline
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n && code[j] !== quote && code[j] !== "\n") {
        if (code[j] === "\\") j++; // skip escaped char
        j++;
      }
      if (j < n && code[j] === quote) j++;
      out += `<span class="tok-string">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(code[i + 1] || ""))) {
      let j = i;
      while (j < n && /[0-9a-fA-FxX._]/.test(code[j])) j++;
      out += `<span class="tok-number">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Identifiers / keywords
    if (isWordChar(c)) {
      let j = i;
      while (j < n && isWordChar(code[j])) j++;
      const word = code.slice(i, j);
      // A function-call name (identifier immediately followed by "(").
      const nextNonSpace = code.slice(j).match(/^\s*\(/);
      if (keywords.has(word)) {
        out += `<span class="tok-keyword">${escapeHtml(word)}</span>`;
      } else if (nextNonSpace) {
        out += `<span class="tok-func">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
      i = j;
      continue;
    }

    // Brackets get their own class for subtle emphasis.
    if ("()[]{}".includes(c)) {
      out += `<span class="tok-bracket">${escapeHtml(c)}</span>`;
      i++;
      continue;
    }

    // Everything else (whitespace, operators, punctuation)
    out += escapeHtml(c);
    i++;
  }

  return out;
}
