import os
from datetime import datetime, timedelta, timezone

os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-not-for-production")

from routers.auth import _rate_limit_email, _verification_token_is_expired


def test_verification_token_expiry_accepts_active_and_legacy_tokens():
    naive_utc_now = datetime.now(timezone.utc).replace(tzinfo=None)
    assert _verification_token_is_expired(None) is False
    assert _verification_token_is_expired(datetime.now(timezone.utc) + timedelta(minutes=5)) is False
    assert _verification_token_is_expired(naive_utc_now + timedelta(minutes=5)) is False


def test_verification_token_expiry_rejects_past_tokens():
    naive_utc_now = datetime.now(timezone.utc).replace(tzinfo=None)
    assert _verification_token_is_expired(datetime.now(timezone.utc) - timedelta(seconds=1)) is True
    assert _verification_token_is_expired(naive_utc_now - timedelta(seconds=1)) is True


def test_email_rate_limit_blocks_after_limit():
    timestamps = {}
    assert _rate_limit_email(timestamps, "student@morgan.edu", limit=2, window_seconds=3600) is False
    assert _rate_limit_email(timestamps, "student@morgan.edu", limit=2, window_seconds=3600) is False
    assert _rate_limit_email(timestamps, "student@morgan.edu", limit=2, window_seconds=3600) is True
