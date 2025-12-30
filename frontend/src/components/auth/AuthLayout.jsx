import React from "react";
import "./auth.css";

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      {/* LEFT: centered logo + copy */}
      <aside className="auth__brand" aria-label="Morgan State CS Navigator">
        <div className="auth__brandInner">
          <img
            className="auth__logoMain"
            src="/main_logo.png"
            alt="Morgan State University"
          />

          <h1 className="auth__brandTitle">CS Navigator</h1>
          <p className="auth__brandSubtitle">{subtitle}</p>
        </div>
      </aside>

      {/* RIGHT: centered login card on blue */}
      <main className="auth__main">
        <section className="auth__card card" aria-label={title}>
          <header className="auth__header">
            <h2 className="auth__title">{title}</h2>
          </header>

          {children}

          {footer ? <div className="auth__footer">{footer}</div> : null}
        </section>
      </main>
    </div>
  );
}
