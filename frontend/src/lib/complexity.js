// Lightweight, dependency-free Big-O *estimate* from code structure. This is a
// heuristic for practice feedback — not a proof. It looks at loop-nesting depth,
// recursion, sort calls, and binary-search/divide-and-conquer hints, and returns
// a coarse time-complexity label plus a short rationale.
//
// Deliberately conservative and clearly labeled "Estimated" in the UI.

function stripCommentsAndStrings(code, lang) {
  let out = code;
  // Strings (single, double, backtick) — replace with a placeholder.
  out = out.replace(/"(?:\\.|[^"\\])*"/g, '""');
  out = out.replace(/'(?:\\.|[^'\\])*'/g, "''");
  out = out.replace(/`(?:\\.|[^`\\])*`/g, "``");
  if (lang === "python") {
    out = out.replace(/#.*$/gm, "");
  } else {
    out = out.replace(/\/\/.*$/gm, "");
    out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  }
  return out;
}

// Compute the maximum nesting depth of loop constructs by walking line indent
// (Python) or brace tracking (C-like). We approximate: count how deep loops nest.
function maxLoopNesting(code, lang) {
  const loopRe = lang === "python"
    ? /^\s*(for|while)\b/
    : /\b(for|while)\b\s*\(/;
  const lines = code.split("\n");
  let maxDepth = 0;

  if (lang === "python") {
    // Track indentation stack of loop headers.
    const stack = []; // indent widths of active loops
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const indent = raw.match(/^\s*/)[0].length;
      // Pop loops we've dedented out of.
      while (stack.length && indent <= stack[stack.length - 1]) stack.pop();
      if (loopRe.test(raw)) {
        stack.push(indent);
        maxDepth = Math.max(maxDepth, stack.length);
      }
    }
    return maxDepth;
  }

  // C-like: walk char by char. When a loop keyword is seen, the NEXT "{" opens
  // its body — mark that brace level as a loop block. A stack of loop-block brace
  // levels gives the current loop nesting; its max over the walk is the answer.
  let depth = 0;            // current brace depth
  let pendingLoop = false;  // a loop keyword was seen; its "{" hasn't opened yet
  const loopLevels = [];    // brace depths that correspond to loop bodies
  const flat = code;
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === "{") {
      depth++;
      if (pendingLoop) {
        loopLevels.push(depth);
        pendingLoop = false;
        maxDepth = Math.max(maxDepth, loopLevels.length);
      }
    } else if (ch === "}") {
      if (loopLevels.length && loopLevels[loopLevels.length - 1] === depth) loopLevels.pop();
      depth = Math.max(0, depth - 1);
    } else if (/[A-Za-z_]/.test(ch)) {
      // Check for a loop keyword starting here (whole word).
      const rest = flat.slice(i, i + 6);
      const m = rest.match(/^(for|while)\b/);
      if (m && (i === 0 || !/[A-Za-z0-9_]/.test(flat[i - 1]))) {
        pendingLoop = true;
        i += m[1].length - 1;
      }
    }
  }
  return maxDepth;
}

function detectRecursion(code, lang) {
  // Find function names, then see if a function body calls itself.
  const names = new Set();
  if (lang === "python") {
    for (const m of code.matchAll(/\bdef\s+([A-Za-z_]\w*)\s*\(/g)) names.add(m[1]);
  } else {
    for (const m of code.matchAll(/\b([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{/g)) names.add(m[1]);
  }
  for (const name of names) {
    if (!name) continue;
    // Count call-sites of name(...) — if it appears 2+ times (definition + call) it may recurse.
    const callRe = new RegExp(`\\b${name}\\s*\\(`, "g");
    const count = (code.match(callRe) || []).length;
    if (count >= 2) return name;
  }
  return null;
}

const SORT_RE = /\b(sort|sorted|sort_values|Arrays\.sort|Collections\.sort|std::sort)\b/;
const BINARY_SEARCH_RE = /\b(bisect|binary_search|lower_bound|upper_bound|mid\s*=)/;

/**
 * Returns { label, rationale, confidence } or null if nothing meaningful found.
 * label like "O(1)", "O(n)", "O(n log n)", "O(n^2)", "O(n^3+)", "O(2^n)?".
 */
export function estimateComplexity(rawCode, language = "python") {
  const lang = String(language || "").toLowerCase().includes("py") ? "python"
    : String(language || "").toLowerCase().includes("javascript") || String(language).toLowerCase() === "js" ? "javascript"
    : String(language || "").toLowerCase() === "c++" || String(language).toLowerCase() === "cpp" ? "cpp"
    : "java";

  const code = stripCommentsAndStrings(rawCode || "", lang === "python" ? "python" : "clike");
  if (!code.trim()) return null;

  const nesting = maxLoopNesting(code, lang);
  const recursionName = detectRecursion(code, lang);
  const hasSort = SORT_RE.test(code);
  const hasBinarySearch = BINARY_SEARCH_RE.test(code);

  let label;
  let rationale;
  let confidence = "low";

  if (recursionName) {
    // Recursion: could be log (binary), linear, or exponential. We can't be sure.
    if (hasBinarySearch || /\/\/?\s*2|\bmid\b|\bhalf\b/.test(code)) {
      label = "O(log n)–O(n)";
      rationale = `Recursive (\`${recursionName}\`) that appears to halve the input — likely logarithmic or linear.`;
    } else {
      label = "O(n)–O(2ⁿ)";
      rationale = `Recursive (\`${recursionName}\`). Branching recursion can be exponential — check for memoization.`;
    }
    confidence = "low";
  } else if (nesting >= 3) {
    label = "O(n³ or more)";
    rationale = `${nesting} nested loops detected.`;
    confidence = "medium";
  } else if (nesting === 2) {
    label = "O(n²)";
    rationale = "Two nested loops over the input.";
    confidence = "medium";
  } else if (nesting === 1) {
    if (hasSort) {
      label = "O(n log n)";
      rationale = "A single loop plus a sort — the sort dominates.";
    } else {
      label = "O(n)";
      rationale = "A single pass over the input.";
    }
    confidence = "medium";
  } else {
    // No loops, no recursion.
    if (hasSort) {
      label = "O(n log n)";
      rationale = "A sort with no extra nested loops.";
      confidence = "medium";
    } else {
      label = "O(1)";
      rationale = "No loops or recursion — constant-time work.";
      confidence = "low";
    }
  }

  return { label, rationale, confidence };
}
