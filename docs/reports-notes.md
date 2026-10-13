# Weekly report: design notes and answers

## What is built

```
EventBridge Scheduler ──► SQS report-requests ──► Lambda report-builder ──► S3 reports/<week>.csv ──► Lambda report-mailer ──► SES ──► inbox
  cron(0 7 ? * MON *)       (3 failures → DLQ)     (in the VPC, Aurora)     (gateway endpoint)        (outside the VPC)
  Europe/Kyiv                ▲
                             └── make report-now WEEK=2026-W39
```

- **Command vs event.** The schedule and `make report-now` send a *command*
  (`{"week": …, "source": …}`) to one addressee, the builder. S3 saving the file
  produces an *event* (`ObjectCreated`). The mailer reacts to it; the builder does
  not know the mailer exists. A second listener (Slack, an archive) can be added
  without touching the builder.
- **Why two functions.** The builder must be in the VPC to reach Aurora, and the
  VPC has no NAT, so it cannot reach SES. The mailer runs outside the VPC and
  never touches the database. They are joined by the S3 event, not by a call.
- **Idempotent task.** `build_weekly_report(week)` takes the week as a parameter
  and always writes `reports/<week>.csv`. Running it twice overwrites one file.
- **Why the queue.** Retries and a dead-letter queue (Aurora may be slow to
  resume), backpressure (new accounts allow 10 concurrent Lambdas), and one entry
  point for the schedule, the Makefile and, later, the API.
- **Which trigger started a run** is the first log line of each function:
  `report-builder triggered trigger=schedule|sqs|direct week=… key=…` and
  `report-mailer triggered trigger=s3 event=ObjectCreated:Put key=…`.

Region: eu-north-1, like the rest of the stack. Weeks are ISO weeks in UTC.

## Sending the same week twice

Two emails. The file is idempotent (the second build overwrites
`reports/<week>.csv`), but every `PutObject` is a new `ObjectCreated` event, and
sending an email is a side effect that is not idempotent. Idempotency has to be
designed per side effect, not only per file.

## Questions

**1. The mailer got the same `ObjectCreated` event twice. Where would you store
"this report was already sent", and what would the key be?**

In a small DynamoDB table (on demand, effectively free at this volume). The
mailer runs outside the VPC, so it reaches DynamoDB directly; it cannot reach
Aurora. Before sending, the mailer does a conditional
`PutItem(ConditionExpression="attribute_not_exists(pk)")`; if the condition
fails, the email was already sent and the mailer stops. A TTL attribute cleans
old rows up.

The key: `<bucket>/<object key>#<ETag>` (or `#<versionId>` with versioning on).
The object key alone would block a legitimate resend after a rebuild with new
data; the ETag identifies this exact content, so a duplicate delivery of the
same event, or a rebuild that produced the identical file, is skipped, while a
changed report is sent. The status is written only after SES accepts the
message, so a crash between the two leads to at most one extra email, never a
lost one.

**2. The builder in the VPC could not reach SES. Three ways to fix it, with
their monthly cost (us-east-1 list prices, approximate).**

| Option | Monthly cost | Notes |
| --- | --- | --- |
| NAT gateway | ~$33 per AZ (0.045 $/h) + 0.045 $/GB processed | Gives the whole VPC internet access; more than the rest of the stack together |
| VPC interface endpoint for SES | ~$7.30 per AZ (0.01 $/h), so ~$15 for two AZs, + 0.01 $/GB | Private path to SES only; the builder could send directly |
| The split built here | $0 (Lambda, S3 events and SES within the free tier at this volume) | Two functions joined by an S3 event; the mailer is outside the VPC |

- *Ten more emails a week:* the split. It costs nothing, and the work per email
  is the same.
- *A million emails a week:* SES itself becomes the bill (about $0.10 per
  1,000 emails, ~$400 a month), so the networking choice is no longer about
  money. Still no NAT gateway. Either keep the split and fan out through a queue
  of per-recipient messages to several mailer invocations, or add the SES
  interface endpoint (~$15 a month) if the sending logic has to live next to the
  data. Either way you would request SES production access and add bounce and
  complaint handling.

**3. A presigned URL signed with a Lambda role's temporary credentials stops
working when they expire. How would you send a link that works for a week?**

A SigV4 presigned URL is valid for at most 7 days, and only until the
credentials that signed it expire; a role's session credentials last hours.
Options:

1. **CloudFront in front of the bucket with a signed URL** (origin access
   control, a key group). The expiry is whatever you set, a week here, and it
   does not depend on any IAM session. This is the cleanest answer.
2. **Sign with a long-lived identity:** a dedicated IAM user whose only
   permission is `s3:GetObject` on `reports/*`, its keys in SSM or Secrets
   Manager, `ExpiresIn=604800`. It works, but it brings back long-term access
   keys to rotate and protect.
3. **Link to the app, not to S3:** `https://<site>/reports/2026-W40` behind
   Cognito sign-in; the API checks the user and redirects to a fresh
   five-minute presigned URL. The link never expires, and only signed-in users
   can open it. This needs the API to be able to presign (it can: presigning is
   local, no network call), and the reader to sign in.
