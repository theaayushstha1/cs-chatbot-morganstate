import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";

// --- Inline SVG Icons to replace external dependencies (FaEnvelope, FaLock) ---
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

export default function Signup({ onRegistered }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  // --- API Base URL Resolution Logic (FIXED) ---
  const API_BASE = useMemo(() => {
    let envBase = window.VITE_API_BASE_URL;
    if (typeof envBase === 'string' && envBase.trim()) {
      return envBase.trim().replace(/\/$/, "");
    }
    if (window.location.port === "5173") {
      return `${window.location.protocol}//${window.location.hostname}:5000`;
    }
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }, []);

  // --- Inline Styles (Consistent Look) ---
  const styles = {
    container: { display: "flex", minHeight: "100vh", fontFamily: "Segoe UI, sans-serif" },
    sidebar: {
      flex: 1,
      background: "linear-gradient(135deg, #4A90E2 0%, #185a9d 100%)",
      color: "#fff",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 40
    },
    sidebarIcon: { width: 64, height: 64, marginBottom: 20 },
    sidebarText: { fontSize: 24, textAlign: "center", lineHeight: 1.4 },
    main: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f0f2f5" },
    card: { width: 360, padding: 40, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", backgroundColor: "#fff" },
    formGroup: { position: "relative", marginBottom: 24 },
    inputIcon: { position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)", color: "#888", width: 16, height: 16 }, 
    input: { width: "100%", padding: "12px 12px 12px 40px", border: "1px solid #ccc", borderRadius: 4, fontSize: 14, outline: "none" },
    button: { width: "100%", padding: "12px", backgroundColor: "#4A90E2", color: "#fff", border: "none", borderRadius: 4, fontSize: 16, cursor: "pointer" },
    buttonDisabled: { opacity: 0.7, cursor: "not-allowed" },
    footer: { marginTop: 16, textAlign: "center", fontSize: 14 },
    link: { color: "#4A90E2", textDecoration: "none", marginLeft: 4 },
    error: { color: "red", textAlign: "center", marginBottom: 16 }
  };

  // Helper function to safely extract and parse error messages
  const parseResponseError = async (res) => {
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
    const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      // Explicitly point to port 5000 for local Docker testing
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Registration failed");
      }

      alert("Account created successfully!");
      navigate("/login");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // --- Component Render ---
  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <EnvelopeIcon style={styles.sidebarIcon} />
        <div style={styles.sidebarText}>Join Morgan State CS Chatbot</div>
      </div>

      <div style={styles.main}>
        <div style={styles.card}>
          <h2 style={{ textAlign: "center", marginBottom: 24 }}>Sign Up</h2>
          {error && <div style={styles.error}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={styles.formGroup}>
              <EnvelopeIcon style={styles.inputIcon} />
              <input
                style={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                autoComplete="email"
              />
            </div>

            <div style={styles.formGroup}>
              <LockIcon style={styles.inputIcon} />
              <input
                style={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              style={{ ...styles.button, ...(submitting ? styles.buttonDisabled : {}) }}
              disabled={submitting || !email.trim() || !password}
            >
              {submitting ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <div style={styles.footer}>
            Already have an account?
            <Link to="/login" style={styles.link}>Log In</Link>
          </div>
        </div>
      </div>
    </div>
  );
}