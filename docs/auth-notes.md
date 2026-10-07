# Sign-in and API protection: notes

## What is in place

- **Cognito user pool** (`infra/cognito.yaml`, `make deploy-cognito`): email and
  password with self sign-up, plus Google as a federated identity provider.
  Cognito's managed login page shows both.
- **Frontend**: `/login/` starts the authorization code flow with PKCE
  (`react-oidc-context`), `/auth/callback` finishes it, the header shows the
  signed-in email. Every API call sends `Authorization: Bearer <access token>`.
- **Backend** (`backend/app/auth.py`): every `/api/meetings` request must carry
  a valid Cognito **access token**. The API checks the signature against the
  pool's JWKS, the expiry, the issuer (this pool), `token_use == "access"` and
  `client_id` (this app). Anything else gets `401`. With no pool configured it
  answers `503`, so a missing setting closes the API rather than opening it.
  `/health` stays public.
- The Lambda has no route to the internet (no NAT gateway), so it cannot fetch
  the JWKS itself. `make deploy-backend` downloads it and passes it in as the
  `COGNITO_JWKS` environment variable; the parsed keys are cached per process.

## Why does verification happen in the backend?

The frontend is code running on the attacker's machine. Its check is a UI
decision, not a security boundary:

- The API URL is in the site's JavaScript. Anyone can call it with `curl` or
  Postman and never load the site at all.
- Even in the browser, the check can be switched off in DevTools, or the
  bundle edited, so that `isAuthenticated` is always true.
- A token cannot be trusted just because it is present: without checking the
  signature, anyone could write a JWT by hand claiming to be any user.

If only the frontend checked, an attacker could read every meeting, create or
spam new ones, and (with more endpoints) change or delete other people's data.
The backend is the only place the attacker does not control, so the check has
to live there - on every request.

## Why not `AuthType: AWS_IAM` on the function URL?

`AWS_IAM` means every request must be signed with SigV4 using **AWS
credentials** of a principal allowed to call `lambda:InvokeFunctionUrl`.

- Browser users have no AWS credentials. To get them we would need a Cognito
  **identity pool** to exchange the user-pool token for temporary IAM
  credentials, and the frontend would have to sign every request with the AWS
  SDK. That is more infrastructure and more client code than checking a JWT.
- IAM answers "may this role invoke the function?", not "which user is this?".
  All signed-in users would typically share one role, so the app would still
  need the user's identity for per-user data.
- It ties the API to AWS-specific signing; any other client (mobile app,
  curl, tests) would need AWS credentials too.

A bearer JWT is the standard way for a browser to prove who the user is, and
it carries the identity (`sub`, `username`) the app needs.

## What would a JWT authorizer on API Gateway take off the code, and add to the bill?

Putting an **HTTP API** with a **JWT authorizer** in front of the Lambda:

Takes off:
- `backend/app/auth.py`'s verification: API Gateway checks the signature,
  `exp`, `iss` and `aud`/`client_id` itself and passes the verified claims to
  the function.
- The JWKS plumbing: API Gateway fetches and caches the keys, so the
  "download at deploy time because Lambda has no internet" step goes away.
- Rejected requests never invoke the Lambda, so bots with no token cost no
  Lambda time and cannot wake Aurora.
- A custom domain for the API becomes straightforward.

Adds:
- Per-request cost: HTTP APIs bill roughly **$1.00 per million requests** on
  top of Lambda (the API Gateway free tier only covers new accounts' first 12
  months / the new-account credits).
- One more resource to deploy, configure CORS on, and debug, plus a small
  extra network hop of latency.

For this app's traffic (a few thousand requests a month) the cost is cents
either way; the trade-off is less code versus one more moving part.

## Known limits

- Authentication, not authorization: every signed-in user sees all meetings.
  Per-user data would need an `owner_sub` column filled from the token.
- The function URL is still public; it rejects unauthenticated calls, but
  each rejected call still invokes the Lambda (unlike the API Gateway option).
