import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FaBars } from "@react-icons/all-files/fa/FaBars";
import { FaUser } from "@react-icons/all-files/fa/FaUser";
import "../index.css";
import "./NavBar.css";

const API_BASE = window.location.hostname === "localhost" 
  ? "http://localhost:5000" 
  : `${window.location.protocol}//${window.location.hostname}:5000`;

export default function NavBar({ role, onToggleSidebar }) {
  const [scrolled, setScrolled] = useState(false);
  const [profilePicture, setProfilePicture] = useState("/user_icon.jpg");
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch user profile picture
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
        
        // Construct full image URL
        let pictureUrl = data.profilePicture || "/user_icon.jpg";
        if (pictureUrl && !pictureUrl.startsWith('http') && !pictureUrl.startsWith('/user_icon')) {
          pictureUrl = `${API_BASE}${pictureUrl}`;
        }
        
        console.log("✅ Navbar profile picture:", pictureUrl);
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
        {/* Left side - logo and title - CLICKABLE */}
        <div 
          className="navbar-left" 
          onClick={() => navigate("/")}
          style={{ cursor: 'pointer' }}
        >
          {isAuthed && (
            <button 
              type="button"
              className="logo-hamburger-toggle" 
              onClick={(e) => {
                e.stopPropagation();
                onToggleSidebar();
              }}
              aria-label="Toggle sidebar"
            >
              <img 
                src="/msu_logo.png" 
                alt="Morgan State University" 
                className="nav-logo-image"
              />
              <div className="hamburger-overlay">
                <FaBars size={24} />
              </div>
            </button>
          )}
          
          {!isAuthed && (
            <img src="/msu_logo.png" alt="Morgan State University" className="nav-logo" />
          )}
          
          <div className="nav-title">
            <span className="brand-main">CS NAVIGATOR</span>
            <span className="brand-sub">Morgan State University</span>
          </div>
        </div>

        {/* Right side - Profile icon when authenticated */}
        {isAuthed && (
          <div className="navbar-right">
            <button 
              className="profile-icon-btn" 
              onClick={() => navigate("/profile")}
              title="Profile Settings"
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
