# backend/models.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="student")  # "admin" or "student"
    
    # 🔥 NEW: Profile fields
    name = Column(String(255), nullable=True)
    student_id = Column(String(50), nullable=True)
    major = Column(String(100), nullable=True, default="Computer Science")
    profile_picture = Column(String(500), nullable=True, default="/user_icon.jpg")
    morgan_connected = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)