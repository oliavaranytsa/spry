"""The API refuses requests without a valid Cognito access token."""

import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings
from app.main import create_app

POOL = "eu-north-1_TestPool"
CLIENT_ID = "test-client"
ISSUER = f"https://cognito-idp.eu-north-1.amazonaws.com/{POOL}"

_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(_key.public_key()))
_jwk.update(kid="test-kid", alg="RS256", use="sig")


def _token(key=_key, **overrides) -> str:
    claims = {
        "sub": "user-1",
        "iss": ISSUER,
        "exp": int(time.time()) + 600,
        "token_use": "access",
        "client_id": CLIENT_ID,
        "username": "user-1",
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-kid"})


@pytest.fixture
async def api() -> AsyncClient:
    """The real app with a pretend user pool whose keys the tests control."""
    app = create_app()
    settings = Settings(
        cognito_region="eu-north-1",
        cognito_user_pool_id=POOL,
        cognito_client_id=CLIENT_ID,
        cognito_jwks=json.dumps({"keys": [_jwk]}),
    )
    app.dependency_overrides[get_settings] = lambda: settings
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def test_health_stays_public(api: AsyncClient) -> None:
    assert (await api.get("/health")).status_code == 200


async def test_no_token_is_401(api: AsyncClient) -> None:
    response = await api.get("/api/meetings")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        _token(exp=int(time.time()) - 3600),
        _token(iss="https://cognito-idp.eu-north-1.amazonaws.com/someone-else"),
        _token(client_id="another-app"),
        _token(token_use="id"),
        _token(key=rsa.generate_private_key(public_exponent=65537, key_size=2048)),
    ],
    ids=["garbage", "expired", "other-pool", "other-client", "id-token", "forged"],
)
async def test_bad_token_is_401(api: AsyncClient, token: str) -> None:
    response = await api.get("/api/meetings", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


async def test_no_pool_configured_is_503() -> None:
    # A missing user pool closes the API rather than leaving it open.
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        cognito_user_pool_id="", cognito_client_id=""
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get("/api/meetings")).status_code == 503
