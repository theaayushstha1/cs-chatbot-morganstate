export default function WorkspaceCodeContext({ code, activeProblem }) {
  const trimmedCode = code?.trim();
  if (!trimmedCode) return null;

  const label = activeProblem?.title ? `Workspace code: ${activeProblem.title}` : "Workspace code";

  return (
    <details className="floating-code-context">
      <summary>
        <span>{label}</span>
      </summary>
      <pre><code>{trimmedCode}</code></pre>
    </details>
  );
}
