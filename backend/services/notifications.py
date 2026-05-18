"""
Proactive notification helpers for registration and financial aid reminders.
"""

import json
import os
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from email_service import send_deadline_reminder_email
from models import AcademicDeadline, DegreeWorksData, NotificationDelivery, User, UserNotificationPreference


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADVISING_PATH = os.path.join(BACKEND_DIR, "data_sources", "advising.json")
FINANCIAL_AID_PATH = os.path.join(BACKEND_DIR, "kb_structured", "financial_aid_sap_deadlines.json")

REGISTRATION_CATEGORY = "registration"
FINANCIAL_AID_CATEGORY = "financial_aid"


def get_or_create_preferences(db: Session, user_id: int) -> UserNotificationPreference:
    """Return a user's notification preferences, creating defaults if missing."""
    prefs = (
        db.query(UserNotificationPreference)
        .filter(UserNotificationPreference.user_id == user_id)
        .first()
    )
    if prefs:
        return prefs

    prefs = UserNotificationPreference(user_id=user_id)
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs


def _upsert_deadline(
    db: Session,
    *,
    category: str,
    title: str,
    deadline_date: datetime,
    audience: str = "all",
    source_url: str = "",
    source_label: str = "",
) -> AcademicDeadline:
    existing = (
        db.query(AcademicDeadline)
        .filter(
            AcademicDeadline.category == category,
            AcademicDeadline.title == title,
            AcademicDeadline.deadline_date == deadline_date,
            AcademicDeadline.audience == audience,
        )
        .first()
    )
    if existing:
        existing.source_url = source_url or existing.source_url
        existing.source_label = source_label or existing.source_label
        existing.is_active = True
        return existing

    deadline = AcademicDeadline(
        category=category,
        title=title,
        deadline_date=deadline_date,
        audience=audience,
        source_url=source_url,
        source_label=source_label,
        is_active=True,
    )
    db.add(deadline)
    return deadline


def _parse_date_string(value: str) -> Optional[datetime]:
    value = (value or "").strip()
    if not value:
        return None
    try:
        parsed = datetime.strptime(value, "%B %d, %Y")
        return datetime.combine(parsed.date(), time(hour=9))
    except ValueError:
        return None


def _parse_date_range(value: str) -> tuple[Optional[datetime], Optional[datetime]]:
    value = (value or "").strip()
    if not value or "-" not in value:
        parsed = _parse_date_string(value)
        return parsed, None

    left, right = [part.strip() for part in value.split("-", 1)]
    right_parts = right.split(",")
    if len(right_parts) != 2:
        return None, None

    right_month_day = right_parts[0].strip()
    year = right_parts[1].strip()
    start = _parse_date_string(f"{left}, {year}")
    end = _parse_date_string(f"{right_month_day}, {year}")
    return start, end


def seed_registration_deadlines(db: Session) -> int:
    """Seed registration dates from the structured advising JSON file."""
    if not os.path.exists(ADVISING_PATH):
        return 0

    with open(ADVISING_PATH, encoding="utf-8") as f:
        data = json.load(f)

    advising = data.get("academic_advising", {})
    overview = advising.get("overview", {})
    dates = overview.get("fall_2026_registration_dates", {})
    source_url = overview.get("registration_link", "")
    source_label = "Academic advising registration dates"

    seeded = 0
    registration_defs = [
        ("seniors_90_plus_credits", "Registration opens for seniors (90+ credits)", "senior"),
        ("graduate_students", "Registration opens for graduate students", "graduate"),
        ("honors_athletes_veterans_sdss", "Priority registration opens for honors, athletes, veterans, and SDSS students", "special"),
        ("juniors_56_to_89_credits", "Registration opens for juniors (56-89 credits)", "junior"),
        ("sophomores_25_to_55_credits", "Registration opens for sophomores (25-55 credits)", "sophomore"),
        ("freshmen_0_to_24_credits", "Registration opens for freshmen (0-24 credits)", "freshman"),
    ]

    for key, title, audience in registration_defs:
        deadline = _parse_date_string(dates.get(key, ""))
        if not deadline:
            continue
        _upsert_deadline(
            db,
            category=REGISTRATION_CATEGORY,
            title=title,
            deadline_date=deadline,
            audience=audience,
            source_url=source_url,
            source_label=source_label,
        )
        seeded += 1

    range_start, range_end = _parse_date_range(dates.get("general_registration_all_students", ""))
    if range_start:
        _upsert_deadline(
            db,
            category=REGISTRATION_CATEGORY,
            title="General registration opens for all students",
            deadline_date=range_start,
            audience="all",
            source_url=source_url,
            source_label=source_label,
        )
        seeded += 1
    if range_end:
        _upsert_deadline(
            db,
            category=REGISTRATION_CATEGORY,
            title="General registration closes for all students",
            deadline_date=range_end,
            audience="all",
            source_url=source_url,
            source_label=source_label,
        )
        seeded += 1

    db.commit()
    return seeded


def seed_financial_aid_deadlines(db: Session, today: Optional[date] = None) -> int:
    """Seed recurring financial aid dates from the repo's financial aid KB doc."""
    if not os.path.exists(FINANCIAL_AID_PATH):
        return 0

    with open(FINANCIAL_AID_PATH, encoding="utf-8") as f:
        data = json.load(f)

    today = today or datetime.utcnow().date()
    source_url = "https://www.morgan.edu/financial-aid"
    source_label = data.get("title", "Financial aid deadlines")

    def next_occurrence(month: int, day: int) -> datetime:
        year = today.year
        candidate = date(year, month, day)
        if candidate < today:
            candidate = date(year + 1, month, day)
        return datetime.combine(candidate, time(hour=9))

    deadlines = [
        ("FAFSA priority deadline", next_occurrence(3, 1)),
        ("FAFSA becomes available", next_occurrence(10, 1)),
    ]

    seeded = 0
    for title, deadline in deadlines:
        _upsert_deadline(
            db,
            category=FINANCIAL_AID_CATEGORY,
            title=title,
            deadline_date=deadline,
            audience="all",
            source_url=source_url,
            source_label=source_label,
        )
        seeded += 1

    db.commit()
    return seeded


def seed_all_deadlines(db: Session, today: Optional[date] = None) -> dict:
    """Seed or refresh all deadlines used by proactive reminders."""
    today = today or datetime.utcnow().date()
    return {
        "registration_seeded": seed_registration_deadlines(db),
        "financial_aid_seeded": seed_financial_aid_deadlines(db, today=today),
    }


def _audience_matches_user(deadline: AcademicDeadline, degreeworks: Optional[DegreeWorksData]) -> bool:
    audience = (deadline.audience or "all").lower()
    if audience in {"", "all"}:
        return True
    if audience == "special":
        return False
    if not degreeworks or not degreeworks.classification:
        return False
    classification = degreeworks.classification.lower()
    return audience in classification


def _category_enabled(deadline: AcademicDeadline, prefs: UserNotificationPreference) -> bool:
    if deadline.category == REGISTRATION_CATEGORY:
        return prefs.registration_enabled
    if deadline.category == FINANCIAL_AID_CATEGORY:
        return prefs.financial_aid_enabled
    return False


def _serialize_deadline(deadline: AcademicDeadline, today: date) -> dict:
    days_until = (deadline.deadline_date.date() - today).days
    return {
        "id": deadline.id,
        "category": deadline.category,
        "title": deadline.title,
        "audience": deadline.audience or "all",
        "deadline_date": deadline.deadline_date.isoformat(),
        "days_until": days_until,
        "source_url": deadline.source_url or "",
        "source_label": deadline.source_label or "",
    }


def get_upcoming_deadlines_for_user(db: Session, user_id: int, days_ahead: int = 30) -> list[dict]:
    """Return the next relevant deadlines for a user based on their preferences."""
    today = datetime.utcnow().date()
    prefs = get_or_create_preferences(db, user_id)
    degreeworks = db.query(DegreeWorksData).filter(DegreeWorksData.user_id == user_id).first()

    end_dt = datetime.combine(today + timedelta(days=days_ahead), time.max)
    deadlines = (
        db.query(AcademicDeadline)
        .filter(
            AcademicDeadline.is_active == True,
            AcademicDeadline.deadline_date >= datetime.combine(today, time.min),
            AcademicDeadline.deadline_date <= end_dt,
        )
        .order_by(AcademicDeadline.deadline_date.asc())
        .all()
    )

    results = []
    for deadline in deadlines:
        if not _category_enabled(deadline, prefs):
            continue
        if not _audience_matches_user(deadline, degreeworks):
            continue
        results.append(_serialize_deadline(deadline, today))
    return results


def _delivery_exists(db: Session, user_id: int, deadline_id: int, offset_days: int) -> bool:
    return (
        db.query(NotificationDelivery)
        .filter(
            NotificationDelivery.user_id == user_id,
            NotificationDelivery.deadline_id == deadline_id,
            NotificationDelivery.channel == "email",
            NotificationDelivery.reminder_offset_days == offset_days,
        )
        .first()
        is not None
    )


def get_due_reminders(db: Session, today: Optional[date] = None) -> list[dict]:
    """Compute all email reminders that should be sent on the given day."""
    today = today or datetime.utcnow().date()
    users = db.query(User).filter(User.email_verified == True).all()
    due = []

    for user in users:
        prefs = get_or_create_preferences(db, user.id)
        if not prefs.email_enabled:
            continue

        degreeworks = db.query(DegreeWorksData).filter(DegreeWorksData.user_id == user.id).first()
        deadlines = (
            db.query(AcademicDeadline)
            .filter(
                AcademicDeadline.is_active == True,
                AcademicDeadline.deadline_date >= datetime.combine(today, time.min),
            )
            .order_by(AcademicDeadline.deadline_date.asc())
            .all()
        )

        for deadline in deadlines:
            if not _category_enabled(deadline, prefs):
                continue
            if not _audience_matches_user(deadline, degreeworks):
                continue

            days_until = (deadline.deadline_date.date() - today).days
            desired_offsets = []
            if prefs.remind_7_days:
                desired_offsets.append(7)
            if prefs.remind_1_day:
                desired_offsets.append(1)

            for offset in desired_offsets:
                if days_until != offset:
                    continue
                if _delivery_exists(db, user.id, deadline.id, offset):
                    continue
                due.append(
                    {
                        "user": user,
                        "deadline": deadline,
                        "days_until": days_until,
                        "offset_days": offset,
                    }
                )
    return due


def send_due_notifications(db: Session, today: Optional[date] = None) -> dict:
    """Send all due reminder emails and record successful deliveries."""
    today = today or datetime.utcnow().date()
    due = get_due_reminders(db, today=today)
    sent = 0
    skipped = 0
    errors = 0

    for item in due:
        user = item["user"]
        deadline = item["deadline"]
        days_until = item["days_until"]
        offset_days = item["offset_days"]

        if _delivery_exists(db, user.id, deadline.id, offset_days):
            skipped += 1
            continue

        try:
            success = send_deadline_reminder_email(user.email, deadline, days_until)
            if not success:
                errors += 1
                continue

            db.add(
                NotificationDelivery(
                    user_id=user.id,
                    deadline_id=deadline.id,
                    channel="email",
                    reminder_offset_days=offset_days,
                )
            )
            sent += 1
        except Exception:
            errors += 1

    db.commit()
    return {
        "status": "completed",
        "date": today.isoformat(),
        "eligible": len(due),
        "emails_sent": sent,
        "duplicates_skipped": skipped,
        "errors": errors,
    }
