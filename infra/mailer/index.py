"""Emails a new reports/*.csv through SES (Lab 5). Deployed by infra/reports.tf."""

import logging, os, urllib.parse
from email.message import EmailMessage

import boto3

log = logging.getLogger()
log.setLevel(logging.INFO)
s3 = boto3.client("s3")
ses = boto3.client("sesv2")


def handler(event, context):
    record = event["Records"][0]
    bucket = record["s3"]["bucket"]["name"]
    key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
    log.info("report-mailer triggered trigger=s3 event=%s bucket=%s key=%s",
             record["eventName"], bucket, key)

    body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    week = key.rsplit("/", 1)[-1].removesuffix(".csv")
    to = [a.strip() for a in os.environ["RECIPIENTS"].split(",") if a.strip()]
    summary = "\n".join(body.decode("utf-8").split("\n\n")[0].splitlines()[1:])

    msg = EmailMessage()
    msg["Subject"] = f"{os.environ['PROJECT_NAME']}: weekly meetings report {week}"
    msg["From"] = os.environ["SENDER"]
    msg["To"] = ", ".join(to)
    msg.set_content(f"The meetings report for {week} is attached.\n\n{summary}\n")
    msg.add_attachment(body, maintype="text", subtype="csv",
                       filename=f"{week}.csv")

    sent = ses.send_email(
        FromEmailAddress=os.environ["SENDER"],
        Destination={"ToAddresses": to},
        Content={"Raw": {"Data": msg.as_bytes()}},
    )
    log.info("report-mailer sent key=%s to=%s message_id=%s",
             key, ",".join(to), sent["MessageId"])
    return {"status": "sent", "key": key}
