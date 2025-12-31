import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "./components/auth/AuthLayout";

const EnvelopeIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <path fill="currentColor" d="M496 128H16c-8.8 0-16 7.2-16 16v224c0 8.8 7.2 16 16 16h480c8.8 0 16-7.2 16-16V144c0-8.8-7.2-16-16-16zm-480 32l160 128 160-128v192H16V160zm480 0v192H336L496 160zM256 313.7l-192-153.6v-25.7l192 153.6 192-153.6v25.7l-192 153.6z"/>
  </svg>
);

const LockIcon = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
    <path fill="currentColor" d="M144 144v48H0V144C0 64.5 64.5 0 144 0h160c79.5 0 144 64.5 144 144v48H304v-48c0-44.1-35.9-80-80-80H192c-44.1 0-80 35.9-80 80zM368 224H80c-26.5 0-48 21.5-48 48v224c0 26.5 21.5 48 48 48h288c26.5 0 48-21.5 48-48V272c0-26.5-21.5-48-48-48zm-64 160c0 17.7-14.3 32-32 32s-32-14.3-32-32V304c0-17.7 14.3-32 32-32s32 14.3 32 32v80z"/>
  </svg>
);

async function parseResponseError(res) {
  let message = `Error ${res.status}`;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const errData = await res.json().catch(() => null);
    if (errData) {
      if (typeof errData?.detail === "string") message = errData.detail;
      else if (typeof errData?.message === "string") message = errData.message;
      else if (typeof errData === "string") message = errData;
    }
  } else {
    const txt = await res.text().catch(() => "");
    if (txt) message = txt;
  }
  return message;
}

export default function Signup({ onRegistered }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // 🔥 SMART CONFIG: Browser-based detection (Bulletproof)
  const hostname = window.location.hostname;
  const API_BASE = (hostname === "localhost" || hostname === "127.0.0.1")
    ? "http://127.0.0.1:8000"           // Local
    : "http://18.214.136.155:5000";     // AWS Production

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) throw new Error(await parseResponseError(res));

      const data = await res.json();
      
      alert("Account created successfully!");
      navigate("/login");
    } catch (err) {
      setError(err?.message || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Sign Up"
      subtitle="Join the community. Create your account to explore courses, requirements, and resources."
      footer={
        <>
          Already have an account? <Link className="auth__link" to="/login">Log in</Link>
        </>
      }
    >
      {error ? (
        <div className="auth__error" role="alert">{error}</div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="signup-email">Email</label>
          <div className="field__control">
            <EnvelopeIcon className="field__icon" aria-hidden="true" />
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.edu"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <div className="field__control">
            <LockIcon className="field__icon" aria-hidden="true" />
            <input
              id="signup-password"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className="field__action"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <button
          className="btn-primary auth__submit"
          type="submit"
          disabled={submitting || !email.trim() || !password}
        >
          {submitting ? "Creating Account…" : "Create Account"}
        </button>
      </form>
    </AuthLayout>
  );
}