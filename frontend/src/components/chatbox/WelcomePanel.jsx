import { motion as Motion } from "framer-motion";

export default function WelcomePanel({ suggestionsLoading, suggestions, isLoading, onSuggestion }) {
  return (
    <Motion.div
      className="welcome-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <img src="/msu_logo.webp" alt="MSU Logo" className="welcome-logo" />
      <h1 className="welcome-title">Morgan State CS Navigator</h1>
      <p className="welcome-subtitle">How can I assist with your academic journey today?</p>
      <div className="suggestions">
        {suggestionsLoading ? (
          <>
            <div className="suggestion-skeleton"></div>
            <div className="suggestion-skeleton"></div>
            <div className="suggestion-skeleton"></div>
          </>
        ) : (
          suggestions.map((suggestion, index) => (
            <button
              key={index}
              className="suggestion-btn"
              onClick={() => onSuggestion(suggestion)}
              disabled={isLoading}
            >
              {suggestion}
            </button>
          ))
        )}
      </div>
    </Motion.div>
  );
}
