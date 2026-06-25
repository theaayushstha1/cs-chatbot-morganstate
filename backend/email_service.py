"""
Email Service for CS Navigator
================================
Sends verification and password reset emails.
Uses Gmail SMTP or any SMTP provider.
"""

import os
import smtplib
import secrets
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

log = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER or "noreply@inavigator.ai")
APP_URL = os.getenv("APP_URL", "https://cs.inavigator.ai")
API_URL = os.getenv("API_URL", "https://api.inavigator.ai")


def generate_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(32)


def is_email_configured() -> bool:
    """Return whether SMTP is configured for real email delivery."""
    return bool(SMTP_USER and SMTP_PASS)


def build_verification_url(token: str) -> str:
    return f"{API_URL}/api/verify-email?token={token}"


def _send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an email via SMTP. Returns True on success."""
    if not is_email_configured():
        # Never log message bodies: verification and reset URLs contain bearer
        # tokens that must not appear in local or Cloud Run logs.
        log.warning("[EMAIL] SMTP not configured; email delivery was skipped (%s).", subject)
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"CS Navigator <{FROM_EMAIL}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())

        log.info(f"[EMAIL] Sent to {to_email}: {subject}")
        return True
    except Exception as e:
        log.error(f"[EMAIL] Failed to send to {to_email}: {e}")
        return False


def send_verification_email(to_email: str, token: str) -> bool:
    """Send email verification link."""
    verify_url = build_verification_url(token)
    html = f"""
    <div style="font-family: 'Google Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #4285F4; font-size: 24px; margin: 0;">CS Navigator</h1>
            <p style="color: #5f6368; font-size: 14px;">Morgan State University</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; border: 1px solid #dadce0;">
            <h2 style="color: #202124; font-size: 18px; margin: 0 0 12px;">Verify your email</h2>
            <p style="color: #5f6368; font-size: 14px; line-height: 1.6;">
                Click the button below to verify your Morgan State email and activate your account.
            </p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="{verify_url}" style="display: inline-block; padding: 12px 32px; background: #4285F4; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                    Verify Email
                </a>
            </div>
            <p style="color: #9aa0a6; font-size: 12px; text-align: center;">
                Or copy this link: {verify_url}
            </p>
        </div>
        <p style="color: #9aa0a6; font-size: 11px; text-align: center; margin-top: 16px;">
            If you didn't create an account, ignore this email.
        </p>
    </div>
    """
    return _send_email(to_email, "Verify your CS Navigator account", html)


def send_password_reset_email(to_email: str, token: str) -> bool:
    """Send password reset link."""
    reset_url = f"{APP_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family: 'Google Sans', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #4285F4; font-size: 24px; margin: 0;">CS Navigator</h1>
            <p style="color: #5f6368; font-size: 14px;">Morgan State University</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; border: 1px solid #dadce0;">
            <h2 style="color: #202124; font-size: 18px; margin: 0 0 12px;">Reset your password</h2>
            <p style="color: #5f6368; font-size: 14px; line-height: 1.6;">
                Click the button below to reset your password. This link expires in 1 hour.
            </p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="{reset_url}" style="display: inline-block; padding: 12px 32px; background: #4285F4; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                    Reset Password
                </a>
            </div>
            <p style="color: #9aa0a6; font-size: 12px; text-align: center;">
                Or copy this link: {reset_url}
            </p>
        </div>
        <p style="color: #9aa0a6; font-size: 11px; text-align: center; margin-top: 16px;">
            If you didn't request a password reset, ignore this email.
        </p>
    </div>
    """
    return _send_email(to_email, "Reset your CS Navigator password", html)
