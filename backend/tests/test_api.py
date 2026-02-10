"""Tests for FastAPI endpoints."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


class TestHealthEndpoint:
    async def test_health(self, client):
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestSessionEndpoints:
    async def test_create_session(self, client):
        resp = await client.post("/api/sessions")
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data

    async def test_get_session(self, client):
        resp = await client.post("/api/sessions")
        sid = resp.json()["session_id"]
        resp = await client.get(f"/api/sessions/{sid}")
        assert resp.status_code == 200
        assert resp.json()["id"] == sid

    async def test_get_session_not_found(self, client):
        resp = await client.get("/api/sessions/nonexistent")
        assert resp.status_code == 404

    async def test_get_tasks_empty(self, client):
        resp = await client.post("/api/sessions")
        sid = resp.json()["session_id"]
        resp = await client.get(f"/api/sessions/{sid}/tasks")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_stop_session(self, client):
        resp = await client.post("/api/sessions")
        sid = resp.json()["session_id"]
        resp = await client.post(f"/api/sessions/{sid}/stop")
        assert resp.status_code == 200


class TestGitEndpoint:
    async def test_git_not_found(self, client):
        resp = await client.get("/api/sessions/nonexistent/git")
        assert resp.status_code == 404

    async def test_git_empty_after_create(self, client):
        # Create session and start (which creates orchestrator)
        resp = await client.post("/api/sessions")
        sid = resp.json()["session_id"]
        # Start with minimal spec (will fail planning but orchestrator is created)
        await client.post(
            f"/api/sessions/{sid}/start",
            json={"spec": {"project": {"goal": "test"}}},
        )
        resp = await client.get(f"/api/sessions/{sid}/git")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestTemplatesEndpoint:
    async def test_list_templates(self, client):
        resp = await client.get("/api/templates")
        assert resp.status_code == 200
        assert resp.json() == []
