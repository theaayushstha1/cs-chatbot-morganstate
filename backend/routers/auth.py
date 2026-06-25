# backend/routers/auth.py
# Auth endpoints extracted from main.py: register, verify-email, resend-verification, login.

import os
import re
import time as time_module
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, Request, status
from sqlalchemy.orm import Session

from deps import get_db, RegisterRequest, LoginRequest
from models import User
from security import hash_password, verify_password, create_access_token

router = APIRouter(tags=["auth"])

# ---------------------------------------------------------------------------
# Auth-specific constants & rate-limit state
# ---------------------------------------------------------------------------
ALLOWED_EMAIL_DOMAINS = ["morgan.edu"]
_register_timestamps: dict[str, list] = {}
_resend_timestamps: dict[str, list] = {}
VERIFICATION_TOKEN_TTL_HOURS = 24


def _allow_dev_verification_link() -> bool:
    app_env = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "local")).lower()
    return app_env not in {"production", "prod"}


def _verification_response(message: str, token: str | None = None, request: Request | None = None) -> dict:
    response = {"message": message}
    if token and _allow_dev_verification_link():
        from email_service import build_verification_url, is_email_configured

        if not is_email_configured():
            if request:
                response["dev_verification_url"] = f"{request.url_for('verify_email')}?token={token}"
            else:
                response["dev_verification_url"] = build_verification_url(token)
            response["email_delivery"] = "smtp_not_configured"
            response["message"] = (
                f"{message} SMTP is not configured locally, so use the development verification link."
            )
    return response


def _rate_limit_email(
    timestamps: dict[str, list],
    email: str,
    *,
    limit: int,
    window_seconds: int,
) -> bool:
    """Return True when an email-specific action exceeds its rolling limit."""
    now_ts = time_module.time()
    recent = [t for t in timestamps.get(email, []) if now_ts - t < window_seconds]
    if len(recent) >= limit:
        timestamps[email] = recent
        return True
    recent.append(now_ts)
    timestamps[email] = recent
    if len(timestamps) > 10000:
        stale = [key for key, values in timestamps.items() if not values or now_ts - values[-1] >= window_seconds]
        for key in stale:
            timestamps.pop(key, None)
    return False


def _verification_token_is_expired(expires: datetime | None) -> bool:
    if not expires:
        return False
    normalized = expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)
    return normalized < datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# POST /api/register
# ---------------------------------------------------------------------------
@router.post("/api/register", status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    from email_service import generate_token, send_verification_email

    email = req.email.strip().lower()

    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    # Rate limit per EMAIL (not per IP). On campus WiFi all students share one IP,
    # so IP-based limiting blocks innocent users. 3 attempts per email per hour.
    if _rate_limit_email(_register_timestamps, email, limit=3, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many attempts for this email. Try again in an hour.")

    # Only allow Morgan State email for new registrations
    email_domain = email.split("@")[-1].lower()
    allow_test = os.getenv("ALLOW_TEST_EMAILS", "false").lower() == "true"
    if email_domain not in ALLOWED_EMAIL_DOMAINS and not (allow_test and email.endswith("@test.com")):
        raise HTTPException(status_code=400, detail="Only @morgan.edu email addresses are allowed.")

    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed = hash_password(req.password)
    token = generate_token()
    student = User(
        email=email,
        password_hash=hashed,
        role="student",
        email_verified=False,
        verification_token=token,
        verification_token_expires=datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_TOKEN_TTL_HOURS),
        name=req.name.strip() if req.name else None,
        student_id=req.student_id.strip() if req.student_id else None,
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    sent = send_verification_email(email, token)
    response = _verification_response("Account created! Check your Morgan State email to verify.", token, request)
    response["user_id"] = student.id
    response["email_sent"] = sent
    return response


# ---------------------------------------------------------------------------
# GET /api/verify-email
# ---------------------------------------------------------------------------
@router.get("/api/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    from starlette.responses import RedirectResponse

    user = db.query(User).filter(User.verification_token == token).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    expires = getattr(user, "verification_token_expires", None)
    if _verification_token_is_expired(expires):
        user.verification_token = None
        user.verification_token_expires = None
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    db.commit()
    # Redirect to login with success flag
    app_url = os.getenv("APP_URL", "https://cs.inavigator.ai")
    return RedirectResponse(url=f"{app_url}/login?verified=true")


# ---------------------------------------------------------------------------
# POST /api/resend-verification
# ---------------------------------------------------------------------------
@router.post("/api/resend-verification")
async def resend_verification(request: Request, db: Session = Depends(get_db)):
    from email_service import generate_token, send_verification_email

    body = await request.json()
    email = body.get("email", "").strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"message": "If an account exists, a verification email has been sent."}
    if user.email_verified:
        return {"message": "Email already verified."}
    if _rate_limit_email(_resend_timestamps, email, limit=3, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many verification emails requested. Try again in an hour.")
    token = generate_token()
    user.verification_token = token
    user.verification_token_expires = datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_TOKEN_TTL_HOURS)
    db.commit()
    sent = send_verification_email(email, token)
    response = _verification_response("Verification email sent. Check your inbox.", token, request)
    response["email_sent"] = sent
    return response


# ---------------------------------------------------------------------------
# POST /api/login
# ---------------------------------------------------------------------------
@router.post("/api/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if getattr(user, "is_disabled", False):
        raise HTTPException(status_code=403, detail="This account has been disabled. Contact an administrator.")

    # Require email verification (skip for admins and existing test accounts)
    if not getattr(user, "email_verified", True) and user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Please verify your email first. Check your inbox for the verification link.",
        )

    token = create_access_token(
        {"user_id": user.id, "role": user.role, "email": user.email}
    )
    return {"access_token": token, "token_type": "bearer"}
