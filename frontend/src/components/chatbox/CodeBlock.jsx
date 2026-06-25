import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { toast } from "sonner";

export default function CodeBlock({ className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || "");
  const codeString = String(children).replace(/\n$/, "");
  const isBlock = match || codeString.includes("\n");

  if (!isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  const language = match ? match[1] : "text";

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang">{language}</span>
        <button
          className="code-copy-btn"
          onClick={() => {
            navigator.clipboard.writeText(codeString);
            toast.success("Copied to clipboard");
          }}
        >
          Copy
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: "0 0 8px 8px", fontSize: "0.85rem" }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
}
