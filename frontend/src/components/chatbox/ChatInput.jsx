import { FaMicrophone } from "@react-icons/all-files/fa/FaMicrophone";
import { FaPaperclip } from "@react-icons/all-files/fa/FaPaperclip";
import { FaTimes } from "@react-icons/all-files/fa/FaTimes";
import { BsArrowUpCircleFill, BsSoundwave } from "react-icons/bs";

export default function ChatInput({
  onSubmit,
  pendingFile,
  getFileIcon,
  onClearFile,
  fileInputRef,
  onFileSelect,
  accept,
  isLoading,
  isVoiceMode,
  isListening,
  isSpeaking,
  inputRef,
  input,
  onInputChange,
  onEnterSubmit,
  placeholder,
  onVoiceInput,
  onToggleVoiceMode,
}) {
  return (
    <div className="chat-input-container">
      <form onSubmit={onSubmit} className="chat-input-wrapper">
        {pendingFile && (
          <div className="attachment-preview">
            {getFileIcon(pendingFile.name)}
            <span className="file-name-preview">{pendingFile.name}</span>
            <button
              type="button"
              className="remove-attachment-btn"
              onClick={onClearFile}
              title="Remove file"
            >
              <FaTimes />
            </button>
          </div>
        )}

        <div className="input-row">
          <button
            type="button"
            className="action-btn-icon"
            onClick={() => fileInputRef.current.click()}
            title="Attach a file"
            disabled={isLoading || isVoiceMode}
          >
            <FaPaperclip size={18} />
          </button>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept={accept}
            onChange={onFileSelect}
          />

          <button
            type="button"
            className={`action-btn-icon voice-btn ${isListening ? "listening" : ""}`}
            onClick={onVoiceInput}
            title="Voice input"
            disabled={isLoading || isSpeaking || isVoiceMode}
          >
            <FaMicrophone size={18} />
          </button>

          <textarea
            rows={1}
            ref={inputRef}
            className="chat-input-field"
            value={input}
            maxLength={2000}
            onChange={onInputChange}
            onKeyDown={onEnterSubmit}
            placeholder={placeholder}
            disabled={isLoading || isVoiceMode}
          />

          <button
            type="submit"
            className="action-btn-icon send-btn"
            title="Send message"
            disabled={isLoading || (!input.trim() && !pendingFile) || isVoiceMode}
          >
            <BsArrowUpCircleFill size={24} />
          </button>

          <button
            type="button"
            className={`live-mode-btn ${isVoiceMode ? "active" : ""}`}
            onClick={onToggleVoiceMode}
            title={isVoiceMode ? "Exit Live Mode" : "Enter Live Mode"}
            disabled={isLoading}
          >
            <BsSoundwave size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
