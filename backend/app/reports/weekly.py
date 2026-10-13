"""The weekly meetings report: one ISO week in, one CSV out. No AWS in here.

Two rules the rest of the pipeline relies on:

1. The week is a parameter. Nothing in this module decides "last week" on its
   own; whoever calls it does (the Lambda handler, the Makefile, a test). That
   is what lets an old report be rebuilt.
2. The same week always maps to the same object key, reports/<week>.csv, so
   building it twice overwrites one file instead of creating two. That makes
   the task idempotent, and "at least once" delivery harmless.

Weeks are ISO weeks in UTC: Monday 00:00 to the next Monday 00:00. A meeting
belongs to the week in which it starts.

Run locally against the Compose database:

    docker compose exec backend python -m app.reports.weekly 2026-W40
"""

import asyncio
import csv
import io
import re
import sys
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from typing import Protocol

WEEK_PATTERN = re.compile(r"^(\d{4})-W(\d{2})$")
TOP_N = 5


class MeetingLike(Protocol):
    """What the report reads from a meeting; the ORM model fits, so does a test double."""

    title: str
    starts_at: datetime
    ends_at: datetime
    attendee_count: int


# --- weeks ------------------------------------------------------------------


def parse_week(week: str) -> tuple[int, int]:
    """'2026-W40' -> (2026, 40). Raises ValueError for anything else, W53 included
    in a year that has no week 53."""
    match = WEEK_PATTERN.match(week or "")
    if not match:
        raise ValueError(f"not an ISO week like 2026-W40: {week!r}")
    year, number = int(match[1]), int(match[2])
    date.fromisocalendar(year, number, 1)  # validates the week number for that year
    return year, number


def week_bounds(week: str) -> tuple[datetime, datetime]:
    """Start (inclusive) and end (exclusive) of an ISO week, in UTC."""
    year, number = parse_week(week)
    monday = date.fromisocalendar(year, number, 1)
    start = datetime(monday.year, monday.month, monday.day, tzinfo=UTC)
    return start, start + timedelta(days=7)


def format_week(day: date) -> str:
    year, number, _ = day.isocalendar()
    return f"{year}-W{number:02d}"


def previous_week(week: str) -> str:
    year, number = parse_week(week)
    return format_week(date.fromisocalendar(year, number, 1) - timedelta(days=7))


def last_complete_week(today: date | None = None) -> str:
    """The ISO week before the one that contains `today` (UTC by default)."""
    today = today or datetime.now(UTC).date()
    return format_week(today - timedelta(days=7))


def report_key(week: str) -> str:
    parse_week(week)
    return f"reports/{week}.csv"


# --- the report -------------------------------------------------------------


def duration_hours(meeting: MeetingLike) -> float:
    return (meeting.ends_at - meeting.starts_at).total_seconds() / 3600


def _signed(value: float) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text if value <= 0 else f"+{text}"


def _hours(value: float) -> str:
    return f"{value:.2f}"


def render_csv(
    week: str,
    this_week: Sequence[MeetingLike],
    week_before: Sequence[MeetingLike],
) -> bytes:
    """Turn two weeks of meetings into the report. Pure: no database, no clock."""
    hours_now = sum(duration_hours(m) for m in this_week)
    hours_before = sum(duration_hours(m) for m in week_before)

    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")

    writer.writerow(["metric", "value"])
    writer.writerow(["week", week])
    writer.writerow(["meetings", len(this_week)])
    writer.writerow(["total_hours", _hours(hours_now)])
    writer.writerow(["previous_week", previous_week(week)])
    writer.writerow(["previous_meetings", len(week_before)])
    writer.writerow(["previous_total_hours", _hours(hours_before)])
    writer.writerow(["change_meetings", _signed(len(this_week) - len(week_before))])
    writer.writerow(["change_hours", _signed(hours_now - hours_before)])

    writer.writerow([])
    writer.writerow(["rank", "title", "starts_at", "duration_hours", "attendees"])
    # Longest first; equal lengths in start order, so the file is stable.
    longest = sorted(this_week, key=lambda m: (-duration_hours(m), m.starts_at))[:TOP_N]
    for rank, meeting in enumerate(longest, start=1):
        writer.writerow(
            [
                rank,
                meeting.title,
                meeting.starts_at.astimezone(UTC).isoformat(timespec="minutes"),
                _hours(duration_hours(meeting)),
                meeting.attendee_count,
            ]
        )

    return out.getvalue().encode("utf-8")


# --- the database -----------------------------------------------------------


async def _meetings_between(session, start: datetime, end: datetime) -> list:
    from sqlalchemy import select

    from app.models.meeting import Meeting

    query = (
        select(Meeting)
        .where(Meeting.starts_at >= start, Meeting.starts_at < end)
        .order_by(Meeting.starts_at)
    )
    return list((await session.scalars(query)).all())


async def collect(week: str) -> bytes:
    from app.db import SessionFactory

    start, end = week_bounds(week)
    before_start, before_end = week_bounds(previous_week(week))
    async with SessionFactory() as session:
        this_week = await _meetings_between(session, start, end)
        week_before = await _meetings_between(session, before_start, before_end)
    return render_csv(week, this_week, week_before)


def build_weekly_report(week: str) -> bytes:
    """Query the meetings of one ISO week (e.g. "2026-W40") and return the CSV."""
    parse_week(week)
    return asyncio.run(collect(week))


if __name__ == "__main__":
    chosen = sys.argv[1] if len(sys.argv) > 1 else last_complete_week()
    sys.stdout.write(build_weekly_report(chosen).decode("utf-8"))
