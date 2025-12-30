// src/components/ProfilePage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft } from "@react-icons/all-files/fa/FaArrowLeft";
import { FaUser } from "@react-icons/all-files/fa/FaUser";
import { FaEnvelope } from "@react-icons/all-files/fa/FaEnvelope";
import { FaLock } from "@react-icons/all-files/fa/FaLock";
import { FaCamera } from "@react-icons/all-files/fa/FaCamera";
import { FaUniversity } from "@react-icons/all-files/fa/FaUniversity";
import { FaIdCard } from "@react-icons/all-files/fa/FaIdCard";
import { FaGraduationCap } from "@react-icons/all-files/fa/FaGraduationCap";
import "./ProfilePage.css";

const API_BASE = window.location.hostname === "localhost" 
  ? "http://localhost:5000" 
  : `${window.location.protocol}//${window.location.hostname}:5000`;

export default function ProfilePage({ userEmail, onLogout }) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  
  const [profile, setProfile] = useState({
    name: "",
    email: userEmail || "",
    studentId: "",
    major: "Computer Science",
    profilePicture: "/user_icon.jpg",
    morganConnected: false
  });

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Fetch profile data on mount
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${API_BASE}/api/profile`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      
      // 🔥 FIX: Construct full image URL if not already full URL
      if (data.profilePicture && !data.profilePicture.startsWith('http')) {
        data.profilePicture = `${API_BASE}${data.profilePicture}`;
      }
      
      console.log("Profile loaded:", data); // Debug log
      console.log("Profile picture URL:", data.profilePicture); // Debug log
      
      setProfile(data);
    }
  } catch (error) {
    console.error("Error fetching profile:", error);
  }
};


  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profile.name,
          studentId: profile.studentId,
          major: profile.major
        })
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Profile updated successfully!" });
        setIsEditing(false);
        fetchProfile();
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.detail || "Failed to update profile" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (passwords.newPassword !== passwords.confirmPassword) {
      setMessage({ type: "error", text: "New passwords don't match!" });
      return;
    }

    if (passwords.newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword
        })
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Password changed successfully!" });
        setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setShowPasswordForm(false);
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.detail || "Failed to change password" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("profilePicture", file);

    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/upload-profile-picture`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setProfile({ ...profile, profilePicture: data.url });
        setMessage({ type: "success", text: "Profile picture updated! Refreshing..." });
        
        // 🔥 AUTO-REFRESH to update navbar
        setTimeout(() => window.location.reload(), 1000);
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.detail || "Failed to upload picture" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectMorgan = async () => {
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/connect-morgan`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.ok) {
        setProfile({ ...profile, morganConnected: true });
        setMessage({ type: "success", text: "Morgan State account connected!" });
      } else {
        setMessage({ type: "error", text: "Failed to connect Morgan account" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="back-button" onClick={() => navigate("/")}>
          <FaArrowLeft /> Back to Chat
        </button>
        <h1>Profile Settings</h1>
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="profile-container">
        {/* Profile Picture Section */}
        <div className="profile-picture-section">
          <div className="profile-picture-wrapper">
            <img 
              src={profile.profilePicture} 
              alt="Profile" 
              className="profile-picture"
              onError={(e) => e.target.src = "/user_icon.jpg"}
            />
            <label className="upload-overlay">
              <FaCamera size={24} />
              <input 
                type="file" 
                accept="image/*" 
                onChange={handleProfilePictureUpload}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <h2>{profile.name || profile.email}</h2>
          <p className="profile-email">{profile.email}</p>
        </div>

        {/* Profile Information */}
        <div className="profile-section">
          <div className="section-header">
            <h3>Personal Information</h3>
            {!isEditing && (
              <button className="edit-btn" onClick={() => setIsEditing(true)}>
                Edit
              </button>
            )}
          </div>

          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label>
                <FaUser /> Full Name
              </label>
              <input
                type="text"
                value={profile.name || ""}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                disabled={!isEditing}
                placeholder="Enter your full name"
              />
            </div>

            <div className="form-group">
              <label>
                <FaEnvelope /> Email
              </label>
              <input
                type="email"
                value={profile.email}
                disabled
                className="disabled-input"
              />
            </div>

            <div className="form-group">
              <label>
                <FaIdCard /> Student ID
              </label>
              <input
                type="text"
                value={profile.studentId || ""}
                onChange={(e) => setProfile({ ...profile, studentId: e.target.value })}
                disabled={!isEditing}
                placeholder="Enter your student ID"
              />
            </div>

            <div className="form-group">
              <label>
                <FaGraduationCap /> Major
              </label>
              <select
                value={profile.major || "Computer Science"}
                onChange={(e) => setProfile({ ...profile, major: e.target.value })}
                disabled={!isEditing}
              >
                <option value="Computer Science">Computer Science</option>
                <option value="Information Systems">Information Systems</option>
                <option value="Cybersecurity">Cybersecurity</option>
                <option value="Software Engineering">Software Engineering</option>
                <option value="Data Science">Data Science</option>
              </select>
            </div>

            {isEditing && (
              <div className="form-actions">
                <button type="submit" className="save-btn" disabled={loading}>
                  {loading ? "Saving..." : "Save Changes"}
                </button>
                <button 
                  type="button" 
                  className="cancel-btn" 
                  onClick={() => {
                    setIsEditing(false);
                    fetchProfile();
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </form>
        </div>

        {/* Password Section */}
        <div className="profile-section">
          <div className="section-header">
            <h3>Security</h3>
            {!showPasswordForm && (
              <button className="edit-btn" onClick={() => setShowPasswordForm(true)}>
                Change Password
              </button>
            )}
          </div>

          {showPasswordForm && (
            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label>
                  <FaLock /> Current Password
                </label>
                <input
                  type="password"
                  value={passwords.currentPassword}
                  onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  <FaLock /> New Password
                </label>
                <input
                  type="password"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  <FaLock /> Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwords.confirmPassword}
                  onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  required
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="save-btn" disabled={loading}>
                  {loading ? "Changing..." : "Change Password"}
                </button>
                <button 
                  type="button" 
                  className="cancel-btn" 
                  onClick={() => {
                    setShowPasswordForm(false);
                    setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Morgan Connection */}
        <div className="profile-section">
          <div className="section-header">
            <h3>Morgan State Account</h3>
          </div>
          
          {profile.morganConnected ? (
            <div className="connected-status">
              <FaUniversity size={24} />
              <div>
                <p className="connected-text">✓ Connected to Morgan State</p>
                <p className="connected-subtext">Your account is synced with Morgan State University</p>
              </div>
            </div>
          ) : (
            <button className="connect-btn" onClick={handleConnectMorgan} disabled={loading}>
              <FaUniversity /> Connect Morgan State Account
            </button>
          )}
        </div>

        {/* Logout */}
        <div className="profile-section">
          <button className="logout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
