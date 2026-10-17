# ADR 0006: Parse pasted agendas with Claude on Amazon Bedrock

- **Status:** accepted
- **Date:** 2026-10-17
- **Lab:** 6, "Paste an agenda"

## Context

Users already have their agendas somewhere else: in an email, a chat message,
notes. Typing them into Spry item by item is the step they skip. The feature:
paste the text, get the agenda form pre-filled, check it, save.

The constraints:

- **No NAT.** The API and Aurora run in a VPC with no NAT gateway (Lab 3). A
  NAT gateway costs about $32 a month before any traffic; a Bedrock VPC
  interface endpoint about $7.30 a month per AZ.
- **Cost per call.** Every model call is billed by tokens, so an open endpoint
  is a wallet without a lock.
- **Text from outside.** The pasted text is written by someone else (an email
  from anyone). It can contain instructions aimed at the model (prompt
  injection), and the model can invent values that are not in the text.
- **The model can be wrong or down.** The feature must never block saving an
  agenda by hand.

## Decision

1. **Model:** Claude on Amazon Bedrock, through the Anthropic Messages API
   (`bedrock-mantle`, `AnthropicBedrockMantle`), in us-east-1. Default
   `anthropic.claude-opus-5-5` with `effort: low`; the model ID is
   configuration (`PARSER_MODEL`), so `anthropic.claude-haiku-5-5` (about 40
   times cheaper) is a deploy-time switch, decided by the measurements in
   `docs/lab6/`.
2. **A schema, not free text.** The model must answer by calling one tool,
   `record_agenda`, whose input schema is `ParsedAgenda`. The answer is
   validated with Pydantic; an invalid answer is sent back once with the
   validation error, and a second failure is an error (422), never a guess.
   Every field may be empty, and the prompt says to leave it empty rather
   than invent it. Today's date and the user's time zone (from the browser)
   are in the prompt, so relative dates resolve to the user's week.
3. **The parser runs outside the VPC,** as its own Lambda function
   (`infra/ai.yml`) with the backend's image and another command. It needs no
   database, so it reaches Bedrock and Cognito's public keys over the internet
   directly: no NAT, no endpoint, and no cost while nobody uses it.
4. **The model never writes.** The parser only reads text and returns JSON.
   The browser shows it as the normal agenda form, with a "suggested" mark on
   every field the model filled, and the user saves through the existing API
   (`PUT /api/meetings/{id}/agenda`) with its usual validation. The model's
   suggestion, the model and the prompt version are stored next to the saved
   agenda (`meetings.ai_suggestion`, JSONB) as the quality signal.
5. **Guards before the model:** a Cognito access token is required (401
   otherwise), texts over 10,000 characters are rejected (413), and the role
   may call only `bedrock-mantle:CreateInference`. An AWS Budgets alarm at
   $5 a month emails the account owner.

## Alternatives considered

| Alternative | Why it lost |
|---|---|
| Call Bedrock from the API, inside the VPC, through a `bedrock-mantle` VPC interface endpoint | About $7.30 a month per AZ, all month, for a feature used a few times a day. It also puts a slow (2–8 s), failure-prone external call into the API that every other screen depends on. Worth it only when the model must read the database (an "Ask Spry" chat). |
| The Claude API directly (api.anthropic.com) instead of Bedrock | Needs an API key to store, rotate and keep out of logs, and a second bill. Bedrock uses the function's IAM role, bills on the AWS account (Budgets, tags), and logs to CloudWatch and CloudTrail with the rest of the system. |
| A regular-expression parser | Free and predictable, but agendas come as numbered lists, bullets, prose, emails with signatures, in Ukrainian and English, with relative dates. A regex handles the format it was written for and silently drops the rest. |
| Let the model write the agenda directly (a tool that saves) | An injected instruction in the pasted text could then change data. With the model only filling a form, the worst an injection can do is a wrong suggestion that the user sees before saving. |

## Consequences

- **Cost per parse:** about 1,500–3,000 input and 300–800 output tokens. With
  Opus 5.5 ($4 / $20 per million) that is about $0.01–0.03 per parse; with
  Haiku 5.5 ($0.10 / $0.50) well under $0.001. The measured numbers are in the
  test table of the lab submission. 20 organisations × 30 agendas a week is
  about 2,600 parses a month: tens of dollars with Opus, about $1 with Haiku,
  against $7.30 a month for one VPC endpoint whether it is used or not.
- **What is logged:** one JSON line per parse in
  `/aws/lambda/<project>-agenda-parser` (`event: agenda_parsed`): user (Cognito
  sub), model, prompt version, input and output tokens, latency in ms and cost
  in dollars. Failures log `event: agenda_failed` with a code. The pasted text
  itself is not logged.
- **When Bedrock is down or throttling,** the screen says so (502 / 429) and
  the form stays usable: the user types the agenda by hand, and everything
  else in Spry keeps working, because the parser is a separate function.
- **Evaluation:** `ai_suggestion` next to the saved agenda turns every
  correction into feedback, so a new prompt version (`agenda-v2`) can be
  compared with `agenda-v1` on real data instead of by impression.
- **To narrow later:** the role's Bedrock permission uses `Resource: "*"`; it
  can be limited to the model ARNs in use.
