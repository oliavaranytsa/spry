"""Who is calling? Verify the Cognito access token on every protected request.

The frontend signs in with Cognito and sends the access token it got back as
``Authorization: Bearer <token>``. Nothing the browser says can be trusted on
its own - anyone can call the function URL with curl - so the backend checks,
before doing any work:

- the signature, against the user pool's public keys (JWKS);
- the expiry (``exp``);
- the issuer (``iss``): this user pool and no other;
- that it is an access token (``token_use``) issued to this app (``client_id``).

Anything else answers 401. With no user pool configured at all, protected
routes answer 503, so a missing setting can never leave the API open.

The keys: on Lambda the function has no route to the internet (no NAT
gateway), so scripts/deploy-backend.sh downloads them at deploy time and hands
them over in COGNITO_JWKS. Elsewhere, with COGNITO_JWKS empty, they are fetched
from the issuer once. Either way they are parsed once and cached for the life
of the process, not fetched per request.
"""

import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

# A little slack for clocks that disagree by a few seconds.
LEEWAY_SECONDS = 30


class InvalidToken(Exception):
    """The token is missing, malformed, forged, expired or meant for someone else."""


@dataclass(frozen=True)
class User:
    sub: str
    username: str
    email: str | None = None


@lru_cache(maxsize=4)
def _keys(issuer: str, jwks_json: str) -> dict[str, Any]:
    """kid -> public key, parsed once per pool and cached."""
    if not jwks_json:
        with urllib.request.urlopen(f"{issuer}/.well-known/jwks.json", timeout=5) as resp:
            jwks_json = resp.read().decode()
    jwks = jwt.PyJWKSet.from_json(jwks_json)
    return {key.key_id: key.key for key in jwks.keys}


def verify_token(token: str, settings: Settings) -> dict[str, Any]:
    """Return the token's claims if it is a valid access token for this app."""
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError as exc:
        raise InvalidToken("malformed token") from exc

    key = _keys(settings.cognito_issuer, settings.cognito_jwks).get(kid)
    if key is None:
        raise InvalidToken("unknown signing key")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.cognito_issuer,
            leeway=LEEWAY_SECONDS,
            # Cognito access tokens carry client_id instead of aud.
            options={"require": ["exp", "iss", "sub"], "verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise InvalidToken(str(exc)) from exc

    # An ID token is signed by the same keys; it must not pass as an access token.
    if claims.get("token_use") != "access":
        raise InvalidToken("not an access token")
    if claims.get("client_id") != settings.cognito_client_id:
        raise InvalidToken("token was issued to another client")
    return claims


_bearer = HTTPBearer(auto_error=False)


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if not settings.auth_configured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Sign-in is not configured")

    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Not signed in",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        claims = verify_token(credentials.credentials, settings)
    except InvalidToken as exc:
        raise unauthorized from exc

    return User(
        sub=claims["sub"],
        username=claims.get("username", claims["sub"]),
        email=claims.get("email"),
    )


CurrentUser = Annotated[User, Depends(current_user)]
