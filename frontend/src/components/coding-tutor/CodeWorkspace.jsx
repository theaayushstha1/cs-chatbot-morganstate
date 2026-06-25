import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeEditor from "./CodeEditor";
import HintPanel from "./HintPanel";
import RunControls from "./RunControls";
import TerminalPanel from "./TerminalPanel";
import "./CodeWorkspace.css";
import "./TerminalPanel.css";

const WORKSPACE_TABS = ["Editor", "Hints", "Discussion"];

// Docked-terminal height bounds (px). The drag handle clamps within this range.
const TERMINAL_MIN_H = 140;
const TERMINAL_MAX_H = 560;
const TERMINAL_DEFAULT_H = 240;
const TERMINAL_H_KEY = "csnav.terminalHeight";

function readStoredTerminalHeight() {
  try {
    const raw = window.localStorage.getItem(TERMINAL_H_KEY);
    const value = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(value)) {
      return Math.min(TERMINAL_MAX_H, Math.max(TERMINAL_MIN_H, value));
    }
  } catch {
    /* ignore storage errors */
  }
  return TERMINAL_DEFAULT_H;
}

export default function CodeWorkspace({
  activeProblem,
  code,
  selectedLanguage,
  languageOptions,
  languageFormat,
  workspaceTab,
  hints,
  revealedHints,
  isRunning,
  latestFeedback,
  terminalOpen,
  testOutput,
  canMarkSolved = true,
  isPersonalMode = false,
  onCodeChange,
  onLanguageChange,
  onTabChange,
  onToggleTerminal,
  onCloseTerminal,
  onRun,
  onMarkSolved,
  onCopyCode,
  onClearWorkspace,
  onShowHint,
  onShowAllHints,
  onExplainFailedTests,
  onExplainError,
  onStopRun,
  onRequestReview,
  onSaveSnippet,
  onUploadFile,
  codeRenderer,
}) {
  const [caret, setCaret] = useState({ line: 1, col: 1, chars: 0 });
  const [terminalHeight, setTerminalHeight] = useState(readStoredTerminalHeight);
  const stackRef = useRef(null);
  const dragState = useRef(null);

  // Drag-to-resize the docked terminal. We resize from the divider: dragging up
  // grows the terminal, dragging down shrinks it. Height is clamped + persisted.
  const onDividerPointerDown = useCallback((event) => {
    event.preventDefault();
    const stack = stackRef.current;
    const available = stack ? stack.getBoundingClientRect().height : window.innerHeight;
    dragState.current = {
      startY: event.clientY,
      startHeight: terminalHeight,
      // Never let the terminal eat the whole stack — leave room for the editor.
      maxForStack: Math.min(TERMINAL_MAX_H, Math.max(TERMINAL_MIN_H, available - 180)),
    };
    document.body.classList.add("ct-terminal-resizing");
    try {
      event.target.setPointerCapture?.(event.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
  }, [terminalHeight]);

  const onDividerPointerMove = useCallback((event) => {
    const state = dragState.current;
    if (!state) return;
    const delta = state.startY - event.clientY; // up = positive = taller terminal
    const next = Math.min(state.maxForStack, Math.max(TERMINAL_MIN_H, state.startHeight + delta));
    setTerminalHeight(next);
  }, []);

  const endDrag = useCallback(() => {
    if (!dragState.current) return;
    dragState.current = null;
    document.body.classList.remove("ct-terminal-resizing");
    setTerminalHeight((value) => {
      try {
        window.localStorage.setItem(TERMINAL_H_KEY, String(Math.round(value)));
      } catch {
        /* ignore storage errors */
      }
      return value;
    });
  }, []);

  // Keyboard resize on the divider for accessibility (Up/Down arrows).
  const onDividerKeyDown = useCallback((event) => {
    const step = event.shiftKey ? 48 : 16;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setTerminalHeight((v) => Math.min(TERMINAL_MAX_H, v + step));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setTerminalHeight((v) => Math.max(TERMINAL_MIN_H, v - step));
    }
  }, []);

  useEffect(() => {
    return () => document.body.classList.remove("ct-terminal-resizing");
  }, []);

  const renderTab = () => {
    if (workspaceTab === "Hints") {
      return (
        <HintPanel
          hints={hints}
          revealedHints={revealedHints}
          onShowHint={onShowHint}
          onShowAllHints={onShowAllHints}
          codeRenderer={codeRenderer}
        />
      );
    }
    if (workspaceTab === "Discussion") {
      return (
        <div className="workspace-discussion-panel">
          {latestFeedback ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: codeRenderer }}>
              {latestFeedback}
            </ReactMarkdown>
          ) : <p>Tutor replies will appear here after you ask for review, debugging, or edge cases.</p>}
        </div>
      );
    }
    // The editor "window": a title bar (filename + language selector, like
    // LeetCode's code panel) and a bottom status bar.
    return (
      <div className="code-editor-window">
        <div className="code-editor-titlebar">
          <span className="code-editor-filename">{languageFormat.file}</span>
          <div className="code-editor-titlebar-right">
            <RunControls
              code={code}
              activeProblem={activeProblem}
              isRunning={isRunning}
              canMarkSolved={canMarkSolved}
              isPersonalMode={isPersonalMode}
              onRun={onRun}
              onMarkSolved={onMarkSolved}
              onCopyCode={onCopyCode}
              onClearWorkspace={onClearWorkspace}
              onSaveSnippet={onSaveSnippet}
              onUploadFile={onUploadFile}
            />
            <select
              className="code-editor-lang-select"
              value={selectedLanguage}
              onChange={(event) => onLanguageChange(event.target.value)}
              title="Change language"
            >
              {languageOptions.map(language => <option key={language} value={language}>{language}</option>)}
            </select>
          </div>
        </div>
        <CodeEditor code={code} onCodeChange={onCodeChange} onCursorChange={setCaret} language={selectedLanguage} />
        <div className="code-editor-statusbar" aria-hidden="true">
          <span className="status-left">
            <span className="status-pill">{selectedLanguage}</span>
            <span>UTF-8</span>
            <span>Spaces: 4</span>
          </span>
          <span className="status-right">
            <span>Ln {caret.line}, Col {caret.col}</span>
            <span>{caret.chars} chars</span>
          </span>
        </div>
      </div>
    );
  };

  const showTerminal = terminalOpen && workspaceTab === "Editor";

  return (
    <main className="coding-editor-center">
      <div className="coding-pane-header">
        <div><span className="coding-kicker">Workspace</span><h2>{activeProblem?.title || "Code Editor"}</h2></div>
      </div>
      <div className="workspace-tabs">
        {WORKSPACE_TABS.map(tab => (
          <button key={tab} type="button" className={workspaceTab === tab ? "active" : ""} onClick={() => onTabChange(tab)}>
            {tab}
          </button>
        ))}
        <button
          type="button"
          className={terminalOpen ? "active terminal-tab" : "terminal-tab"}
          onClick={onToggleTerminal}
          aria-pressed={terminalOpen}
          title={terminalOpen ? "Close terminal" : "Open terminal"}
        >
          Terminal
        </button>
      </div>

      {/* The editor + terminal are ONE stacked unit. The terminal docks below the
          editor with a draggable divider — not a detached footer. */}
      <div className={`editor-terminal-stack ${showTerminal ? "terminal-docked" : ""}`} ref={stackRef}>
        <div className="workspace-tab-body">{renderTab()}</div>
        {showTerminal && (
          <>
            <div
              className="editor-terminal-divider"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize terminal"
              tabIndex={0}
              onPointerDown={onDividerPointerDown}
              onPointerMove={onDividerPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onDividerKeyDown}
            >
              <span className="editor-terminal-divider-grip" aria-hidden="true" />
            </div>
            <div className="coding-dock-terminal" style={{ height: `${terminalHeight}px` }}>
              <TerminalPanel
                testOutput={testOutput}
                code={code}
                language={selectedLanguage}
                isRunning={isRunning}
                expanded
                onClose={onCloseTerminal}
                onStop={onStopRun}
                onExplainFailedTests={onExplainFailedTests}
                onExplainError={onExplainError}
                onRequestReview={onRequestReview}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
