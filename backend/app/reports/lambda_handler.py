"""Lambda entry point of the report builder.

The same container image as the API, with a different command
(infra/reports.tf: image_config.command). It runs inside the VPC, next to
Aurora, and writes to S3 through the free gateway endpoint. It has no route to
anything else on the internet, which is why emailing is a separate function.

Two event shapes arrive here:

- an SQS record from report-requests (the normal path). Its body is
  {"week": "2026-W40" | null, "source": "schedule" | "make" | ...}. The weekly
  schedule sends "source": "schedule"; make report-now sends "make".
- a direct invocation with the same payload, for `aws lambda invoke` by hand.

The first log line of every run names the trigger, so CloudWatch shows which
event started it: trigger=schedule, trigger=sqs or trigger=direct.
"""

import json
import logging
import os
from functools import cache
from typing import Any

from app.reports.weekly import build_weekly_report, last_complete_week, parse_week, report_key

logger = logging.getLogger("report-builder")
logger.setLevel(logging.INFO)


@cache
def _s3():
    # Imported here, not at the top: boto3 ships with the Lambda runtime, not
    # with the app, so the module stays importable in tests and in Compose.
    import boto3

    return boto3.client("s3")


def detect_trigger(event: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Which event started this run, and the payload it carried."""
    records = event.get("Records") or []
    if records and records[0].get("eventSource") == "aws:sqs":
        body = json.loads(records[0].get("body") or "{}")
        # The schedule reaches the builder through the queue; it still counts
        # as the schedule. Anything else on the queue is an on-demand request.
        trigger = "schedule" if body.get("source") == "schedule" else "sqs"
        return trigger, body
    return str(event.get("source") or "direct"), event


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    trigger, payload = detect_trigger(event)
    week = payload.get("week") or last_complete_week()

    try:
        parse_week(week)
    except ValueError as exc:
        # A malformed request will not get better on a retry: log it and let
        # the message go, instead of sending it round three times to the DLQ.
        logger.error("report-builder rejected trigger=%s week=%r error=%s", trigger, week, exc)
        return {"status": "rejected", "week": week, "trigger": trigger}

    key = report_key(week)
    logger.info(
        "report-builder triggered trigger=%s week=%s key=%s source=%s",
        trigger,
        week,
        key,
        payload.get("source"),
    )

    # Step 7 of the lab: a way to watch a message fail three times and land in
    # the dead-letter queue. Empty in normal operation.
    if week == os.environ.get("FAIL_WEEK", ""):
        raise RuntimeError(f"FAIL_WEEK is set to {week}: failing on purpose")

    body = build_weekly_report(week)
    _s3().put_object(
        Bucket=os.environ["REPORTS_BUCKET"],
        Key=key,
        Body=body,
        ContentType="text/csv; charset=utf-8",
    )
    logger.info("report-builder saved key=%s bytes=%d", key, len(body))
    return {"status": "ok", "week": week, "key": key, "trigger": trigger}
