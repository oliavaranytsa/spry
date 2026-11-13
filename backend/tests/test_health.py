from httpx import AsyncClient


async def test_liveness(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


async def test_api_health(client: AsyncClient) -> None:
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


async def test_database_health(anon_client: AsyncClient) -> None:
    """Public, no token: it only says the database answers and how many meetings exist."""
    response = await anon_client.get("/api/health/db")
    assert response.status_code == 200
    body = response.json()
    assert body["database"] == "ok"
    assert isinstance(body["meetings"], int)
