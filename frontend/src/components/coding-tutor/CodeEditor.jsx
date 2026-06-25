import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { highlightCode } from "../../lib/highlight";

function getLineIndent(line) {
  return line.match(/^\s*/)?.[0] || "";
}

function shouldIncreaseIndent(line) {
  return /:\s*(#.*)?$/.test(line.trimEnd()) || /[{[(]\s*$/.test(line.trimEnd());
}

// Auto-close pairs. The closing char is inserted after the opening one.
const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
const CLOSERS = new Set(Object.values(PAIRS));
const OPENERS = new Set(Object.keys(PAIRS));
const INDENT = "    ";
const INDENT_LEN = INDENT.length;

export default function CodeEditor({ code, onCodeChange, onCursorChange, language }) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const highlightRef = useRef(null);
  const [activeLine, setActiveLine] = useState(1);

  // Syntax-colored HTML for the overlay. Trailing newline keeps overlay height
  // in sync with the textarea so the last line never clips.
  const highlightedHtml = useMemo(
    () => highlightCode(code + "\n", language),
    [code, language]
  );

  const lineCount = useMemo(() => {
    const n = (code ? code.split("\n").length : 1);
    return Math.max(n, 1);
  }, [code]);

  // Keep the gutter and the highlight overlay scrolled in lockstep with the textarea.
  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
  }, []);

  // Report the caret line/column (for the status bar) and track the active line.
  const reportCaret = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const upto = el.value.slice(0, el.selectionStart);
    const line = upto.split("\n").length;
    const col = upto.length - upto.lastIndexOf("\n");
    setActiveLine(line);
    onCursorChange?.({ line, col, chars: el.value.length });
  }, [onCursorChange]);

  useEffect(() => {
    reportCaret();
  }, [code, reportCaret]);

  // Apply a text replacement and place the caret, going through onCodeChange so
  // React stays the source of truth.
  const applyEdit = (textarea, nextValue, caretStart, caretEnd = caretStart) => {
    onCodeChange(nextValue);
    requestAnimationFrame(() => {
      textarea.selectionStart = caretStart;
      textarea.selectionEnd = caretEnd;
      reportCaret();
    });
  };

  const handleEditorKeyDown = (event) => {
    const textarea = event.currentTarget;
    const { selectionStart, selectionEnd, value } = textarea;
    const indent = "    ";
    const charBefore = value[selectionStart - 1];
    const charAfter = value[selectionStart];

    // ── Auto-close brackets and quotes ──────────────────────────────────────
    if (OPENERS.has(event.key)) {
      event.preventDefault();
      const open = event.key;
      const close = PAIRS[open];
      if (selectionStart !== selectionEnd) {
        // Wrap the current selection: open + selection + close.
        const selected = value.slice(selectionStart, selectionEnd);
        const next = value.slice(0, selectionStart) + open + selected + close + value.slice(selectionEnd);
        applyEdit(textarea, next, selectionStart + 1, selectionEnd + 1);
        return;
      }
      // For quotes, don't auto-close right before a word char (e.g. mid-token).
      const isQuote = open === '"' || open === "'" || open === "`";
      const nextIsWord = charAfter && /[\w]/.test(charAfter);
      if (isQuote && (charBefore && /[\w]/.test(charBefore) || nextIsWord)) {
        const next = value.slice(0, selectionStart) + open + value.slice(selectionStart);
        applyEdit(textarea, next, selectionStart + 1);
        return;
      }
      const next = value.slice(0, selectionStart) + open + close + value.slice(selectionStart);
      applyEdit(textarea, next, selectionStart + 1);
      return;
    }

    // ── Skip over an auto-inserted closer ───────────────────────────────────
    if (CLOSERS.has(event.key) && charAfter === event.key && selectionStart === selectionEnd) {
      event.preventDefault();
      applyEdit(textarea, value, selectionStart + 1);
      return;
    }

    // ── Backspace ───────────────────────────────────────────────────────────
    if (event.key === "Backspace" && selectionStart === selectionEnd) {
      // Delete an empty auto-closed pair in one stroke: ()| -> |
      if (OPENERS.has(charBefore) && PAIRS[charBefore] === charAfter) {
        event.preventDefault();
        const next = value.slice(0, selectionStart - 1) + value.slice(selectionStart + 1);
        applyEdit(textarea, next, selectionStart - 1);
        return;
      }
      // Smart-backspace: if only spaces precede the caret on this line, remove a
      // whole indent (up to 4) instead of one space.
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const before = value.slice(lineStart, selectionStart);
      if (before.length > 0 && /^ +$/.test(before)) {
        const remove = ((before.length - 1) % INDENT_LEN) + 1; // back to the previous tab stop
        event.preventDefault();
        const next = value.slice(0, selectionStart - remove) + value.slice(selectionStart);
        applyEdit(textarea, next, selectionStart - remove);
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = value.slice(lineStart, selectionStart);
      const currentIndent = getLineIndent(currentLine);
      const extraIndent = shouldIncreaseIndent(currentLine) ? indent : "";
      const insertion = `\n${currentIndent}${extraIndent}`;
      const nextValue = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
      onCodeChange(nextValue);
      requestAnimationFrame(() => {
        const nextCursor = selectionStart + insertion.length;
        textarea.selectionStart = nextCursor;
        textarea.selectionEnd = nextCursor;
        reportCaret();
      });
      return;
    }

    if (event.key !== "Tab") return;

    event.preventDefault();

    if (event.shiftKey) {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const selectedText = value.slice(lineStart, selectionEnd);
      const outdentedText = selectedText.replace(/^( {1,4}|\t)/gm, "");
      const nextValue = value.slice(0, lineStart) + outdentedText + value.slice(selectionEnd);
      const removed = selectedText.length - outdentedText.length;
      onCodeChange(nextValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = Math.max(lineStart, selectionStart - Math.min(4, removed));
        textarea.selectionEnd = Math.max(textarea.selectionStart, selectionEnd - removed);
      });
      return;
    }

    if (selectionStart !== selectionEnd && value.slice(selectionStart, selectionEnd).includes("\n")) {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const selectedText = value.slice(lineStart, selectionEnd);
      const indentedText = selectedText.replace(/^/gm, indent);
      const nextValue = value.slice(0, lineStart) + indentedText + value.slice(selectionEnd);
      onCodeChange(nextValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = selectionStart + indent.length;
        textarea.selectionEnd = selectionEnd + (indentedText.length - selectedText.length);
      });
      return;
    }

    const nextValue = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
    onCodeChange(nextValue);
    requestAnimationFrame(() => {
      textarea.selectionStart = selectionStart + indent.length;
      textarea.selectionEnd = selectionStart + indent.length;
      reportCaret();
    });
  };

  return (
    <div className="code-editor-shell">
      <div className="code-editor-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <span
            key={i}
            className={`code-editor-line-no ${i + 1 === activeLine ? "active" : ""}`}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <div className="code-editor-input-wrap">
        {/* Colored layer behind the transparent textarea. Must share the same
            font metrics + padding as the textarea so the colors stay aligned. */}
        <pre
          ref={highlightRef}
          className="code-editor-highlight"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
        <textarea
          ref={textareaRef}
          className="coding-editor leetcode-editor code-editor-textarea"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          onKeyDown={handleEditorKeyDown}
          onScroll={syncScroll}
          onClick={reportCaret}
          onKeyUp={reportCaret}
          onSelect={reportCaret}
          placeholder="Paste code for review, or load a Quiz Bank problem and write your attempt here."
          spellCheck="false"
          wrap="off"
        />
      </div>
    </div>
  );
}
