import { useEffect, useState } from "react";
import { FaPlay, FaCheck, FaRegCopy, FaUndoAlt, FaTimes, FaSave, FaFileUpload } from "react-icons/fa";

// Compact icon toolbar that lives in the editor title bar (next to the filename
// and language selector). Each action is an icon with a tooltip, which frees the
// whole bottom row for the editor. In the personal "My Snippets" workspace, Mark
// Solved is replaced by Save + Upload (no grading there).
export default function RunControls({
  code,
  activeProblem,
  isRunning = false,
  canMarkSolved = true,
  isPersonalMode = false,
  onRun,
  onMarkSolved,
  onCopyCode,
  onClearWorkspace,
  onSaveSnippet,
  onUploadFile,
}) {
  const hasCode = Boolean(code.trim());
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeProblemId = activeProblem?.id || null;

  // Drop the confirm prompt whenever the loaded problem changes (including after
  // a successful clear), so it never lingers on the next problem.
  useEffect(() => {
    setConfirmingClear(false);
  }, [activeProblemId]);

  const canClear = hasCode || Boolean(activeProblem);
  const canSolve = canMarkSolved && Boolean(activeProblem) && activeProblem.source !== "leetcode" && hasCode;

  const handleConfirmClear = () => {
    setConfirmingClear(false);
    onClearWorkspace?.();
  };

  const handleCopy = () => {
    onCopyCode?.();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="editor-action-icons" role="toolbar" aria-label="Workspace actions">
      <button
        type="button"
        className="editor-action-btn editor-action-run"
        onClick={onRun}
        disabled={!hasCode || isRunning}
        title={isRunning ? "Running..." : "Run code"}
        aria-label="Run code"
      >
        <FaPlay aria-hidden="true" />
      </button>

      {isPersonalMode ? (
        <>
          <button
            type="button"
            className="editor-action-btn editor-action-save"
            onClick={onSaveSnippet}
            disabled={!hasCode}
            title="Save snippet"
            aria-label="Save snippet"
          >
            <FaSave aria-hidden="true" />
          </button>
          <button
            type="button"
            className="editor-action-btn editor-action-upload"
            onClick={onUploadFile}
            title="Upload a .py or .ipynb file"
            aria-label="Upload a file"
          >
            <FaFileUpload aria-hidden="true" />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="editor-action-btn editor-action-solve"
          onClick={onMarkSolved}
          disabled={!canSolve}
          title="Mark solved"
          aria-label="Mark solved"
        >
          <FaCheck aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        className="editor-action-btn editor-action-copy"
        onClick={handleCopy}
        disabled={!hasCode}
        title={copied ? "Copied!" : "Copy code"}
        aria-label="Copy code"
      >
        <FaRegCopy aria-hidden="true" />
      </button>

      {confirmingClear ? (
        <span className="editor-action-confirm">
          <button
            type="button"
            className="editor-action-btn editor-action-confirm-yes"
            onClick={handleConfirmClear}
            disabled={isRunning}
            title="Confirm clear — the loaded problem stays saved in Quiz Bank"
            aria-label="Confirm clear workspace"
          >
            <FaCheck aria-hidden="true" />
          </button>
          <button
            type="button"
            className="editor-action-btn editor-action-confirm-no"
            onClick={() => setConfirmingClear(false)}
            disabled={isRunning}
            title="Cancel"
            aria-label="Cancel clear"
          >
            <FaTimes aria-hidden="true" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="editor-action-btn editor-action-clear"
          onClick={() => setConfirmingClear(true)}
          disabled={isRunning || !canClear}
          title="Clear workspace"
          aria-label="Clear workspace"
        >
          <FaUndoAlt aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
