import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BsArrowUpCircleFill } from "react-icons/bs";
import { FaCommentDots, FaCompress, FaExpand, FaExternalLinkAlt, FaMicrophone, FaPaperclip, FaSyncAlt, FaTimes, FaWindowMinimize } from "react-icons/fa";
import TutorStatusCard from "./TutorStatusCard";
import WorkspaceCodeContext from "./WorkspaceCodeContext";
import "./FloatingCodingChat.css";

const REMARK_PLUGINS = [remarkGfm];

// Memoized so a message's markdown (and any YouTube iframe in it) does not
// re-render on every keystroke the user types in the floating chat input.
const FloatingMessageMarkdown = memo(function FloatingMessageMarkdown({ text, components }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
      {text}
    </ReactMarkdown>
  );
});

const POSITION_KEY = "coding_floating_chat_position";
const DEFAULT_POSITION = { x: null, y: null };
// Two optional one-tap accelerators at the top of the chat. Debug sends its
// request immediately; Rewrite first lets the student pick a target language
// (so they can convert), then sends. They are shortcuts, not a required step —
// the student can always just type a question instead.
const REWRITE_LANGUAGES = ["Same language", "Python", "JavaScript", "Java", "C++"];
const DEFAULT_THINKING_STEPS = ["Reading workspace", "Checking code/context", "Preparing tutor guidance"];

function getFloatingDimensions(isOpen, isMaximized) {
  if (typeof window === "undefined") return { width: 470, height: 680 };
  if (isMaximized) {
    return {
      width: Math.min(920, window.innerWidth - 48),
      height: Math.min(760, window.innerHeight - 48),
    };
  }
  if (isOpen) {
    return {
      width: Math.min(470, window.innerWidth - 32),
      height: Math.min(680, window.innerHeight - 36),
    };
  }
  return { width: 176, height: 56 };
}

function getDefaultPosition(isOpen, isMaximized) {
  if (typeof window === "undefined") return DEFAULT_POSITION;
  const { width, height } = getFloatingDimensions(isOpen, isMaximized);
  return {
    x: Math.max(16, window.innerWidth - width - 24),
    y: Math.max(16, window.innerHeight - height - 24),
  };
}

function clampPosition(position, isOpen, isMaximized) {
  if (typeof window === "undefined") return position;
  const { width, height } = getFloatingDimensions(isOpen, isMaximized);
  return {
    x: Math.min(Math.max(16, position.x), Math.max(16, window.innerWidth - width - 16)),
    y: Math.min(Math.max(16, position.y), Math.max(16, window.innerHeight - height - 16)),
  };
}

function readSavedPosition(isOpen, isMaximized) {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (!raw) return getDefaultPosition(isOpen, isMaximized);
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") return getDefaultPosition(isOpen, isMaximized);
    return clampPosition(parsed, isOpen, isMaximized);
  } catch {
    return getDefaultPosition(isOpen, isMaximized);
  }
}

function FloatingChatButton({ onOpen }) {
  return (
    <button
      type="button"
      className="floating-chat-button"
      onClick={onOpen}
      aria-label="Open coding tutor chat"
    >
      <FaCommentDots aria-hidden="true" />
      <span>Coding Tutor</span>
    </button>
  );
}

function FloatingThinkingSteps({ steps = DEFAULT_THINKING_STEPS }) {
  return (
    <div className="floating-thinking-steps" aria-label="Coding tutor is working">
      {steps.map((step, index) => (
        <div key={step} className={`floating-thinking-step ${index < steps.length - 1 ? "complete" : "active"}`}>
          <span className="floating-thinking-check" aria-hidden="true">
            {index < steps.length - 1 ? "✓" : ""}
          </span>
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

function FloatingChatWindow({
  messages,
  input,
  isLoading,
  pendingFile,
  accept,
  inputRef,
  fileInputRef,
  context,
  codeRenderer,
  markdownComponents,
  getFileIcon,
  hasCode,
  suggestedCodeBlock,
  isMaximized,
  thinkingMessages = DEFAULT_THINKING_STEPS,
  onInputChange,
  onFileChange,
  onClearFile,
  onVoiceInput,
  isListening,
  isSpeaking,
  isVoiceMode,
  onSend,
  onQuickAction,
  onApplyAICode,
  onMinimize,
  onMaximizeToggle,
  onOpenFullChat,
  onClose,
  onResetPosition,
  onDragStart,
}) {
  const activeProblem = context?.activeProblem || null;
  const selectedLanguage = context?.selectedLanguage || "Python";
  const attempts = context?.attempts ?? 0;
  const tutorMode = context?.tutorMode || "Guided Tutor";
  const topic = activeProblem?.title ? `Helping with: ${activeProblem.title}` : "Personal Code Help";
  const visibleMessages = isMaximized ? messages.slice(-24) : messages.slice(-10);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  // Stable components object so message markdown / iframes don't remount on keystrokes.
  const mdComponents = useMemo(
    () => markdownComponents || { code: codeRenderer },
    [markdownComponents, codeRenderer]
  );
  const showThinking = isLoading && !visibleMessages.some(msg => msg.isStreaming && msg.text);

  return (
    <section className={`floating-chat-window ${isMaximized ? "maximized" : ""}`} aria-label="Coding tutor floating chat">
      <header className="floating-chat-header" onPointerDown={onDragStart}>
        <div className="floating-chat-heading">
          <span className="coding-kicker">Coding Tutor Chat</span>
          <strong>{topic}</strong>
          <span className="floating-response-mode">Mode: {tutorMode}</span>
        </div>
        <div className="floating-chat-window-controls">
          <button type="button" className="floating-chat-control" onClick={onResetPosition} aria-label="Reset chat position" title="Reset position">
            <FaSyncAlt aria-hidden="true" />
          </button>
          <button type="button" className="floating-chat-control" onClick={onMinimize} aria-label="Minimize coding tutor chat" title="Minimize">
            <FaWindowMinimize aria-hidden="true" />
          </button>
          <button type="button" className="floating-chat-control" onClick={onMaximizeToggle} aria-label={isMaximized ? "Restore coding tutor chat" : "Maximize coding tutor chat"} title={isMaximized ? "Restore" : "Maximize"}>
            {isMaximized ? <FaCompress aria-hidden="true" /> : <FaExpand aria-hidden="true" />}
          </button>
          {onOpenFullChat && (
            <button type="button" className="floating-chat-control" onClick={onOpenFullChat} aria-label="Open full coding chat" title="Open full chat">
              <FaExternalLinkAlt aria-hidden="true" />
            </button>
          )}
          <button type="button" className="floating-chat-control danger" onClick={onClose} aria-label="Close coding tutor session" title="Close session">
            <FaTimes aria-hidden="true" />
          </button>
        </div>
      </header>

      <TutorStatusCard
        activeProblem={activeProblem}
        selectedLanguage={selectedLanguage}
        attempts={attempts}
        tutorMode={tutorMode}
      />

      <WorkspaceCodeContext
        code={context?.code || ""}
        activeProblem={activeProblem}
      />

      {/* Two optional shortcuts at the top. Debug sends immediately; Rewrite opens
          a language choice first so the student can convert before sending. You
          can always just type a question instead. */}
      <div className="floating-focus-chips" aria-label="Quick actions">
        <button
          type="button"
          className="floating-focus-chip"
          onClick={() => onQuickAction("Debug")}
          disabled={isLoading}
          title="Find the likely bug and how to check it."
        >
          Debug
        </button>
        <button
          type="button"
          className={`floating-focus-chip ${rewriteOpen ? "active" : ""}`}
          onClick={() => setRewriteOpen(v => !v)}
          disabled={isLoading}
          aria-expanded={rewriteOpen}
          title="Rewrite your code — pick a target language."
        >
          Rewrite…
        </button>
        {rewriteOpen && (
          <span className="floating-rewrite-langs">
            {REWRITE_LANGUAGES.map(lang => (
              <button
                key={lang}
                type="button"
                className="floating-rewrite-lang"
                onClick={() => { setRewriteOpen(false); onQuickAction("Rewrite", lang); }}
                disabled={isLoading}
              >
                {lang}
              </button>
            ))}
          </span>
        )}
      </div>

      {suggestedCodeBlock && onApplyAICode && (
        <button
          type="button"
          className="floating-apply-code-btn"
          onClick={onApplyAICode}
        >
          Apply AI Code to Workspace
        </button>
      )}

      <div className="floating-chat-messages">
        {visibleMessages.length ? visibleMessages.map((msg, index) => (
          <div key={`${msg.time || "message"}-${index}`} className={`floating-chat-message ${msg.sender}`}>
            {msg.isStreaming && !msg.text ? (
              <FloatingThinkingSteps steps={thinkingMessages} />
            ) : (
              <FloatingMessageMarkdown text={msg.text || ""} components={mdComponents} />
            )}
          </div>
        )) : showThinking ? (
          <FloatingThinkingSteps steps={thinkingMessages} />
        ) : (
          <div className="floating-chat-empty">
            <strong>Ask me anything about your code.</strong>
            <p>
              {hasCode
                ? "I can see your current workspace code — just describe what you're stuck on, or tap a shortcut below."
                : "Describe what you're working on or paste a snippet. Load a problem in the workspace and I'll use that code automatically."}
            </p>
          </div>
        )}
      </div>

      <form className="floating-chat-form" onSubmit={onSend}>
        {hasCode && (
          <span className="floating-code-indicator" title="Your current workspace code is sent with each message">
            Using your current code
          </span>
        )}
        {pendingFile && (
          <div className="floating-attachment-preview">
            {getFileIcon?.(pendingFile.name)}
            <span>{pendingFile.name}</span>
            <button type="button" onClick={onClearFile} aria-label="Remove attachment">
              <FaTimes aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="floating-chat-input-row">
          <button
            type="button"
            className="floating-chat-icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach code or notes"
            disabled={isLoading}
          >
            <FaPaperclip aria-hidden="true" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            accept={accept}
            onChange={onFileChange}
          />
          <button
            type="button"
            className={`floating-chat-icon-btn floating-chat-voice-btn ${isListening ? "listening" : ""}`}
            onClick={onVoiceInput}
            title="Voice input"
            disabled={isLoading || isSpeaking || isVoiceMode || !onVoiceInput}
          >
            <FaMicrophone aria-hidden="true" />
          </button>
          <textarea
            ref={inputRef}
            rows={isMaximized ? 4 : 2}
            value={input}
            onChange={onInputChange}
            placeholder="Paste code, an error, or ask for a review..."
            disabled={isLoading}
          />
          <button
            type="submit"
            className="floating-chat-send"
            title="Send message"
            disabled={isLoading || (!input.trim() && !pendingFile)}
          >
            <BsArrowUpCircleFill aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  );
}

export default function FloatingCodingChat({ isOpen, isMaximized, onOpen, ...windowProps }) {
  const [position, setPosition] = useState(() => readSavedPosition(isOpen, isMaximized));
  const [isDragging, setIsDragging] = useState(false);
  const wasMaximizedRef = useRef(isMaximized);
  const lastNormalPositionRef = useRef(readSavedPosition(isOpen, false));
  const dragFrameRef = useRef(null);
  const dragPositionRef = useRef(null);

  const safePosition = useMemo(() => clampPosition(position, isOpen, isMaximized), [isMaximized, isOpen, position]);

  const applyPosition = useCallback((nextPosition) => {
    setPosition(prev => (
      prev.x === nextPosition.x && prev.y === nextPosition.y ? prev : nextPosition
    ));
  }, []);

  useEffect(() => {
    if (isMaximized && !wasMaximizedRef.current) {
      lastNormalPositionRef.current = clampPosition(position, isOpen, false);
    }
    if (!isMaximized && wasMaximizedRef.current) {
      applyPosition(clampPosition(lastNormalPositionRef.current, isOpen, false));
    } else {
      const nextPosition = position.x === null ? getDefaultPosition(isOpen, isMaximized) : position;
      applyPosition(clampPosition(nextPosition, isOpen, isMaximized));
    }
    wasMaximizedRef.current = isMaximized;
  }, [applyPosition, isMaximized, isOpen, position]);

  const savePosition = (nextPosition) => {
    const clamped = clampPosition(nextPosition, isOpen, isMaximized);
    setPosition(clamped);
    if (!isMaximized) lastNormalPositionRef.current = clamped;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(clamped));
    } catch (error) {
      console.warn("[coding-chat] position save failed", error);
    }
  };

  const resetPosition = () => savePosition(getDefaultPosition(isOpen, isMaximized));

  const startDrag = (event) => {
    if (event.button !== 0 || event.target.closest?.("textarea, input, a, .floating-chat-window-controls button, .floating-chat-form button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = safePosition;

    const handleMove = (moveEvent) => {
      dragPositionRef.current = clampPosition({
        x: startPosition.x + moveEvent.clientX - startX,
        y: startPosition.y + moveEvent.clientY - startY,
      }, isOpen, isMaximized);
      if (dragFrameRef.current) return;
      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null;
        if (dragPositionRef.current) setPosition(dragPositionRef.current);
      });
    };

    const handleUp = (upEvent) => {
      if (dragFrameRef.current) {
        window.cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      setIsDragging(false);
      const finalPosition = clampPosition({
        x: startPosition.x + upEvent.clientX - startX,
        y: startPosition.y + upEvent.clientY - startY,
      }, isOpen, isMaximized);
      dragPositionRef.current = null;
      savePosition(finalPosition);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  };

  return (
    <div
      className={`floating-coding-chat ${isOpen ? "open" : "closed"} ${isDragging ? "dragging" : ""} ${isMaximized ? "maximized" : ""}`}
      style={isOpen ? { left: `${safePosition.x}px`, top: `${safePosition.y}px` } : undefined}
    >
      {isOpen ? (
        <FloatingChatWindow
          {...windowProps}
          isMaximized={isMaximized}
          onDragStart={startDrag}
          onResetPosition={resetPosition}
        />
      ) : (
        <FloatingChatButton onOpen={onOpen} />
      )}
    </div>
  );
}
