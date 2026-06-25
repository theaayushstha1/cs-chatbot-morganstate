const CHAT_MODES = [
  {
    id: "regular",
    name: "CS Nav",
    hint: "Morgan State CS questions — courses, advising, requirements, and campus info.",
  },
  {
    id: "general_tutor",
    name: "General",
    hint: "Any academic or general question (non-Morgan), answered directly.",
  },
  {
    id: "coding_tutor",
    name: "Coding Tutor",
    hint: "Practice, run, debug, and review code with a guided tutor.",
  },
];

export default function TutorModeToggle({ chatMode, isLoading, onChange }) {
  return (
    <div className="mode-segmented" role="group" aria-label="Tutor mode">
      {CHAT_MODES.map(mode => (
        <button
          key={mode.id}
          type="button"
          className={`mode-segmented-btn ${chatMode === mode.id ? "active" : ""}`}
          onClick={() => onChange(mode.id)}
          disabled={isLoading}
          title={mode.hint}
          aria-label={`${mode.name}: ${mode.hint}`}
        >
          {mode.name}
        </button>
      ))}
    </div>
  );
}
