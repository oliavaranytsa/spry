import uuid
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


AGENDA = {
    "items": [
        {"topic": "Release plan", "owner": "Olena", "minutes": 20},
        {"topic": "Q&A", "owner": None, "minutes": None},
    ],
    "action_items": [{"task": "Send the notes", "owner": "Taras", "due": "2026-10-23"}],
}


async def test_new_meeting_has_no_agenda(client: AsyncClient) -> None:
    meeting = (await client.post("/api/meetings", json=_payload())).json()
    assert meeting["agenda"] is None


async def test_save_agenda_typed_by_hand(client: AsyncClient, session) -> None:
    from app.models.meeting import Meeting

    meeting_id = (await client.post("/api/meetings", json=_payload())).json()["id"]

    saved = await client.put(f"/api/meetings/{meeting_id}/agenda", json=AGENDA)
    assert saved.status_code == 200
    assert saved.json()["agenda"] == AGENDA

    fetched = await client.get(f"/api/meetings/{meeting_id}")
    assert fetched.json()["agenda"] == AGENDA
    assert (await session.get(Meeting, uuid.UUID(meeting_id))).ai_suggestion is None


async def test_save_agenda_keeps_the_model_suggestion(client: AsyncClient, session) -> None:
    from app.models.meeting import Meeting

    meeting_id = (await client.post("/api/meetings", json=_payload())).json()["id"]
    suggestion = {
        "agenda": {"items": [{"topic": "Release plan", "owner": "Olena"}], "language": "en"},
        "model": "anthropic.claude-opus-5-5",
        "prompt_version": "agenda-v1",
    }

    saved = await client.put(
        f"/api/meetings/{meeting_id}/agenda", json={**AGENDA, "ai_suggestion": suggestion}
    )
    assert saved.status_code == 200
    # The suggestion is stored, but never sent back to the browser.
    assert "ai_suggestion" not in saved.json()
    meeting = await session.get(Meeting, uuid.UUID(meeting_id))
    assert meeting.ai_suggestion == suggestion


async def test_save_agenda_validates_like_any_other_input(client: AsyncClient) -> None:
    meeting_id = (await client.post("/api/meetings", json=_payload())).json()["id"]
    bad = {"items": [{"topic": "", "minutes": 9999}]}
    response = await client.put(f"/api/meetings/{meeting_id}/agenda", json=bad)
    assert response.status_code == 422


async def test_save_agenda_for_missing_meeting(client: AsyncClient) -> None:
    missing = "00000000-0000-0000-0000-000000000000"
    response = await client.put(f"/api/meetings/{missing}/agenda", json=AGENDA)
    assert response.status_code == 404


async def test_update_meeting_keeps_the_agenda(client: AsyncClient) -> None:
    meeting_id = (await client.post("/api/meetings", json=_payload())).json()["id"]
    await client.put(f"/api/meetings/{meeting_id}/agenda", json=AGENDA)

    changed = _payload(title="lab meeting, moved", attendee_count=3)
    response = await client.put(f"/api/meetings/{meeting_id}", json=changed)
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "lab meeting, moved"
    assert body["attendee_count"] == 3
    assert body["agenda"] == AGENDA


async def test_update_meeting_validates_like_create(client: AsyncClient) -> None:
    meeting_id = (await client.post("/api/meetings", json=_payload())).json()["id"]
    bad = _payload(ends_at=(START - timedelta(hours=1)).isoformat())
    response = await client.put(f"/api/meetings/{meeting_id}", json=bad)
    assert response.status_code == 422


async def test_delete_meeting(client: AsyncClient) -> None:
    meeting_id = (await client.post("/api/meetings", json=_payload())).json()["id"]

    assert (await client.delete(f"/api/meetings/{meeting_id}")).status_code == 204
    assert (await client.get(f"/api/meetings/{meeting_id}")).status_code == 404
    assert (await client.delete(f"/api/meetings/{meeting_id}")).status_code == 404
