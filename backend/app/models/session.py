from enum import Enum
from typing import Any

from pydantic import BaseModel


class SessionState(str, Enum):
    idle = "idle"
    planning = "planning"
    executing = "executing"
    testing = "testing"
    deploying = "deploying"
    reviewing = "reviewing"
    done = "done"


class BuildSession(BaseModel):
    id: str
    state: SessionState = SessionState.idle
    spec: dict[str, Any] | None = None
    tasks: list[dict[str, Any]] = []
    agents: list[dict[str, Any]] = []
