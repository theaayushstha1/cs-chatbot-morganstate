import React, { useState, useEffect, useRef, useMemo } from "react";
import { FaMicrophone } from "@react-icons/all-files/fa/FaMicrophone";
import { FaPaperPlane } from "@react-icons/all-files/fa/FaPaperPlane";
import "./Chatbox.css";

const SUGGESTIONS = [
  "Who is the chair of computer science?",
  "What are the degree requirements?",
  "When do classes start for Fall 2025?"
];

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
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="message-link">
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
        const m = piece.match(/^(https?:\/\/[^\s.,;!?)]+[^\s.,;!?)])([.,;!?)])?$/);
        if (m) {
          const url = m[1];
          const trailing = m[2] || "";
          return (
            <React.Fragment key={`${idx}-${j}`}>
              <a href={url} target="_blank" rel="noopener noreferrer" className="message-link">
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

export default function Chatbox({ initialMessages = [], onSessionChange }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [userProfilePicture, setUserProfilePicture] = useState("/user_icon.jpg");
  
  const messagesEndRef = useRef(null);
  const prevMessagesRef = useRef(initialMessages);

  // FIXED: Reset messages when switching chats
  useEffect(() => {
    setMessages(initialMessages);
    prevMessagesRef.current = initialMessages;
  }, [initialMessages]);

  // 🔥 FIX: Fetch user profile picture IMMEDIATELY on mount
  useEffect(() => {
    const fetchUserProfile = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        console.log("❌ No token found, skipping profile fetch");
        return;
      }

      try {
        const API_BASE = window.location.port === "5173" 
          ? "http://localhost:5000" 
          : `${window.location.protocol}//${window.location.hostname}:5000`;

        console.log("🔵 Chatbox: Fetching profile from:", `${API_BASE}/api/profile`);

        const response = await fetch(`${API_BASE}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          console.log("🔵 Chatbox: Profile data:", data);
          
          if (data.profile_picture_filename) {
            const imageUrl = `${API_BASE}/uploads/profile_pictures/${data.profile_picture_filename}`;
            setUserProfilePicture(imageUrl);
            console.log("✅ Chatbox profile picture set to:", imageUrl);
          } else {
            console.log("⚠️ No profile_picture_filename in response");
          }
        } else {
          console.error("❌ Profile fetch failed:", response.status);
        }
      } catch (error) {
        console.error("❌ Error fetching profile:", error);
      }
    };

    fetchUserProfile();
  }, []); // Empty deps = runs once on mount

  // 🔥 FIXED: Update parent only when messages actually change (avoid infinite loop)
  useEffect(() => {
    if (!onSessionChange) return;
    if (JSON.stringify(messages) === JSON.stringify(prevMessagesRef.current)) return;
    
    onSessionChange(messages);
    prevMessagesRef.current = messages;
  }, [messages]);

  const API_BASE = useMemo(() => {
    if (window.location.port === "5173") return "http://localhost:5000";
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }, []);

  const getAuthHeader = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (text, sender) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { text, sender, time }]);
  };

  const sendQuery = async (query) => {
    addMessage(query, "user");
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ query }),
      });

      if (res.status === 401 || res.status === 403) {
        addMessage("⚠️ Session expired. Please log in again.", "bot");
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
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
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

  return (
    <div className="chat-main">
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="welcome-container">
            <img src="/msu_logo.png" alt="MSU Logo" className="welcome-logo" />
            <h1 className="welcome-title">Morgan State CS Navigator</h1>
            <p className="welcome-subtitle">How can I assist with your academic journey today?</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-btn"
                  style={{
                    margin: '5px', padding: '10px 15px', border: '1px solid #E5E7EB',
                    borderRadius: '20px', background: 'white', cursor: 'pointer', color: '#002D72'
                  }}
                  onClick={() => handleSuggestion(s)}
                  disabled={isLoading}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message ${msg.sender}`}>
              <img 
                src={msg.sender === "user" ? userProfilePicture : "/bot_avatar.jpg"} 
                alt={msg.sender} 
                className="avatar-img"
                onError={(e) => {
                  if (msg.sender === "user") {
                    console.error("❌ Image failed to load:", e.target.src);
                    e.target.src = "/user_icon.jpg";
                  }
                }}
              />
              <div className="message-content">
                <div className="message-bubble">
                  {msg.sender === "bot" ? linkify(msg.text) : <span>{msg.text}</span>}
                </div>
                <div className="timestamp">{msg.time}</div>
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="message bot">
            <img src="/bot_avatar.jpg" alt="Bot" className="avatar-img" />
            <div className="message-content">
              <div className="message-bubble" style={{ fontStyle: "italic", color: "#6B7280" }}>
                Typing...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSend} className="chat-input-wrapper">
          <button
            type="button"
            className="action-btn-icon"
            onClick={handleVoiceInput}
            disabled={isLoading || isListening}
            style={{ color: isListening ? '#EF4444' : 'inherit' }}
          >
            <FaMicrophone size={18} />
          </button>
          
          <input
            type="text"
            className="chat-input-field"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
          />
          
          <button
            type="submit"
            className="action-btn-icon send-btn"
            disabled={isLoading || !input.trim()}
          >
            <FaPaperPlane size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
