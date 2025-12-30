# backend/main.py
print("✅✅✅ main.py loaded successfully")

import os
import re
import json
from typing import List, Tuple, Dict, Any, Optional
import time
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError

# LangChain
from langchain.text_splitter import TokenTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_community.chat_models import ChatOpenAI
from langchain.chains import RetrievalQA

# Pinecone
from pinecone import Pinecone

# ─── Auth & DB ─────────────────────────────────────────────────────────
from db import SessionLocal, engine, Base
from models import User
from security import hash_password, verify_password, create_access_token
from jose import JWTError, jwt

# ─── Env ───────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.dirname(BASE_DIR)  # Go up one level to find .env
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

print(f"📁 BASE_DIR: {BASE_DIR}")
print(f"📁 PROJECT_ROOT: {PROJECT_ROOT}")

PINECONE_API_KEY   = os.getenv("PINECONE_API_KEY")
PINECONE_ENV       = os.getenv("PINECONE_ENV")
PINECONE_INDEX     = os.getenv("PINECONE_INDEX_NAME")
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "docs")
OPENAI_API_KEY     = os.getenv("OPENAI_API_KEY")
JWT_SECRET         = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-CHANGE-THIS")
ALGORITHM          = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 240

# Upload configuration
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads", "profile_pictures")
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
    print(f"✅ Created upload folder: {UPLOAD_FOLDER}")

# Only warn about missing API keys (don't crash)
if not all([PINECONE_API_KEY, PINECONE_ENV, PINECONE_INDEX, OPENAI_API_KEY]):
    print("⚠️ WARNING: Some API keys are missing. Chatbot features will be limited.")

# DB tables
def init_db():
    retries = 5
    while retries > 0:
        try:
            Base.metadata.create_all(bind=engine)
            print("✅ Database tables initialized.")
            break
        except OperationalError:
            print(f"⏳ Waiting for Database... ({retries} retries left)")
            retries -= 1
            time.sleep(5)

init_db()

# ─── FastAPI ───────────────────────────────────────────────────────────
app = FastAPI(title="CS Chatbot API", version="1.0.0")

# --- 🚨 CORS FIX: Allow ALL Origins 🚨 ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Trusted Host: Allow ALL Hosts ---
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"]
)

# Mount static files for profile pictures
# Mount static files for profile pictures - BEFORE app routes
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
if os.path.exists(UPLOADS_DIR):
    try:
        app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
        print(f"✅ Static files mounted: /uploads -> {UPLOADS_DIR}")
        
        # List some files to verify
        pic_dir = os.path.join(UPLOADS_DIR, "profile_pictures")
        if os.path.exists(pic_dir):
            files = os.listdir(pic_dir)
            print(f"📸 Profile pictures found: {len(files)}")
            if files:
                print(f"   Example: {files[0]}")
    except Exception as e:
        print(f"❌ Error mounting static files: {e}")
else:
    print(f"⚠️ Uploads directory not found: {UPLOADS_DIR}")
    os.makedirs(UPLOADS_DIR)
    print(f"✅ Created uploads directory: {UPLOADS_DIR}")


security = HTTPBearer()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Dict[str,Any]:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        user_email = payload.get("email")
        if not user_email:
            raise HTTPException(status_code=403, detail="Invalid token")
        
        # Get user from database
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            raise HTTPException(status_code=403, detail="User not found")
        
        return {
            "user_id": user.id,
            "email": user.email,
            "role": user.role
        }
    except JWTError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ─── Schemas ───────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class QueryRequest(BaseModel):
    query: str

class Course(BaseModel):
    course_code: str
    course_name: str
    credits: int
    prerequisites: List[str] = []
    offered: List[str] = []

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    studentId: Optional[str] = None
    major: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    currentPassword: str
    newPassword: str

# ─── In-memory chat history ────────────────────────────────────────────
chat_history: List[Tuple[str, str]] = []

# ─── Static data ───────────────────────────────────────────────────────
DATA_DIR       = os.path.join(BASE_DIR, "data_sources")
CLASSES_FILE   = os.path.join(DATA_DIR, "classes.json")
RESOURCES_FILE = os.path.join(DATA_DIR, "academic_resources.json")

# Safe load resources
helpful_links = {}
if os.path.exists(RESOURCES_FILE):
    try:
        with open(RESOURCES_FILE, "r", encoding="utf-8") as f:
            res_data = json.load(f)
        helpful_links = res_data.get("academic_and_student_support", {}).get("helpful_links", {})
    except:
        pass

# ─── Auth endpoints ────────────────────────────────────────────────────
@app.post("/api/register", status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = hash_password(req.password)
    student = User(email=req.email, password_hash=hashed, role="student")
    db.add(student)
    db.commit()
    db.refresh(student)
    return {"message": "Student account created", "user_id": student.id}

@app.post("/api/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({
        "user_id": user.id,
        "role": user.role,
        "email": user.email
    })
    return {"access_token": token, "token_type": "bearer"}

# ==================== 🔥 PROFILE ROUTES 🔥 ====================

@app.get("/api/profile")
async def get_profile(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get user profile information"""
    try:
        db_user = db.query(User).filter(User.email == user["email"]).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return {
            "email": db_user.email,
            "name": db_user.name if hasattr(db_user, 'name') else None,
            "studentId": db_user.student_id if hasattr(db_user, 'student_id') else None,
            "major": db_user.major if hasattr(db_user, 'major') else "Computer Science",
            "profilePicture": db_user.profile_picture if hasattr(db_user, 'profile_picture') else "/user_icon.jpg",
            "morganConnected": db_user.morgan_connected if hasattr(db_user, 'morgan_connected') else False,
            "created_at": db_user.created_at.isoformat() if hasattr(db_user, 'created_at') and db_user.created_at else None
        }
    except Exception as e:
        print(f"❌ Profile fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/profile")
async def update_profile(
    req: ProfileUpdateRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile information"""
    try:
        db_user = db.query(User).filter(User.email == user["email"]).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if req.name is not None and hasattr(db_user, 'name'):
            db_user.name = req.name
        if req.studentId is not None and hasattr(db_user, 'student_id'):
            db_user.student_id = req.studentId
        if req.major is not None and hasattr(db_user, 'major'):
            db_user.major = req.major
        
        db.commit()
        db.refresh(db_user)
        
        return {
            "message": "Profile updated successfully",
            "name": db_user.name if hasattr(db_user, 'name') else None,
            "studentId": db_user.student_id if hasattr(db_user, 'student_id') else None,
            "major": db_user.major if hasattr(db_user, 'major') else "Computer Science"
        }
    except Exception as e:
        print(f"❌ Profile update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/change-password")
async def change_password(
    req: PasswordChangeRequest,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user password"""
    try:
        if len(req.newPassword) < 6:
            raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
        
        db_user = db.query(User).filter(User.email == user["email"]).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        if not verify_password(req.currentPassword, db_user.password_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        
        db_user.password_hash = hash_password(req.newPassword)
        db.commit()
        
        return {"message": "Password changed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Password change error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/upload-profile-picture")
async def upload_profile_picture(
    profilePicture: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload user profile picture"""
    try:
        if not profilePicture.filename:
            raise HTTPException(status_code=400, detail="No file selected")
        
        if not allowed_file(profilePicture.filename):
            raise HTTPException(status_code=400, detail="Invalid file type. Use PNG, JPG, or GIF")
        
        # Create unique filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename_safe = user["email"].split('@')[0]
        ext = profilePicture.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{filename_safe}_{timestamp}.{ext}"
        filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
        
        # Save file
        with open(filepath, "wb") as f:
            content = await profilePicture.read()
            f.write(content)
        
        print(f"✅ Profile picture saved: {filepath}")
        
        # Update database
        picture_url = f"/uploads/profile_pictures/{unique_filename}"
        db_user = db.query(User).filter(User.email == user["email"]).first()
        if db_user and hasattr(db_user, 'profile_picture'):
            db_user.profile_picture = picture_url
            db.commit()
        
        return {
            "message": "Profile picture uploaded successfully",
            "url": picture_url
        }
    except Exception as e:
        print(f"❌ Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/connect-morgan")
async def connect_morgan(
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Connect Morgan State account (OAuth placeholder)"""
    try:
        db_user = db.query(User).filter(User.email == user["email"]).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # TODO: Implement actual OAuth flow with Morgan State SSO
        if hasattr(db_user, 'morgan_connected'):
            db_user.morgan_connected = True
            db.commit()
        
        return {
            "message": "Morgan State account connected successfully",
            "morganConnected": True
        }
    except Exception as e:
        print(f"❌ Morgan connection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── Pinecone + Retrieval globals ──────────────────────────────────────
pc = None
retriever = None
qa = None
llm = None

if PINECONE_API_KEY and OPENAI_API_KEY:
    pc = Pinecone(api_key=PINECONE_API_KEY)

@app.on_event("startup")
def build_qa_chain():
    global retriever, qa, llm
    if not all([PINECONE_API_KEY, OPENAI_API_KEY, PINECONE_INDEX]):
        print("⚠️ Skipping QA chain initialization - missing API keys")
        return
    
    try:
        embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
            openai_api_key=OPENAI_API_KEY,
        )
        store = PineconeVectorStore.from_existing_index(
            index_name=PINECONE_INDEX,
            embedding=embeddings,
            namespace=PINECONE_NAMESPACE,
        )
        retriever = store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": 8}
        )
        llm = ChatOpenAI(
            openai_api_key=OPENAI_API_KEY,
            model_name="gpt-3.5-turbo",
            temperature=0
        )
        qa = RetrievalQA.from_chain_type(
            llm=llm,
            chain_type="stuff",
            retriever=retriever,
            return_source_documents=True
        )
        print("✅ QA Chain built successfully")
    except Exception as e:
        print(f"⚠️ Error building QA Chain: {e}")

# ─── Curriculum endpoints ──────────────────────────────────────────────
@app.post("/api/curriculum/add")
async def add_course(course: Course, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    arr = json.load(open(CLASSES_FILE, encoding="utf-8"))
    if not isinstance(arr, list):
        raise HTTPException(status_code=500, detail="classes.json malformed")
    arr.append(course.dict())
    json.dump(arr, open(CLASSES_FILE, "w", encoding="utf-8"), indent=2)
    return {"message": "Course added", "course": course}

@app.delete("/api/curriculum/delete/{code}")
async def delete_course(code: str, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    arr = json.load(open(CLASSES_FILE, encoding="utf-8"))
    filtered = [c for c in arr if c.get("course_code") != code]
    if len(filtered) == len(arr):
        raise HTTPException(status_code=404, detail=f"{code} not found")
    json.dump(filtered, open(CLASSES_FILE, "w", encoding="utf-8"), indent=2)
    return {"message": f"{code} deleted"}

@app.get("/api/curriculum")
async def get_curriculum():
    try:
        data = json.load(open(CLASSES_FILE, encoding="utf-8"))
        if isinstance(data, list):
            return data
        for key in ("computer_science_courses","courses","classes"):
            arr = data.get(key)
            if isinstance(arr,list):
                return arr
        cs = data.get("computer_science_courses")
        if isinstance(cs,dict) and isinstance(cs.get("computer_science_courses"),list):
            return cs["computer_science_courses"]
        return []
    except FileNotFoundError:
        return []
    except json.JSONDecodeError as e:
        raise HTTPException(500,f"JSON parse error: {e}")

# ─── Ingest & index management ─────────────────────────────────────────
@app.post("/ingest")
async def ingest_data_endpoint(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    files = [
        os.path.join(DATA_DIR, fn)
        for fn in sorted(os.listdir(DATA_DIR))
        if fn.lower().endswith(".json")
    ]

    raw = []
    for p in files:
        raw.extend(load_json_documents([p]))

    splitter = TokenTextSplitter(chunk_size=800, chunk_overlap=160, model_name="gpt-3.5-turbo")
    texts, metas = [], []
    for doc in raw:
        for chunk in splitter.split_text(doc["text"]):
            texts.append(chunk)
            metas.append({"source": os.path.basename(doc["source"])})

    embeddings = OpenAIEmbeddings(model="text-embedding-3-small", openai_api_key=OPENAI_API_KEY)
    PineconeVectorStore.from_texts(
        texts=texts,
        embedding=embeddings,
        metadatas=metas,
        index_name=PINECONE_INDEX,
        namespace=PINECONE_NAMESPACE,
    )
    return {"message": f"Ingested into {PINECONE_INDEX}:{PINECONE_NAMESPACE}", "chunks": len(texts)}

@app.delete("/clear-index")
async def clear_index(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    if not pc:
        raise HTTPException(status_code=500, detail="Pinecone not initialized")
    idx = pc.Index(PINECONE_INDEX)
    idx.delete(delete_all=True, namespace=PINECONE_NAMESPACE)
    return {"message": f"Cleared namespace '{PINECONE_NAMESPACE}' in index {PINECONE_INDEX}"}

@app.get("/ping")
async def ping():
    return {"status": "pong", "message": "CS Chatbot API is running!"}

# ─── Chat endpoint (protected) ─────────────────────────────────────────
@app.post("/chat")
async def chat_with_bot(req: QueryRequest, user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    user_q = req.query.strip().lower()
    norm   = re.sub(r'[\s\W]+', '', user_q)

    # small talk
    if re.match(r'^(hi|hello|hey)\b', user_q):
        return {"response": "Hello! How can I help you today?"}
    if re.match(r'^(bye|goodbye|see you)\b', user_q):
        return {"response": "Goodbye! Have a great day."}
    if re.search(r'\b(thankyou|thanks|thanx|thx|ty)\b', norm):
        return {"response": "You're welcome! "}
    
    # Retrieval + QA
    if not qa:
        return {"response": "System is initializing, please try again in a moment."}

    docs   = retriever.get_relevant_documents(user_q)
    result = qa({"query": user_q})
    answer = result["result"].strip()

    if not result.get("source_documents"):
        if docs:
            context = "\n\n---\n\n".join(d.page_content for d in docs)
            prompt = f"""Use the context to answer concisely. If the answer is not in the context, say "I don't know".

Context:
{context}

Question: {user_q}
Answer:"""
            answer = llm.invoke(prompt).content.strip()
        else:
            answer = "I'm not sure about that based on the current curriculum data."

    chat_history.append((req.query, answer))
    return {"response": answer}

@app.get("/chat-history")
async def get_chat_history(user=Depends(get_current_user)):
    return {"history": chat_history}

@app.post("/reset-history")
async def reset_chat_history(user=Depends(get_current_user)):
    chat_history.clear()
    return {"message": "Chat history reset."}

# ─── helpers ───────────────────────────────────────────────────────────
def load_json_documents(paths: List[str]) -> List[Dict[str,Any]]:
    docs: List[Dict[str,Any]] = []
    for p in paths:
        try:
            data = json.load(open(p, encoding="utf-8"))
            if isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, dict):
                        parts = [f"{subk}: {subv}" for subk, subv in v.items()]
                        docs.append({"text": f"{k} – " + "; ".join(parts), "source": p})
                    else:
                        docs.append({"text": f"{k}: {v}", "source": p})
            elif isinstance(data, list):
                for obj in data:
                    text = "\n".join(f"{kk}: {vv}" for kk, vv in obj.items())
                    docs.append({"text": text, "source": p})
        except Exception:
            pass
    return docs
