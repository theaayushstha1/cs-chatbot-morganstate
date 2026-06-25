import TutorModeToggle from "../TutorModeToggle";

export default function ChatHeader({
  modelDropdownRef,
  modelDropdownOpen,
  setModelDropdownOpen,
  modelOptions,
  selectedModel,
  setSelectedModel,
  isLoading,
  showTutorModeToggle,
  chatMode,
  onTutorModeChange,
  isCodingWorkspaceRoute,
  isCodingChatRoute,
  onBackHome,
  onOpenCodingWorkspace,
}) {
  return (
    <div className="model-selector-header">
      <div className="chat-controls-header">
        <div className="model-selector-wrap" ref={modelDropdownRef}>
          <button
            className="model-selector-trigger"
            onClick={() => setModelDropdownOpen((prev) => !prev)}
            disabled={isLoading}
          >
            <span className="model-selector-name">
              {modelOptions.find((model) => model.id === selectedModel)?.name || "iNav"}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ opacity: 0.5, marginLeft: 4 }}
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {modelDropdownOpen && (
            <div className="model-dropdown">
              {modelOptions.map((model) => (
                <button
                  key={model.id}
                  className={`model-dropdown-item ${selectedModel === model.id ? "active" : ""}`}
                  onClick={() => {
                    setSelectedModel(model.id);
                    setModelDropdownOpen(false);
                  }}
                >
                  <div className="model-dropdown-info">
                    <span className="model-dropdown-name">{model.name}</span>
                    <span className="model-dropdown-desc">{model.desc}</span>
                  </div>
                  {selectedModel === model.id && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                      className="model-dropdown-check"
                    >
                      <path d="M6.5 12.5L2 8l1.5-1.5L6.5 9.5 12.5 3.5 14 5z" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {showTutorModeToggle && (
          <TutorModeToggle chatMode={chatMode} isLoading={isLoading} onChange={onTutorModeChange} />
        )}
        {isCodingWorkspaceRoute && (
          <button type="button" className="header-home-btn" onClick={onBackHome}>
            Back to Home
          </button>
        )}
        {isCodingChatRoute && (
          <button type="button" className="header-home-btn" onClick={onOpenCodingWorkspace}>
            Open Coding Workspace
          </button>
        )}
      </div>
    </div>
  );
}
