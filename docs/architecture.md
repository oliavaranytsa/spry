# Spry: containers (C4, level 2)

Updated in Lab 6 with the agenda parser and Amazon Bedrock. Everything runs in
eu-north-1 except Bedrock, which the parser calls in us-east-1. New in Lab 6:
the two yellow boxes.

```mermaid
flowchart LR
    user(["Person<br/>organiser of meetings"])

    subgraph aws["AWS account"]
        direction LR
        site["Web app<br/><i>Next.js static export</i><br/>S3 + CloudFront"]
        cognito["Sign-in<br/><i>Amazon Cognito</i><br/>email + password, Google"]

        subgraph vpc["VPC, no NAT"]
            api["API<br/><i>FastAPI on Lambda</i><br/>function URL"]
            db[("Database<br/><i>Aurora Serverless v2</i><br/>meetings, agenda, ai_suggestion")]
            builder["Report builder<br/><i>Lambda</i>"]
        end

        parser["Agenda parser<br/><i>Lambda, outside the VPC</i><br/>function URL, Cognito check"]
        bedrock["Claude on Amazon Bedrock<br/><i>bedrock-mantle, us-east-1</i>"]

        sched["Schedule<br/><i>EventBridge Scheduler</i>"]
        queue["report-requests<br/><i>SQS + DLQ</i>"]
        bucket[("Reports<br/><i>S3</i>")]
        mailer["Report mailer<br/><i>Lambda</i>"]
        ses["Email<br/><i>Amazon SES</i>"]
    end

    user -->|"uses, HTTPS"| site
    site -->|"signs in, OIDC + PKCE"| cognito

    site -->|"<b>parse</b>: POST text + token"| parser
    parser -->|"record_agenda tool call"| bedrock

    site -->|"<b>save</b>: PUT /api/meetings/{id}/agenda"| api
    api -->|"SQL"| db

    sched -->|"weekly command"| queue
    queue --> builder
    builder -->|"reads meetings"| db
    builder -->|"reports/WEEK.csv<br/>S3 gateway endpoint"| bucket
    bucket -->|"ObjectCreated"| mailer
    mailer --> ses
    ses -->|"weekly report"| user

    classDef new fill:#fff4d6,stroke:#d4a017,color:#000
    class parser,bedrock new
```

The two new arrows are the point of Lab 6:

- **parse:** browser → agenda parser → Bedrock. Read-only: text in, JSON out.
  The parser has no route to the database and no permission to write anything.
- **save:** browser → API → Aurora. The same path, validation and
  authentication as every other write. The model's suggestion travels with the
  save and is stored next to the agenda the user confirmed.

The parser sits outside the VPC because it needs no database: it reaches
Bedrock and Cognito's keys over the internet, with no NAT gateway and no VPC
endpoint. See [ADR 0006](adr/0006-llm-agenda-parsing.md).
