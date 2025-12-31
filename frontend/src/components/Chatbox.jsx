import React, { useState, useEffect, useRef } from "react";
import { FaMicrophone } from "@react-icons/all-files/fa/FaMicrophone";
import { FaPaperPlane } from "@react-icons/all-files/fa/FaPaperPlane";
import { FaPaperclip } from "@react-icons/all-files/fa/FaPaperclip";
import { FaVolumeUp } from "@react-icons/all-files/fa/FaVolumeUp";
import { FaTimes } from "@react-icons/all-files/fa/FaTimes";

// 🔥 Icons for File Cards
import { FaFile } from "@react-icons/all-files/fa/FaFile";
import { FaFilePdf } from "@react-icons/all-files/fa/FaFilePdf";
import { FaFileWord } from "@react-icons/all-files/fa/FaFileWord";
import { FaFileImage } from "@react-icons/all-files/fa/FaFileImage";

import "./Chatbox.css";

const SUGGESTIONS = [
  "Who is the chair of computer science?",
  "What are the degree requirements?",
  "When do classes start for Fall 2025?"
];

// --- SMART API SWITCHING ---
// 🔥 SMART CONFIG: Check the browser URL to pick the right backend
const hostname = window.location.hostname;
const API_BASE = (hostname === "localhost" || hostname === "127.0.0.1")
  ? "http://127.0.0.1:8000"           // If on Laptop -> Use Local Backend (8000)
  : "http://18.214.136.155:5000";     // If on AWS -> Use AWS Backend (5000)
const getFileIcon = (filename) => {
  if (!filename) return <FaFile className="file-icon generic" />;
  const ext = filename.split('.').pop().toLowerCase();
  
  if (ext === 'pdf') return <FaFilePdf className="file-icon pdf" />;
  if (['doc', 'docx'].includes(ext)) return <FaFileWord className="file-icon word" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <FaFileImage className="file-icon image" />;
  
  return <FaFile className="file-icon generic" />;
};

// 🔥 HELPER: Render text with Professional File Cards & Clickable Links
function linkify(text) {
  if (!text) return null;
  
  // Regex to find Markdown links: [Label](URL)
  const mdRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g; 
  const parts = text.split(mdRegex);
  const nodes = [];

  for (let i = 0; i < parts.length; ) {
    if (i % 3 === 0) {
      // Normal text
      nodes.push(<span key={i}>{parts[i]}</span>);
      i += 1;
    } else {
      const label = parts[i];
      const url = parts[i + 1];
      
      // Check if this link points to our backend file storage
      const isFile = url.includes("uploads/chat_files") || url.includes("uploads/profile_pictures");
      
      if (isFile) {
        // Render a Professional File Card
        nodes.push(
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="file-card">
            <div className="file-icon-wrapper">
              {getFileIcon(label)}
            </div>
            <div className="file-info">
              <span className="file-name">{label}</span>
              <span className="file-action">Click to view file</span>
            </div>
          </a>
        );
      } else {
        // Normal External Link
        nodes.push(
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="message-link">
            {label}
          </a>
        );
      }
      i += 2;
    }
  }
  
  // Second pass: Auto-link raw URLs if they weren't in markdown format (optional, keeping simple for now)
  return nodes; 
}

export default function Chatbox({ initialMessages = [], onSessionChange, sessionId }) {
  // --- STATE ---
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [userProfilePicture, setUserProfilePicture] = useState("/user_icon.jpg");
  
  // 🔥 Staging State for File Uploads
  const [pendingFile, setPendingFile] = useState(null);

  // --- REFS ---
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const isRemoteUpdate = useRef(false);

  // --- EFFECTS ---

  // 1. Focus input on load
  useEffect(() => { 
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    window.addEventListener('focus', focusInput);
    return () => window.removeEventListener('focus', focusInput);
  }, []);

  // 2. Sync Messages FROM Parent (Database Load)
  useEffect(() => {
    if (JSON.stringify(initialMessages) !== JSON.stringify(messages)) {
      isRemoteUpdate.current = true;
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // 3. Sync Messages TO Parent (User typed something)
  useEffect(() => {
    if (!onSessionChange) return;
    if (isRemoteUpdate.current) { 
        isRemoteUpdate.current = false; 
        return; 
    }
    onSessionChange(messages);
  }, [messages, onSessionChange]);

  // 4. Auto-Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 5. Fetch User Profile Picture
  useEffect(() => {
    const fetchUserProfile = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const response = await fetch(`${API_BASE}/api/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.profilePicture) {
             const picUrl = data.profilePicture.startsWith("http") 
                ? data.profilePicture 
                : `${API_BASE}${data.profilePicture}`;
             setUserProfilePicture(picUrl);
          }
        }
      } catch (error) { 
        console.error("❌ Profile Error:", error); 
      }
    };
    fetchUserProfile();
  }, []);

  // --- HANDLERS ---

  // Text-to-Speech
  const speak = (text) => {
    if (!window.speechSynthesis) return alert("Text-to-speech not supported.");
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  // Helper to add message to local state
  const addMessage = (text, sender) => {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { text, sender, time }]);
  };

  // Handle File Selection (Staging)
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setPendingFile(e.target.files[0]);
    }
    // Reset value so onChange triggers again if same file selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Clear Staged File
  const clearFile = () => {
    setPendingFile(null);
  };

  // Handle Voice Input
  const handleVoiceInput = () => {
    if (isListening) return;
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) return alert("Speech API not supported.");
    
    const rec = new SpeechAPI();
    rec.lang = "en-US";
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => setInput(e.results[0][0].transcript);
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  const handleSuggestion = (text) => {
      if (!isLoading) {
          // Send immediately logic could go here, but for now populating input is safer
          setInput(text);
          inputRef.current?.focus();
      }
  };

  // 🔥 MAIN SEND LOGIC
  const handleSend = async (e) => {
    e.preventDefault();
    if ((!input.trim() && !pendingFile) || isLoading) return;

    setIsLoading(true);
    let finalMessage = input.trim();

    try {
        const token = localStorage.getItem("token");

        // 1. Upload File (if exists)
        if (pendingFile) {
            const formData = new FormData();
            formData.append("file", pendingFile);

            const uploadRes = await fetch(`${API_BASE}/api/upload-file`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });

            if (uploadRes.ok) {
                const data = await uploadRes.json();
                const fullUrl = data.url.startsWith("http") ? data.url : `${API_BASE}${data.url}`;
                
                // Create Markdown Link: [filename](url)
                const fileMarkdown = `[${data.filename}](${fullUrl})`;
                
                // Append to message
                if (finalMessage) {
                    finalMessage = `${fileMarkdown}\n${finalMessage}`;
                } else {
                    finalMessage = fileMarkdown;
                }
            } else {
                alert("File upload failed. Sending text only.");
            }
        }

        // 2. Optimistic UI Update
        addMessage(finalMessage, "user");
        setInput("");
        setPendingFile(null);

        // 3. Send to Chat API
        const res = await fetch(`${API_BASE}/chat`, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json", 
                "Authorization": `Bearer ${token}` 
            },
            body: JSON.stringify({ 
                query: finalMessage, 
                session_id: sessionId || "default" 
            }),
        });

        if (res.status === 401 || res.status === 403) {
            addMessage("⚠️ Session expired. Please log in again.", "bot");
            return;
        }
        
        if (!res.ok) throw new Error(res.statusText);
        
        const data = await res.json();
        const botResponse = data.response || data.message || "No response.";
        
        addMessage(botResponse, "bot");

    } catch (err) {
        addMessage("Error: " + err.message, "bot");
    } finally {
        setIsLoading(false);
        // Regain focus
        setTimeout(() => inputRef.current?.focus(), 100);
    }
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
                <button key={i} className="suggestion-btn" onClick={() => handleSuggestion(s)} disabled={isLoading}>
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
                onError={(e) => { if (msg.sender === "user") e.target.src = "/user_icon.jpg"; }}
              />
              <div className="message-content">
                <div className="message-bubble">
                  {/* Apply Linkify to render File Cards properly */}
                  {linkify(msg.text)}
                  
                  {msg.sender === "bot" && (
                    <button 
                      className="tts-btn" 
                      onClick={() => speak(msg.text)} 
                      title="Read response aloud"
                    >
                      <FaVolumeUp size={14}/>
                    </button>
                  )}
                </div>
                <div className="timestamp">{msg.time}</div>
              </div>
            </div>
          ))
        )}
        
        {/* Typing Indicator */}
        {isLoading && (
          <div className="message bot">
            <img src="/bot_avatar.jpg" alt="Bot" className="avatar-img" />
            <div className="message-content">
              <div className="message-bubble typing-bubble">
                <div className="dot"></div><div className="dot"></div><div className="dot"></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSend} className="chat-input-wrapper">
          
          {/* 🔥 STAGING AREA: Shows file before sending */}
          {pendingFile && (
            <div className="attachment-preview">
              {getFileIcon(pendingFile.name)}
              <span className="file-name-preview">{pendingFile.name}</span>
              <button 
                type="button" 
                className="remove-attachment-btn" 
                onClick={clearFile}
                title="Remove file"
              >
                <FaTimes />
              </button>
            </div>
          )}

          <div className="input-row">
            <button 
                type="button" 
                className="action-btn-icon" 
                onClick={() => fileInputRef.current.click()} 
                title="Attach a file"
                disabled={isLoading}
            >
                <FaPaperclip size={18} />
            </button>
            
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileSelect} 
            />

            <button
                type="button"
                className="action-btn-icon"
                onClick={handleVoiceInput}
                title="Voice input"
                disabled={isLoading || isListening}
                style={{ color: isListening ? '#EF4444' : 'inherit' }}
            >
                <FaMicrophone size={18} />
            </button>
            
            <input
                type="text"
                ref={inputRef}
                className="chat-input-field"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={pendingFile ? "Add a message..." : "Type your message..."}
                disabled={isLoading}
            />
            
            <button
                type="submit"
                className="action-btn-icon send-btn"
                title="Send message"
                disabled={isLoading || (!input.trim() && !pendingFile)}
            >
                <FaPaperPlane size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}