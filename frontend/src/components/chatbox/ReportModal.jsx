import { FaTimes } from "@react-icons/all-files/fa/FaTimes";

export default function ReportModal({
  isOpen,
  reportText,
  onReportTextChange,
  onClose,
  onSubmit,
}) {
  if (!isOpen) return null;

  return (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal" onClick={(e) => e.stopPropagation()}>
        <div className="report-modal-header">
          <h3>Report an Issue</h3>
          <button className="report-modal-close" onClick={onClose}>
            <FaTimes size={16} />
          </button>
        </div>
        <div className="report-modal-body">
          <p>Help us improve! What was wrong with this response?</p>
          <textarea
            className="report-textarea"
            placeholder="Describe the issue (e.g., incorrect information, unhelpful response, inappropriate content...)"
            value={reportText}
            onChange={(e) => onReportTextChange(e.target.value)}
            rows={4}
          />
        </div>
        <div className="report-modal-footer">
          <button className="report-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="report-submit-btn" onClick={onSubmit} disabled={!reportText.trim()}>
            Submit Report
          </button>
        </div>
      </div>
    </div>
  );
}
