import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FaBars } from "@react-icons/all-files/fa/FaBars";
import { FaUser } from "@react-icons/all-files/fa/FaUser";
import { FaUserShield } from "@react-icons/all-files/fa/FaUserShield";
import "../index.css";
import "./NavBar.css";

import { getApiBase } from "../lib/apiBase";
const API_BASE = getApiBase();
export default function NavBar({ role, onToggleSidebar }) {
  const [scrolled, setScrolled] = useState(false);
  const [profilePicture, setProfilePicture] = useState("/user_icon.webp");
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch user profile picture - PRESERVED
  useEffect(() => {
    if (role) {
      fetchProfilePicture();
    }
  }, [role]);

  const fetchProfilePicture = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/profile`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();

        // 🔥 FIXED: Handle base64 data URLs, full URLs, and relative paths
        let pictureUrl = data.profilePicture || "/user_icon.webp";
        if (pictureUrl) {
          if (pictureUrl.startsWith('data:')) {
            // Base64 data URL - use directly
          } else if (pictureUrl.startsWith('http')) {
            // Full URL - use directly
          } else if (pictureUrl.startsWith('/user_icon.webp')) {
            // Default icon - use directly
          } else {
            // Relative path - prepend API base
            pictureUrl = `${API_BASE}${pictureUrl}`;
          }
        }

        console.log("✅ Navbar profile picture loaded");
        setProfilePicture(pictureUrl);
      }
    } catch (error) {
      console.error("❌ Error fetching profile picture:", error);
    }
  };

  const linkClass = ({ isActive }) => "nav-link" + (isActive ? " active" : "");
  const isAuthed = useMemo(() => Boolean(role), [role]);

  return (
    <nav className={`navbar ${scrolled ? "scrolled" : ""}`}>
      <div className="nav-container">
        {/* Always-visible sidebar toggle so users can find it without hovering. */}
        {isAuthed && (
          <button
            type="button"
            className="sidebar-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSidebar();
            }}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <FaBars size={20} />
          </button>
        )}

        {/* Left side - logo and title - CLICKABLE */}
        <div
          className="navbar-left"
          onClick={() => navigate(isAuthed ? "/chat" : "/")}
          style={{ cursor: 'pointer' }}
          title={isAuthed ? "Go to Chat" : "Return to Home"}
        >
          <img
            src="/msu_logo.webp"
            alt="Morgan State University"
            className="nav-logo"
          />

          <div className="nav-title">
            <span className="brand-main">CS NAVIGATOR</span>
            <span className="brand-sub">Morgan State University</span>
          </div>
        </div>

        {/* Right side - Profile icon when authenticated */}
        {isAuthed && (
          <div className="navbar-right">
            {role === "admin" && (
              <button
                type="button"
                className="admin-nav-btn"
                onClick={() => navigate("/admin")}
                title="Open admin dashboard"
                aria-label="Open admin dashboard"
              >
                <FaUserShield size={16} />
                <span>Admin</span>
              </button>
            )}
            <button
              className="profile-icon-btn"
              onClick={() => navigate("/profile")}
              title="Manage User Profile"
              aria-label="Open profile settings"
            >
              <img
                src={profilePicture}
                alt="Profile"
                className="profile-avatar"
                onError={(e) => {
                  console.log("❌ Image failed to load, showing fallback");
                  e.target.style.display = 'none';
                  const fallback = e.target.nextElementSibling;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
              <div className="profile-icon-fallback">
                <FaUser size={18} />
              </div>
            </button>
          </div>
        )}

        {/* Show links only when NOT authenticated */}
        {!isAuthed && (
          <div className="nav-links" aria-label="Primary navigation">
            <NavLink to="/trychat" className="nav-link try-free-link">
              Try Free
            </NavLink>

            <NavLink to="/login" className={linkClass}>
              Login
            </NavLink>

            <NavLink to="/signup" className="btn-primary nav-cta">
              Sign Up
            </NavLink>
          </div>
        )}
      </div>
    </nav>
  );
}
