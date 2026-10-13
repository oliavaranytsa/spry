"""The weekly report without a database or AWS: weeks, the CSV, the trigger."""

import csv
import io
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import pytest

from app.reports.lambda_handler import detect_trigger
from app.reports.weekly import (
    last_complete_week,
    parse_week,
    previous_week,
    render_csv,
    report_key,
    week_bounds,
)


@dataclass
class M:
    title: str
    starts_at: datetime
    ends_at: datetime
    attendee_count: int = 2


def at(day: int, hour: int, hours: float, title: str = "m") -> M:
    start = datetime(2026, 9, day, hour, tzinfo=UTC)
    return M(title, start, start + timedelta(hours=hours))


def test_week_bounds_are_monday_to_monday_utc() -> None:
    start, end = week_bounds("2026-W40")
    assert start == datetime(2026, 9, 28, tzinfo=UTC)
    assert end == datetime(2026, 10, 5, tzinfo=UTC)


def test_previous_week_crosses_the_year() -> None:
    assert previous_week("2026-W01") == "2025-W52"
    assert previous_week("2026-W40") == "2026-W39"


def test_last_complete_week_is_the_one_before_today() -> None:
    assert last_complete_week(date(2026, 10, 5)) == "2026-W40"  # a Monday


@pytest.mark.parametrize("bad", ["", "2026-40", "2026-W5", "2026-W54", "2025-W53"])
def test_bad_weeks_are_refused(bad: str) -> None:
    with pytest.raises(ValueError):
        parse_week(bad)


def test_same_week_same_key() -> None:
    assert report_key("2026-W40") == report_key("2026-W40") == "reports/2026-W40.csv"


def test_csv_totals_change_and_top_five() -> None:
    this_week = [at(28 + i % 3, 9, h, f"m{i}") for i, h in enumerate([1, 3, 0.5, 2, 4, 1.5])]
    before = [at(21, 9, 2), at(22, 9, 2)]
    rows = list(csv.reader(io.StringIO(render_csv("2026-W40", this_week, before).decode())))

    summary = dict(row for row in rows[1:9])
    assert summary["meetings"] == "6"
    assert summary["total_hours"] == "12.00"
    assert summary["previous_meetings"] == "2"
    assert summary["change_meetings"] == "+4"
    assert summary["change_hours"] == "+8"

    top = rows[rows.index(["rank", "title", "starts_at", "duration_hours", "attendees"]) + 1 :]
    assert [r[1] for r in top] == ["m4", "m1", "m3", "m5", "m0"]


def test_empty_week_still_makes_a_report() -> None:
    text = render_csv("2026-W40", [], []).decode()
    assert "meetings,0" in text and "change_hours,0" in text


def test_trigger_from_schedule_through_the_queue() -> None:
    event = {
        "Records": [
            {"eventSource": "aws:sqs", "body": json.dumps({"week": None, "source": "schedule"})}
        ]
    }
    assert detect_trigger(event) == ("schedule", {"week": None, "source": "schedule"})


def test_trigger_from_make_report_now() -> None:
    body = {"week": "2026-W39", "source": "make"}
    event = {"Records": [{"eventSource": "aws:sqs", "body": json.dumps(body)}]}
    assert detect_trigger(event) == ("sqs", body)


def test_trigger_from_a_direct_invocation() -> None:
    assert detect_trigger({"week": "2026-W39"})[0] == "direct"
