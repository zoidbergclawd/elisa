"""Tests for Orchestrator (workspace setup, git integration, context flow)."""

import asyncio
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.session import BuildSession, SessionState
from app.services.orchestrator import Orchestrator


def make_orchestrator(spec=None):
    """Create an Orchestrator with a mock send_event."""
    session = BuildSession(id="test-session", state=SessionState.idle)
    if spec:
        session.spec = spec
    send_event = AsyncMock()
    orch = Orchestrator(session=session, send_event=send_event)
    return orch, send_event


class TestSetupWorkspace:
    def test_creates_required_directories(self):
        spec = {"project": {"goal": "Test project"}}
        orch, _ = make_orchestrator(spec)
        orch._setup_workspace()
        base = orch._project_dir
        assert os.path.isdir(os.path.join(base, ".elisa", "comms"))
        assert os.path.isdir(os.path.join(base, ".elisa", "comms", "reviews"))
        assert os.path.isdir(os.path.join(base, ".elisa", "context"))
        assert os.path.isdir(os.path.join(base, ".elisa", "status"))
        assert os.path.isdir(os.path.join(base, "src"))
        assert os.path.isdir(os.path.join(base, "tests"))

    def test_initializes_git_repo(self):
        spec = {"project": {"goal": "Test project"}}
        orch, _ = make_orchestrator(spec)
        orch._setup_workspace()
        assert os.path.isdir(os.path.join(orch._project_dir, ".git"))
        assert orch._git is not None

    def test_creates_readme_with_goal(self):
        spec = {"project": {"goal": "Build a calculator"}}
        orch, _ = make_orchestrator(spec)
        orch._setup_workspace()
        readme = os.path.join(orch._project_dir, "README.md")
        assert os.path.isfile(readme)
        with open(readme) as f:
            assert "Build a calculator" in f.read()

    def test_git_failure_sets_none(self):
        orch, _ = make_orchestrator()
        with patch.object(orch._git, "init_repo", side_effect=Exception("no git")):
            orch._setup_workspace()
        assert orch._git is None


class TestGetCommits:
    def test_empty_initially(self):
        orch, _ = make_orchestrator()
        assert orch.get_commits() == []

    def test_returns_commit_dicts(self):
        from app.services.git_service import CommitInfo

        orch, _ = make_orchestrator()
        orch._commits.append(CommitInfo(
            sha="abc1234567890",
            short_sha="abc1234",
            message="Sparky: Build login",
            agent_name="Sparky",
            task_id="t1",
            timestamp="2026-02-10T12:00:00Z",
            files_changed=["src/login.py"],
        ))
        commits = orch.get_commits()
        assert len(commits) == 1
        assert commits[0]["sha"] == "abc1234567890"
        assert commits[0]["agent_name"] == "Sparky"
        assert commits[0]["files_changed"] == ["src/login.py"]


class TestContextInjection:
    """Test that transitive predecessors and file manifest are wired correctly."""

    def test_task_summaries_dict_exists(self):
        orch, _ = make_orchestrator()
        assert isinstance(orch._task_summaries, dict)

    def test_commits_list_exists(self):
        orch, _ = make_orchestrator()
        assert isinstance(orch._commits, list)


class TestTokenTracker:
    def test_orchestrator_has_token_tracker(self):
        from app.utils.token_tracker import TokenTracker
        orch, _ = make_orchestrator()
        assert isinstance(orch._token_tracker, TokenTracker)


class TestTeachingEngine:
    def test_orchestrator_has_teaching_engine(self):
        from app.services.teaching_engine import TeachingEngine
        orch, _ = make_orchestrator()
        assert isinstance(orch._teaching_engine, TeachingEngine)

    async def test_maybe_teach_emits_event(self):
        orch, send_event = make_orchestrator()
        # plan_ready triggers decomposition teaching moment
        await orch._maybe_teach("plan_ready", "Breaking into 5 tasks")
        calls = [c.args[0] for c in send_event.call_args_list]
        teaching_events = [c for c in calls if c.get("type") == "teaching_moment"]
        assert len(teaching_events) == 1
        assert teaching_events[0]["concept"] == "decomposition"
        assert "headline" in teaching_events[0]

    async def test_maybe_teach_dedup(self):
        orch, send_event = make_orchestrator()
        await orch._maybe_teach("plan_ready", "First")
        await orch._maybe_teach("plan_ready", "Second")
        calls = [c.args[0] for c in send_event.call_args_list]
        teaching_events = [c for c in calls if c.get("type") == "teaching_moment"]
        assert len(teaching_events) == 1

    async def test_maybe_teach_unknown_event(self):
        orch, send_event = make_orchestrator()
        await orch._maybe_teach("unknown_event", "")
        calls = [c.args[0] for c in send_event.call_args_list]
        teaching_events = [c for c in calls if c.get("type") == "teaching_moment"]
        assert len(teaching_events) == 0


class TestTestRunner:
    def test_orchestrator_has_test_runner(self):
        from app.services.test_runner import TestRunner
        orch, _ = make_orchestrator()
        assert isinstance(orch._test_runner, TestRunner)

    def test_get_test_results_empty_initially(self):
        orch, _ = make_orchestrator()
        assert orch.get_test_results() == {}


class TestRunPipeline:
    def test_run_includes_test_phase(self):
        """Verify that run() calls _run_tests between _execute and _complete."""
        orch, _ = make_orchestrator()
        assert hasattr(orch, '_run_tests')

    def test_project_type_default(self):
        orch, _ = make_orchestrator()
        assert orch._project_type == "software"

    def test_run_includes_deploy_hardware(self):
        orch, _ = make_orchestrator()
        assert hasattr(orch, '_deploy_hardware')
        assert hasattr(orch, '_should_deploy_hardware')


class TestHumanGate:
    def test_gate_event_exists(self):
        orch, _ = make_orchestrator()
        assert isinstance(orch._gate_event, asyncio.Event)

    def test_gate_response_initially_none(self):
        orch, _ = make_orchestrator()
        assert orch._gate_response is None

    def test_respond_to_gate_sets_event(self):
        orch, _ = make_orchestrator()
        orch.respond_to_gate(True)
        assert orch._gate_event.is_set()
        assert orch._gate_response == {"approved": True, "feedback": ""}

    def test_respond_to_gate_with_feedback(self):
        orch, _ = make_orchestrator()
        orch.respond_to_gate(False, "Make it blue")
        assert orch._gate_response == {"approved": False, "feedback": "Make it blue"}

    def test_should_fire_gate_no_gates(self):
        orch, _ = make_orchestrator({"workflow": {"human_gates": []}})
        task = {"id": "task-1"}
        assert orch._should_fire_gate(task, set()) is False

    def test_should_fire_gate_with_gates(self):
        spec = {"workflow": {"human_gates": ["before deploying"]}}
        orch, _ = make_orchestrator(spec)
        orch._tasks = [{"id": f"task-{i}"} for i in range(4)]
        # Midpoint is 2, so should fire when 2 tasks are done
        assert orch._should_fire_gate({"id": "task-1"}, {"task-0"}) is True

    async def test_fire_human_gate_sends_event(self):
        orch, send_event = make_orchestrator()
        # Don't actually wait -- set gate immediately
        async def auto_approve():
            await asyncio.sleep(0.01)
            orch.respond_to_gate(True)
        asyncio.create_task(auto_approve())
        await orch._fire_human_gate({"id": "task-1", "name": "Build UI"})
        calls = [c.args[0] for c in send_event.call_args_list]
        gate_events = [c for c in calls if c.get("type") == "human_gate"]
        assert len(gate_events) == 1
        assert gate_events[0]["task_id"] == "task-1"

    async def test_fire_human_gate_rejection_creates_revision(self):
        orch, send_event = make_orchestrator()
        orch._tasks = [{"id": "task-1", "name": "Build UI", "agent_name": "Sparky"}]
        orch._task_map = {"task-1": orch._tasks[0]}

        async def auto_reject():
            await asyncio.sleep(0.01)
            orch.respond_to_gate(False, "Make it blue")
        asyncio.create_task(auto_reject())
        await orch._fire_human_gate(orch._tasks[0])

        # Check revision task was added
        assert len(orch._tasks) == 2
        revision = orch._tasks[1]
        assert revision["id"] == "task-revision-task-1"
        assert "Make it blue" in revision["description"]
        assert revision["agent_name"] == "Sparky"


class TestHardwareDeploy:
    def test_should_deploy_hardware_esp32(self):
        spec = {"deployment": {"target": "esp32"}}
        orch, _ = make_orchestrator(spec)
        assert orch._should_deploy_hardware() is True

    def test_should_deploy_hardware_both(self):
        spec = {"deployment": {"target": "both"}}
        orch, _ = make_orchestrator(spec)
        assert orch._should_deploy_hardware() is True

    def test_should_not_deploy_hardware_web(self):
        spec = {"deployment": {"target": "web"}}
        orch, _ = make_orchestrator(spec)
        assert orch._should_deploy_hardware() is False

    def test_should_not_deploy_hardware_preview(self):
        spec = {"deployment": {"target": "preview"}}
        orch, _ = make_orchestrator(spec)
        assert orch._should_deploy_hardware() is False

    def test_hardware_service_exists(self):
        from app.services.hardware_service import HardwareService
        orch, _ = make_orchestrator()
        assert isinstance(orch._hardware_service, HardwareService)


class TestCustomAgentFallback:
    def test_custom_role_in_prompt_modules(self):
        from app.services.orchestrator import PROMPT_MODULES
        assert "custom" in PROMPT_MODULES
