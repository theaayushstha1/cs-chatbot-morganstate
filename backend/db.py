# backend/db.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# 🚨 THE CRITICAL FIX: Read the variable from Docker
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# Debugging: This MUST appear in your logs
print(f"🔌 CONNECTING TO DATABASE: {SQLALCHEMY_DATABASE_URL}")

if not SQLALCHEMY_DATABASE_URL:
    # Fallback for safety (prevents "localhost" error)
    print("❌ ERROR: DATABASE_URL is missing. Checking for fallback...")
    raise ValueError("DATABASE_URL is missing! Check docker-compose.yml")

# Create Engine
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,  # Helps keep AWS connection alive
    pool_recycle=3600
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()