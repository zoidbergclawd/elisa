"""Orchestrates the build pipeline: planning, execution, testing, deployment."""

import json
import logging
import os
import tempfile
from graphlib import CycleError
from typing import Any, Callable, Awaitable

from app.models.session import BuildSession, SessionState
from app.prompts import builder_agent, tester_agent, reviewer_agent
from app.services.agent_runner import AgentRunner
from app.services.git_service import GitService, CommitInfo
from app.services.meta_planner import MetaPlanner
from app.utils.context_manager import ContextManager
from app.utils.dag import TaskDAG

logger = logging.getLogger(__name__)

PROMPT_MODULES = {
    "builder": builder_agent,
    "tester": tester_agent,
    "reviewer": reviewer_agent,
}


class Orchestrator:
    """Manages the lifecycle of a build session."""

    def __init__(
        self,
        session: BuildSession,
        send_event: Callable[[dict], Awaitable[None]],
    ) -> None:
        self._session = session
        self._send = send_event
        self._meta_planner = MetaPlanner()
        self._agent_runner = AgentRunner()
        self._dag = TaskDAG()
        self._tasks: list[dict[str, Any]] = []
        self._agents: list[dict[str, Any]] = []
        self._task_map: dict[str, dict] = {}
        self._agent_map: dict[str, dict] = {}
        self._task_summaries: dict[str, str] = {}
        self._project_dir = tempfile.mkdtemp(prefix="elisa-project-")
        self._git: GitService | None = GitService()
        self._context = ContextManager()
        self._commits: list[CommitInfo] = []

    async def run(self, spec: dict) -> None:
        """Execute the full build pipeline for a session."""
        try:
            await self._plan(spec)
            await self._execute()
            await self._complete()
        except Exception as e:
            logger.exception("Orchestrator error")
            await self._send({
                "type": "error",
                "message": str(e),
                "recoverable": False,
            })

    async def _plan(self, spec: dict) -> None:
        """Call meta-planner and build the task DAG."""
        self._session.state = SessionState.planning
        await self._send({"type": "planning_started"})

        plan = await self._meta_planner.plan(spec)

        self._tasks = plan["tasks"]
        self._agents = plan["agents"]
        self._task_map = {t["id"]: t for t in self._tasks}
        self._agent_map = {a["name"]: a for a in self._agents}

        for task in self._tasks:
            task.setdefault("status", "pending")
        for agent in self._agents:
            agent.setdefault("status", "idle")

        for task in self._tasks:
            self._dag.add_task(task["id"], task.get("dependencies", []))

        try:
            self._dag.get_order()
        except CycleError:
            await self._send({
                "type": "error",
                "message": "Oops, some tasks depend on each other in a circle. "
                           "The plan can't be executed.",
                "recoverable": False,
            })
            raise ValueError("Circular dependencies in task DAG")

        self._session.tasks = self._tasks
        self._session.agents = self._agents

        await self._send({
            "type": "plan_ready",
            "tasks": self._tasks,
            "agents": self._agents,
            "explanation": plan.get("plan_explanation", ""),
        })

    async def _execute(self) -> None:
        """Execute tasks in dependency order."""
        self._session.state = SessionState.executing
        self._setup_workspace()

        completed: set[str] = set()

        while len(completed) < len(self._tasks):
            ready = self._dag.get_ready(completed)

            if not ready:
                await self._send({
                    "type": "error",
                    "message": "Some tasks are blocked and cannot proceed.",
                    "recoverable": False,
                })
                break

            task = self._task_map[ready[0]]
            task_id = task["id"]
            agent_name = task.get("agent_name", "")
            agent = self._agent_map.get(agent_name, {})
            agent_role = agent.get("role", "builder")

            task["status"] = "in_progress"
            if agent:
                agent["status"] = "working"

            await self._send({
                "type": "task_started",
                "task_id": task_id,
                "agent_name": agent_name,
            })

            prompt_module = PROMPT_MODULES.get(agent_role, builder_agent)
            system_prompt = prompt_module.SYSTEM_PROMPT.format(
                agent_name=agent_name,
                persona=agent.get("persona", ""),
                allowed_paths=", ".join(agent.get("allowed_paths", ["src/", "tests/"])),
                restricted_paths=", ".join(agent.get("restricted_paths", [".elisa/"])),
                task_id=task_id,
            )

            # Transitive predecessors instead of direct-only
            all_predecessor_ids = self._context.get_transitive_predecessors(
                task_id, self._task_map
            )
            predecessor_summaries = []
            for dep_id in all_predecessor_ids:
                if dep_id in self._task_summaries:
                    capped = ContextManager.cap_summary(self._task_summaries[dep_id])
                    predecessor_summaries.append(capped)

            user_prompt = prompt_module.format_task_prompt(
                agent_name=agent_name,
                role=agent_role,
                persona=agent.get("persona", ""),
                task=task,
                spec=self._session.spec or {},
                predecessors=predecessor_summaries,
                style=self._session.spec.get("style") if self._session.spec else None,
            )

            # Append file manifest to prompt
            file_manifest = self._context.build_file_manifest(self._project_dir)
            if file_manifest:
                user_prompt += f"\n\n## FILES IN WORKSPACE\n{file_manifest}"

            retry_count = 0
            max_retries = 2
            success = False
            result = None

            while not success and retry_count <= max_retries:
                result = await self._agent_runner.execute(
                    task_id=task_id,
                    prompt=user_prompt,
                    system_prompt=system_prompt,
                    on_output=self._make_output_handler(agent_name),
                    working_dir=self._project_dir,
                )
                if result.success:
                    success = True
                    self._task_summaries[task_id] = result.summary
                else:
                    retry_count += 1
                    if retry_count <= max_retries:
                        await self._send({
                            "type": "agent_output",
                            "task_id": task_id,
                            "agent_name": agent_name,
                            "content": f"Retrying... (attempt {retry_count + 1})",
                        })

            if success:
                task["status"] = "done"
                if agent:
                    agent["status"] = "idle"

                # Read comms file if agent wrote one (real communication channel)
                comms_path = os.path.join(
                    self._project_dir, ".elisa", "comms", f"{task_id}_summary.md"
                )
                if os.path.isfile(comms_path):
                    try:
                        with open(comms_path, "r", encoding="utf-8", errors="replace") as f:
                            self._task_summaries[task_id] = f.read()
                    except Exception:
                        pass

                # Update project_context.md
                context_path = os.path.join(
                    self._project_dir, ".elisa", "context", "project_context.md"
                )
                context_text = self._context.build_project_context(
                    self._task_summaries, completed | {task_id}
                )
                with open(context_path, "w", encoding="utf-8") as f:
                    f.write(context_text)

                # Update current_state.json
                state_path = os.path.join(
                    self._project_dir, ".elisa", "status", "current_state.json"
                )
                state = self._context.build_current_state(self._tasks, self._agents)
                with open(state_path, "w", encoding="utf-8") as f:
                    json.dump(state, f, indent=2)

                # Git commit
                if self._git:
                    commit_msg = f"{agent_name}: {task.get('name', task_id)}"
                    try:
                        commit_info = self._git.commit(
                            self._project_dir, commit_msg, agent_name, task_id
                        )
                        if commit_info.sha:
                            self._commits.append(commit_info)
                            await self._send({
                                "type": "commit_created",
                                "sha": commit_info.short_sha,
                                "message": commit_info.message,
                                "agent_name": commit_info.agent_name,
                                "task_id": commit_info.task_id,
                                "timestamp": commit_info.timestamp,
                                "files_changed": commit_info.files_changed,
                            })
                    except Exception:
                        logger.warning("Git commit failed for %s", task_id, exc_info=True)

                await self._send({
                    "type": "task_completed",
                    "task_id": task_id,
                    "summary": result.summary if result else "",
                })
            else:
                task["status"] = "failed"
                if agent:
                    agent["status"] = "error"
                await self._send({
                    "type": "task_failed",
                    "task_id": task_id,
                    "error": result.summary if result else "Unknown error",
                    "retry_count": retry_count,
                })
                await self._send({
                    "type": "error",
                    "message": f"Agent couldn't complete task: {task.get('name', task_id)}",
                    "recoverable": True,
                })

            completed.add(task_id)

    async def _complete(self) -> None:
        """Mark session as done and send completion event."""
        self._session.state = SessionState.done
        for agent in self._agents:
            agent["status"] = "done"

        done_count = sum(1 for t in self._tasks if t.get("status") == "done")
        total = len(self._tasks)
        failed_count = sum(1 for t in self._tasks if t.get("status") == "failed")

        summary_parts = [f"Completed {done_count}/{total} tasks."]
        if failed_count:
            summary_parts.append(f"{failed_count} task(s) failed.")

        await self._send({
            "type": "session_complete",
            "summary": " ".join(summary_parts),
        })

    def _setup_workspace(self) -> None:
        """Create project workspace directories and init git repo."""
        dirs = [
            os.path.join(self._project_dir, ".elisa", "comms"),
            os.path.join(self._project_dir, ".elisa", "comms", "reviews"),
            os.path.join(self._project_dir, ".elisa", "context"),
            os.path.join(self._project_dir, ".elisa", "status"),
            os.path.join(self._project_dir, "src"),
            os.path.join(self._project_dir, "tests"),
        ]
        for d in dirs:
            os.makedirs(d, exist_ok=True)

        # Init git repo with README from project spec
        if self._git:
            try:
                goal = (self._session.spec or {}).get("project", {}).get(
                    "goal", "Elisa project"
                )
                self._git.init_repo(self._project_dir, goal)
            except Exception:
                logger.warning("Git not available, continuing without version control")
                self._git = None

    def get_commits(self) -> list[dict]:
        """Return commit history for REST endpoint."""
        return [
            {
                "sha": c.sha,
                "short_sha": c.short_sha,
                "message": c.message,
                "agent_name": c.agent_name,
                "task_id": c.task_id,
                "timestamp": c.timestamp,
                "files_changed": c.files_changed,
            }
            for c in self._commits
        ]

    def _make_output_handler(
        self, agent_name: str
    ) -> Callable[[str, str], Awaitable[None]]:
        """Create an output handler that sends agent_output events."""
        async def handler(task_id: str, content: str) -> None:
            await self._send({
                "type": "agent_output",
                "task_id": task_id,
                "agent_name": agent_name,
                "content": content,
            })
        return handler
