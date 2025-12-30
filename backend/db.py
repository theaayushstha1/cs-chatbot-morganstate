# backend/db.py
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load environment variables from parent directory
BASE_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.dirname(BASE_DIR)  # Go up one level to find .env
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")

print(f"📁 BASE_DIR: {BASE_DIR}")
print(f"📁 PROJECT_ROOT: {PROJECT_ROOT}")
print(f"🔌 CONNECTING TO DATABASE: {DATABASE_URL}")

if not DATABASE_URL:
    # Fallback to SQLite if DATABASE_URL is not set
    DATABASE_URL = "sqlite:///./cs_chatbot.db"
    print(f"❌ ERROR: DATABASE_URL is missing. Using SQLite fallback: {DATABASE_URL}")
else:
    print(f"✅ DATABASE_URL loaded successfully!")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    pool_pre_ping=True,  # Verify connections before using them
    pool_recycle=3600    # Recycle connections after 1 hour
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
