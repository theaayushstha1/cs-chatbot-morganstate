import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus } from "@react-icons/all-files/fa/FaPlus";
import { FaSearch } from "@react-icons/all-files/fa/FaSearch";
import { FaBook } from "@react-icons/all-files/fa/FaBook";
import { FaTrash } from "@react-icons/all-files/fa/FaTrash";
import { FaUser } from "@react-icons/all-files/fa/FaUser";
import { FaSignOutAlt } from "@react-icons/all-files/fa/FaSignOutAlt";
import { FaEllipsisV } from "@react-icons/all-files/fa/FaEllipsisV";
import { FaThumbtack } from "@react-icons/all-files/fa/FaThumbtack";
import { FaArchive } from "@react-icons/all-files/fa/FaArchive";
import { FaPencilAlt } from "@react-icons/all-files/fa/FaPencilAlt";
import { FaMoon } from "@react-icons/all-files/fa/FaMoon";
import { FaSun } from "@react-icons/all-files/fa/FaSun";
import { FaDownload } from "@react-icons/all-files/fa/FaDownload";
import { FaChevronRight } from "@react-icons/all-files/fa/FaChevronRight";
import "./ChatSidebar.css";

export default function ChatSidebar({ 
  sessions, 
  activeId, 
  onNew, 
  onSelect, 
  onDelete, 
  onLogout, 
  userEmail,
  onPin,
  onArchive,
  onRename,
  darkMode,
  onToggleTheme
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, sessionId: null });
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [profileImageUrl, setProfileImageUrl] = useState(null);
  const navigate = useNavigate();

  // 🔥 Fetch user profile on mount - PRESERVED
  useEffect(() => {
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      // 🔥 API BASE: Handles 5173 vs 5000 logic - PRESERVED
      const API_BASE = window.location.port === "5173" 
        ? "http://localhost:5000" 
        : `${window.location.protocol}//${window.location.hostname}:5000`;

      const response = await fetch(`${API_BASE}/api/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserProfile(data);

        // 🔥 IMAGE URL: Local vs Docker logic - PRESERVED
        if (data.profile_picture_filename) {
          let imageUrl;
          if (window.location.port === "5173") {
            imageUrl = `http://localhost:5000/uploads/profile_pictures/${data.profile_picture_filename}`;
          } else {
            imageUrl = `${window.location.protocol}//${window.location.hostname}:3000/uploads/profile_pictures/${data.profile_picture_filename}`;
          }
          setProfileImageUrl(imageUrl);
        }
      }
    } catch (error) {
      console.error("❌ Error fetching profile:", error);
    }
  };

  // Filter logic - PRESERVED
  const filteredSessions = sessions.filter(s => 
    !s.archived && s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const archivedSessions = sessions.filter(s => s.archived);
  const pinnedSessions = filteredSessions.filter(s => s.pinned);
  const regularSessions = filteredSessions.filter(s => !s.pinned);

  const handleContextMenu = (e, sessionId) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, sessionId });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, sessionId: null });
  };

  const handleRename = (sessionId, currentTitle) => {
    setRenamingId(sessionId);
    setRenameValue(currentTitle);
    closeContextMenu();
  };

  const submitRename = (sessionId) => {
    if (renameValue.trim()) onRename(sessionId, renameValue.trim());
    setRenamingId(null);
    setRenameValue("");
  };

  const handleInstallApp = () => alert("Install App feature - Will be connected later!");
  
  const handleCurriculumClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeContextMenu();
    navigate("/curriculum");
  };

  const handleProfileClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeContextMenu();
    navigate("/profile");
  };

  useEffect(() => {
    if (contextMenu.visible) {
      const handler = (e) => {
        if (!e.target.closest('.context-menu')) closeContextMenu();
      };
      window.addEventListener('click', handler);
      return () => window.removeEventListener('click', handler);
    }
  }, [contextMenu.visible]);

  const renderChatItem = (s, isArchived = false) => {
    if (renamingId === s.id) {
      return (
        <div key={s.id} className="chat-history-item">
          <input
            type="text"
            className="rename-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename(s.id);
              if (e.key === 'Escape') setRenamingId(null);
            }}
            onBlur={() => submitRename(s.id)}
            autoFocus
          />
        </div>
      );
    }

    return (
      <div
        key={s.id}
        className={`chat-history-item ${s.id === activeId ? "active" : ""} ${isArchived ? "archived-item" : ""}`}
        onClick={() => onSelect(s.id)}
        onContextMenu={(e) => handleContextMenu(e, s.id)}
        title={`Select conversation: ${s.title}`} // 🔥 NEW: Hover Text
      >
        {s.pinned && <FaThumbtack className="pin-icon" size={10} />}
        <span className="chat-title">{s.title}</span>
        <button
          className="chat-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleContextMenu(e, s.id);
          }}
          title="Chat options" // 🔥 NEW: Hover Text
          aria-label="More options"
        >
          <FaEllipsisV size={12} />
        </button>
      </div>
    );
  };

  return (
    <div className="chat-sidebar">
      <div className="sidebar-top">
        {/* NEW: Tooltips added to buttons */}
        <button 
          className="sidebar-action-btn new-chat" 
          onClick={onNew}
          title="Start a new chat session" // 🔥 NEW: Hover Text
        >
          <FaPlus size={16} />
          <span>New Chat</span>
        </button>

        <div className="search-container" title="Search through your conversations"> {/* 🔥 NEW: Hover Text */}
          <FaSearch className="search-icon" size={14} />
          <input
            type="text"
            className="search-input"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <button 
          className="sidebar-action-btn curriculum-link" 
          onClick={handleCurriculumClick}
          title="View Computer Science curriculum" // 🔥 NEW: Hover Text
        >
          <FaBook size={16} />
          <span>Curriculum</span>
        </button>
      </div>

      <div className="sidebar-middle">
        {pinnedSessions.length > 0 && (
          <>
            <div className="section-header">Pinned</div>
            <div className="chat-history-section">
              {pinnedSessions.map(s => renderChatItem(s))}
            </div>
          </>
        )}

        <div className="section-header">Chat History</div>
        <div className="chat-history-list">
          {regularSessions.length === 0 ? (
            <div className="empty-state">No chats found</div>
          ) : (
            regularSessions.map(s => renderChatItem(s))
          )}
        </div>

        {archivedSessions.length > 0 && (
          <div className="archived-section-container">
            <button 
              className="archived-header"
              onClick={() => setShowArchived(!showArchived)}
              title="Toggle archived conversations" // 🔥 NEW: Hover Text
            >
              <FaArchive size={14} />
              <span>Archived ({archivedSessions.length})</span>
              <FaChevronRight 
                size={12} 
                className={`chevron-icon ${showArchived ? 'rotated' : ''}`}
              />
            </button>
            {showArchived && (
              <div className="archived-list">
                {archivedSessions.map(s => renderChatItem(s, true))}
              </div>
            )}
          </div>
        )}
      </div>

      {contextMenu.visible && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button className="context-menu-item" onClick={() => { onPin(contextMenu.sessionId); closeContextMenu(); }}>
            <FaThumbtack size={14} />
            <span>{sessions.find(s => s.id === contextMenu.sessionId)?.pinned ? 'Unpin' : 'Pin'} chat</span>
          </button>
          <button className="context-menu-item" onClick={() => {
              const session = sessions.find(s => s.id === contextMenu.sessionId);
              handleRename(contextMenu.sessionId, session?.title || '');
          }}>
            <FaPencilAlt size={14} />
            <span>Rename</span>
          </button>
          <button className="context-menu-item" onClick={() => { onArchive(contextMenu.sessionId); closeContextMenu(); }}>
            <FaArchive size={14} />
            <span>{sessions.find(s => s.id === contextMenu.sessionId)?.archived ? 'Unarchive' : 'Archive'}</span>
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item danger" onClick={() => { onDelete(contextMenu.sessionId); closeContextMenu(); }}>
            <FaTrash size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}

      <div className="sidebar-bottom">
        <div className="sidebar-settings">
          <button 
            className="setting-btn" 
            onClick={onToggleTheme}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"} // 🔥 NEW: Hover Text
          >
            {darkMode ? <FaSun size={18} /> : <FaMoon size={18} />}
            <span>{darkMode ? "Light" : "Dark"} Mode</span>
          </button>

          <button 
            className="setting-btn install-app-btn" 
            onClick={handleInstallApp}
            title="Download desktop application" // 🔥 NEW: Hover Text
          >
            <FaDownload size={18} />
            <span>Install App</span>
          </button>
        </div>

        <div 
          className="user-profile" 
          onClick={handleProfileClick}
          title="Open your profile and account settings" // 🔥 NEW: Hover Text
        >
          <div className="user-avatar">
            {profileImageUrl ? (
              <>
                <img 
                  src={profileImageUrl} 
                  alt="Profile" 
                  className="profile-picture"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const fallback = e.target.parentElement.querySelector('.fallback-user-icon');
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div className="fallback-user-icon" style={{ display: 'none' }}><FaUser size={18} /></div>
              </>
            ) : (
              <div className="fallback-user-icon"><FaUser size={18} /></div>
            )}
          </div>
          <div className="user-info">
            <div className="user-email">{userProfile?.email || userEmail || "User"}</div>
            <div className="user-status">Free Plan</div>
          </div>
          <button 
            className="logout-icon-btn" 
            onClick={(e) => {
              e.stopPropagation();
              onLogout();
            }}
            title="Sign out of CS Navigator" // 🔥 NEW: Hover Text
          >
            <FaSignOutAlt size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}