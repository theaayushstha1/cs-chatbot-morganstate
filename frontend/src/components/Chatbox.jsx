// src/components/Chatbox.jsx

import React, { useState, useEffect, useRef, useMemo } from "react";
import { FaMicrophone } from "@react-icons/all-files/fa/FaMicrophone";
import { FaPaperPlane } from "@react-icons/all-files/fa/FaPaperPlane";
import { FaUserCircle } from "@react-icons/all-files/fa/FaUserCircle";
import { FaRobot } from "@react-icons/all-files/fa/FaRobot";
import { FaHistory } from "@react-icons/all-files/fa/FaHistory";
import { FaTrash } from "@react-icons/all-files/fa/FaTrash";
import "./Chatbox.css";

const SUGGESTIONS = [
  "Who is the chair of computer science department?",
  "What are the degree requirements?",
  "What is the first day of class for fall 2025?"
];
const STORAGE_KEY = "chat_history";

// Helper to decode JWT payload
function decodeJwt(token) {
  try {
    const base64 = token.split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return {};
  }
}

// Helper: split text into React nodes
function linkify(text) {
  const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const parts = text.split(mdRegex);
  const nodes = [];

  for (let i = 0; i < parts.length; ) {
    if (i % 3 === 0) {
      nodes.push(<span key={i}>{parts[i]}</span>);
      i += 1;
    } else {
      const label = parts[i];
      const url = parts[i + 1];
      nodes.push(
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="message-link"
        >
          {label}
        </a>
      );
      i += 2;
    }
  }

  return nodes.flatMap((node, idx) => {
    if (typeof node === "string" || node.type === undefined) {
      const textContent = node.props ? node.props.children : node;
      const urlRegex = /(https?:\/\/[^\s.,;!?)]+[^\s.,;!?)])/g;
      const pieces = textContent.split(urlRegex);
      return pieces.map((piece, j) => {
        const m = piece.match(
          /^(https?:\/\/[^\s.,;!?)]+[^\s.,;!?)])([.,;!?)])?$/
        );
        if (m) {
          const url = m[1];
          const trailing = m[2] || "";
          return (
            <React.Fragment key={`${idx}-${j}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="message-link"
              >
                {url}
              </a>
              {trailing}
            </React.Fragment>
          );
        }
        return <span key={`${idx}-${j}`}>{piece}</span>;
      });
    } else {
      return node;
    }
  });
}

export default function Chatbox() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [serverHistory, setServerHistory] = useState([]);
  const [chatSessions, setChatSessions] = useState(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_sessions`);
    return saved ? JSON.parse(saved) : [{ id: Date.now(), messages: [] }];
  });
  const [currentSessionId, setCurrentSessionId] = useState(
    () => chatSessions[0]?.id || Date.now()
  );
  const [greeted, setGreeted] = useState(false);
  const messagesEndRef = useRef(null);

  // --- SMART API DETECTION ---
  const API_BASE = useMemo(() => {
    // Force localhost:5000 if on local dev
    if (window.location.port === "5173") {
      return "http://localhost:5000";
    }
    // Force localhost:5000 if on Docker
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }, []);

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_sessions`, JSON.stringify(chatSessions));
  }, [chatSessions]);

  useEffect(() => {
    setChatSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId ? { ...s, messages } : s
      )
    );
  }, [messages, currentSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showHistoryPanel]);

  useEffect(() => {
    if (greeted || messages.length > 0) return;
    const token = localStorage.getItem("token");
    if (token) {
      const { email } = decodeJwt(token);
      if (email) addMessage(`Logged in as ${email}`, "bot");
    }
    setGreeted(true);
  }, [greeted, messages]);

  const addMessage = (text, sender) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setMessages((prev) => [...prev, { text, sender, time }]);
  };

  const sendQuery = async (query) => {
    addMessage(query, "user");
    setIsLoading(true);
    try {
      // FIXED: Removed "/api" -> Use "/chat"
      console.log(`Sending to: ${API_BASE}/chat`); 
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ query }),
      });
      
      if (res.status === 401 || res.status === 403) {
          addMessage("Session expired. Please log in again.", "bot");
          return;
      }
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      const botResponse = data.response || data.message || JSON.stringify(data);
      addMessage(botResponse, "bot");
    } catch (err) {
      addMessage(`Error: ${err.message}`, "bot");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    const txt = input.trim();
    if (!txt || isLoading) return;
    sendQuery(txt);
    setInput("");
  };

  const handleSuggestion = (text) => {
    if (!isLoading) sendQuery(text);
  };

  const handleVoiceInput = () => {
    if (isListening) return;
    const SpeechAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) return alert("Speech API not supported.");
    const rec = new SpeechAPI();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => setInput(e.results[0][0].transcript);
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  const handleViewHistory = async () => {
    try {
      // FIXED: Removed "/api" -> Use "/chat-history"
      const res = await fetch(`${API_BASE}/chat-history`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error("Failed to fetch history");
      const { history } = await res.json();
      setServerHistory(history);
      setShowHistoryPanel((v) => !v);
    } catch (e) {
      console.error(e);
      alert("Could not load history");
    }
  };

  const handleNewChat = () => {
    const newId = Date.now();
    setChatSessions((prev) => [...prev, { id: newId, messages: [] }]);
    setCurrentSessionId(newId);
    setMessages([]);
    setShowHistoryPanel(false);
    // FIXED: Removed "/api" -> Use "/reset-history"
    fetch(`${API_BASE}/reset-history`, {
      method: "POST",
      headers: getAuthHeader(),
    }).catch(console.error);
  };

  const handleDeleteChat = (sessionId) => {
    if (!window.confirm("Delete this chat?")) return;
    setChatSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      const next = chatSessions.find((s) => s.id !== sessionId);
      if (next) {
        setCurrentSessionId(next.id);
        setMessages(next.messages);
      } else {
        handleNewChat();
      }
    }
    // FIXED: Removed "/api" -> Use "/reset-history"
    fetch(`${API_BASE}/reset-history`, {
      method: "POST",
      headers: getAuthHeader(),
    }).catch(console.error);
  };

  const getChatTitle = (session) => {
    const first = session.messages[0];
    if (!first || !first.time) return "New Chat";
    const date = new Date(first.time);
    if (isNaN(date)) return "New Chat";
    return `Chat - ${date.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short",
    })}`;
  };

  return (
    <div className="chat-wrapper">
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <h2>Chat Sessions</h2>
          <div className="action-bar">
            <button onClick={handleNewChat} className="action-btn">New Chat</button>
            <button onClick={handleViewHistory} className="action-btn">
              <FaHistory /> {showHistoryPanel ? "Hide" : "View"} History
            </button>
          </div>
        </div>
        <ul className="session-list">
          {chatSessions.map((session) => (
            <li
              key={session.id}
              className={`session-item ${session.id === currentSessionId ? "active" : ""}`}
              onClick={() => {
                setCurrentSessionId(session.id);
                setMessages(session.messages);
              }}
            >
              <span>{getChatTitle(session)}</span>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(session.id);
                }}
              >
                <FaTrash />
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="chat-main">
        <div className="bot-header">
          <h2>Computer Science Department</h2>
        </div>
        {showHistoryPanel && (
          <div className="history-panel">
            {serverHistory.length === 0 ? (
              <p><em>No previous conversation.</em></p>
            ) : (
              serverHistory.map(([q, a], i) => (
                <div key={i} className="history-entry">
                  <strong>You:</strong> {q}<br />
                  <strong>Bot:</strong> {a}
                </div>
              ))
            )}
          </div>
        )}
        <div className="suggestions">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              className="suggestion-btn"
              onClick={() => handleSuggestion(s)}
              disabled={isLoading}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.sender}`}>
              <div className="avatar">
                {msg.sender === "user" ? <FaUserCircle /> : <FaRobot />}
              </div>
              <div className="message-content">
                {msg.sender === "bot" ? linkify(msg.text) : <span>{msg.text}</span>}
                <div className="timestamp">{msg.time}</div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message bot">
              <div className="avatar"><FaRobot/></div>
              <div className="message-content">
                <div className="message-text">Loading...</div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSend} className="chat-input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type or speak your message..."
            disabled={isLoading}
          />
          <button
            type="button"
            className="mic-button"
            onClick={handleVoiceInput}
            disabled={isLoading || isListening}
            title={isListening ? "Listening..." : "Speak"}
          >
            <FaMicrophone/>
          </button>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            title="Send"
          >
            <FaPaperPlane/>
          </button>
        </form>
      </div>
    </div>
  );
}