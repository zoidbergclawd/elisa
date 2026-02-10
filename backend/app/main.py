import asyncio
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.models.session import BuildSession, SessionState
from app.services.orchestrator import Orchestrator


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, session_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.connections.setdefault(session_id, []).append(ws)

    def disconnect(self, session_id: str, ws: WebSocket) -> None:
        conns = self.connections.get(session_id, [])
        if ws in conns:
            conns.remove(ws)

    async def send_event(self, session_id: str, event: dict) -> None:
        for ws in self.connections.get(session_id, []):
            try:
                await ws.send_json(event)
            except Exception:
                pass


manager = ConnectionManager()
sessions: dict[str, BuildSession] = {}
running_tasks: dict[str, asyncio.Task] = {}
orchestrators: dict[str, Orchestrator] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Elisa Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartRequest(BaseModel):
    spec: dict


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/sessions")
async def create_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = BuildSession(id=session_id, state=SessionState.idle)
    return {"session_id": session_id}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.model_dump()


@app.post("/api/sessions/{session_id}/start")
async def start_session(session_id: str, req: StartRequest):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.state = SessionState.planning
    session.spec = req.spec

    orchestrator = Orchestrator(
        session=session,
        send_event=lambda evt: manager.send_event(session_id, evt),
    )
    orchestrators[session_id] = orchestrator

    task = asyncio.create_task(orchestrator.run(req.spec))
    running_tasks[session_id] = task

    return {"status": "started"}


@app.post("/api/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    task = running_tasks.pop(session_id, None)
    if task and not task.done():
        task.cancel()

    session.state = SessionState.done
    await manager.send_event(
        session_id,
        {"type": "error", "message": "Build stopped by user", "recoverable": False},
    )

    return {"status": "stopped"}


@app.get("/api/sessions/{session_id}/tasks")
async def get_session_tasks(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.tasks


@app.get("/api/sessions/{session_id}/git")
async def get_session_git(session_id: str):
    orch = orchestrators.get(session_id)
    if not orch:
        raise HTTPException(status_code=404, detail="Session not found")
    return orch.get_commits()


@app.get("/api/templates")
async def list_templates():
    return []


@app.websocket("/ws/session/{session_id}")
async def websocket_endpoint(ws: WebSocket, session_id: str):
    await manager.connect(session_id, ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id, ws)
