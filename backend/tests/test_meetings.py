from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

START = datetime(2026, 10, 2, 16, 0, tzinfo=UTC)


def _payload(**overrides):
    body = {
        "title": "lab meeting",
        "starts_at": START.isoformat(),
        "ends_at": (START + timedelta(hours=2)).isoformat(),
        "attendee_count": 7,
    }
    body.update(overrides)
    return body


async def test_create_then_list_meeting(client: AsyncClient) -> None:
    created = await client.post("/api/meetings", json=_payload())
    assert created.status_code == 201
    meeting = created.json()
    assert meeting["title"] == "lab meeting"
    assert meeting["attendee_count"] == 7
    assert "id" in meeting

    listed = await client.get("/api/meetings")
    assert listed.status_code == 200
    assert [m["id"] for m in listed.json()] == [meeting["id"]]


async def test_rejects_meeting_ending_before_it_starts(client: AsyncClient) -> None:
    bad = _payload(ends_at=(START - timedelta(hours=1)).isoformat())
    response = await client.post("/api/meetings", json=bad)
    assert response.status_code in (400, 422)
