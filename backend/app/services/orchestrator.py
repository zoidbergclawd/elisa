"""Orchestrates the build pipeline: planning, execution, testing, deployment."""

import asyncio
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
from app.services.hardware_service import HardwareService
from app.services.meta_planner import MetaPlanner
from app.services.teaching_engine import TeachingEngine
from app.services.test_runner import TestRunner
from app.utils.context_manager import ContextManager
from app.utils.dag import TaskDAG
from app.utils.token_tracker import TokenTracker

logger = logging.getLogger(__name__)

PROMPT_MODULES = {
    "builder": builder_agent,
    "tester": tester_agent,
    "reviewer": reviewer_agent,
    "custom": builder_agent,
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
        self._token_tracker = TokenTracker()
        self._teaching_engine = TeachingEngine()
        self._test_runner = TestRunner()
        self._hardware_service = HardwareService()
        self._project_type: str = "software"
        self._test_results: dict = {}
        self._gate_event = asyncio.Event()
        self._gate_response: dict | None = None
        self._serial_task: asyncio.Task | None = None

    async def run(self, spec: dict) -> None:
        """Execute the full build pipeline for a session."""
        try:
            await self._plan(spec)
            await self._execute()
            await self._run_tests()
            if self._should_deploy_hardware():
                await self._deploy_hardware()
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

        # Derive project type from spec (Gap 12)
        self._project_type = (
            (self._session.spec or {}).get("project", {}).get("type", "software")
        )

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

        plan_explanation = plan.get("plan_explanation", "")

        await self._send({
            "type": "plan_ready",
            "tasks": self._tasks,
            "agents": self._agents,
            "explanation": plan_explanation,
        })

        # Teaching moment for task decomposition
        await self._maybe_teach("plan_ready", plan_explanation)

        # Teaching moments for skills and rules
        if spec.get("skills"):
            await self._maybe_teach("skill_used", "")
        if spec.get("rules"):
            await self._maybe_teach("rule_used", "")

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

            # Inject agent-category skills and always-on rules
            spec_data = self._session.spec or {}
            agent_skills = [
                s for s in spec_data.get("skills", [])
                if s.get("category") == "agent"
            ]
            always_rules = [
                r for r in spec_data.get("rules", [])
                if r.get("trigger") == "always"
            ]
            if agent_skills or always_rules:
                system_prompt += "\n\n## Kid's Custom Instructions\n"
                for s in agent_skills:
                    system_prompt += f"### Skill: {s['name']}\n{s['prompt']}\n\n"
                for r in always_rules:
                    system_prompt += f"### Rule: {r['name']}\n{r['prompt']}\n\n"

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
                        # Inject on_test_fail rules into retry prompt
                        on_fail_rules = [
                            r for r in spec_data.get("rules", [])
                            if r.get("trigger") == "on_test_fail"
                        ]
                        if on_fail_rules:
                            user_prompt += "\n\n## Retry Rules (kid's rules)\n"
                            for r in on_fail_rules:
                                user_prompt += f"### {r['name']}\n{r['prompt']}\n"
                        await self._send({
                            "type": "agent_output",
                            "task_id": task_id,
                            "agent_name": agent_name,
                            "content": f"Retrying... (attempt {retry_count + 1})",
                        })

            # Track tokens regardless of success/failure
            if result:
                self._token_tracker.add_for_agent(
                    agent_name, result.input_tokens, result.output_tokens, result.cost_usd
                )
                await self._send({
                    "type": "token_usage",
                    "agent_name": agent_name,
                    "input_tokens": result.input_tokens,
                    "output_tokens": result.output_tokens,
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

                # Emit agent_message with PRD-correct shape
                if task_id in self._task_summaries:
                    await self._send({
                        "type": "agent_message",
                        "from": agent_name,
                        "to": "team",
                        "content": self._task_summaries[task_id][:500],
                    })

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
                            # Teaching moment for source control
                            await self._maybe_teach("commit_created", commit_msg)
                    except Exception:
                        logger.warning("Git commit failed for %s", task_id, exc_info=True)

                await self._send({
                    "type": "task_completed",
                    "task_id": task_id,
                    "summary": result.summary if result else "",
                })

                # Teaching moments for tester/reviewer completion (Gap 5, 13)
                if agent_role == "tester":
                    summary = result.summary if result else ""
                    await self._maybe_teach("tester_task_completed", summary)
                elif agent_role == "reviewer":
                    summary = result.summary if result else ""
                    await self._maybe_teach("reviewer_task_completed", summary)

                # Check if a human gate should fire after this task
                if self._should_fire_gate(task, completed):
                    await self._fire_human_gate(task)
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

                # Retry exhaustion triggers automatic human gate (PRD 5.4)
                if retry_count > max_retries:
                    await self._fire_human_gate(
                        task,
                        question="We're having trouble with this part. Can you help us figure it out?",
                        context=result.summary if result else "Task failed after retries",
                    )
                else:
                    await self._send({
                        "type": "error",
                        "message": f"Agent couldn't complete task: {task.get('name', task_id)}",
                        "recoverable": True,
                    })

            completed.add(task_id)

    def _should_fire_gate(self, task: dict, completed: set[str]) -> bool:
        """Check if a human gate should fire after this task completes."""
        spec = self._session.spec or {}
        human_gates = spec.get("workflow", {}).get("human_gates", [])
        if not human_gates:
            return False
        # Fire gate when past the midpoint of tasks (all build tasks done)
        midpoint = len(self._tasks) // 2
        done_count = len(completed) + 1  # +1 for current task
        return done_count == midpoint and done_count > 0

    async def _fire_human_gate(
        self,
        task: dict,
        question: str = "",
        context: str = "",
    ) -> None:
        """Pause execution and wait for human approval."""
        self._session.state = SessionState.reviewing
        self._gate_event.clear()
        self._gate_response = None

        if not question:
            question = "I've made some progress. Want to take a look before I continue?"
        if not context:
            context = f"Just completed: {task.get('name', task['id'])}"

        await self._send({
            "type": "human_gate",
            "task_id": task["id"],
            "question": question,
            "context": context,
        })

        # Block until REST endpoint responds
        await self._gate_event.wait()

        response = self._gate_response or {"approved": True}
        if not response.get("approved", True):
            # Create a revision task with kid's feedback (PRD 5.3)
            feedback = response.get("feedback", "")
            revision_task = {
                "id": f"task-revision-{task['id']}",
                "name": f"Revise: {task.get('name', task['id'])}",
                "description": f"Revise based on feedback: {feedback}",
                "acceptance_criteria": [f"Address feedback: {feedback}"],
                "dependencies": [task["id"]],
                "agent_name": task.get("agent_name", ""),
                "status": "pending",
            }
            self._tasks.append(revision_task)
            self._task_map[revision_task["id"]] = revision_task
            self._dag.add_task(revision_task["id"], revision_task["dependencies"])

        # Resume execution
        self._session.state = SessionState.executing

    def respond_to_gate(self, approved: bool, feedback: str = "") -> None:
        """Called by REST endpoint to respond to a human gate."""
        self._gate_response = {"approved": approved, "feedback": feedback}
        self._gate_event.set()

    def _should_deploy_hardware(self) -> bool:
        """Check if the project targets hardware deployment."""
        spec = self._session.spec or {}
        target = spec.get("deployment", {}).get("target", "preview")
        return target in ("esp32", "both")

    async def _deploy_hardware(self) -> None:
        """Compile and flash project to ESP32."""
        self._session.state = SessionState.deploying
        await self._send({"type": "deploy_started", "target": "esp32"})

        # Log before_deploy rules for awareness (injected into final task prompts)
        spec_data = self._session.spec or {}
        deploy_rules = [
            r for r in spec_data.get("rules", [])
            if r.get("trigger") == "before_deploy"
        ]
        if deploy_rules:
            checklist = "\n".join(
                f"- {r['name']}: {r['prompt']}" for r in deploy_rules
            )
            logger.info("Before-deploy rules:\n%s", checklist)

        # Step 1: Compile
        await self._send({
            "type": "deploy_progress",
            "step": "Compiling MicroPython code...",
            "progress": 25,
        })
        compile_result = await self._hardware_service.compile(self._project_dir)
        await self._maybe_teach("hardware_compile", "")

        if not compile_result.success:
            await self._send({
                "type": "deploy_progress",
                "step": f"Compile failed: {', '.join(compile_result.errors)}",
                "progress": 25,
            })
            await self._send({
                "type": "error",
                "message": f"Compilation failed: {', '.join(compile_result.errors)}",
                "recoverable": True,
            })
            return

        # Step 2: Flash
        await self._send({
            "type": "deploy_progress",
            "step": "Flashing to board...",
            "progress": 60,
        })
        flash_result = await self._hardware_service.flash(self._project_dir)
        await self._maybe_teach("hardware_flash", "")

        if not flash_result.success:
            await self._send({
                "type": "deploy_progress",
                "step": flash_result.message,
                "progress": 60,
            })
            await self._send({
                "type": "error",
                "message": flash_result.message,
                "recoverable": True,
            })
            return

        # Step 3: Serial monitor
        await self._send({
            "type": "deploy_progress",
            "step": "Starting serial monitor...",
            "progress": 90,
        })

        board = await self._hardware_service.detect_board()
        if board:
            async def serial_callback(line: str) -> None:
                from datetime import datetime, timezone
                await self._send({
                    "type": "serial_data",
                    "line": line,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            self._serial_task = await self._hardware_service.start_serial_monitor(
                board.port, serial_callback
            )

        # Check for hardware-specific teaching moments
        hw_components = (self._session.spec or {}).get("hardware", {}).get("components", [])
        for comp in hw_components:
            comp_type = comp.get("type", "")
            if comp_type in ("led", "button", "sensor", "buzzer"):
                await self._maybe_teach("hardware_led", "")
                break
        for comp in hw_components:
            if comp.get("type", "") in ("lora_send", "lora_receive"):
                await self._maybe_teach("hardware_lora", "")
                break

        await self._send({"type": "deploy_complete", "target": "esp32"})

    async def _run_tests(self) -> None:
        """Run tests on the generated project."""
        self._session.state = SessionState.testing
        results = await self._test_runner.run_tests(self._project_dir)
        self._test_results = results

        for test in results.get("tests", []):
            await self._send({
                "type": "test_result",
                "test_name": test["test_name"],
                "passed": test["passed"],
                "details": test["details"],
            })

        if results.get("coverage_pct") is not None:
            await self._send({
                "type": "coverage_update",
                "percentage": results["coverage_pct"],
                "details": results.get("coverage_details", {}),
            })
            await self._maybe_teach("coverage_update", f"{results['coverage_pct']}% coverage")

        if results["total"] > 0:
            summary = f"{results['passed']}/{results['total']} tests passing"
            event_type = "test_result_pass" if results["failed"] == 0 else "test_result_fail"
            await self._maybe_teach(event_type, summary)

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

        # Include teaching summary (Gap 7)
        shown = self._teaching_engine.get_shown_concepts()
        if shown:
            concept_names = [c.split(":")[0] for c in shown]
            unique_concepts = list(dict.fromkeys(concept_names))
            summary_parts.append(f"Concepts learned: {', '.join(unique_concepts)}")

        await self._send({
            "type": "session_complete",
            "summary": " ".join(summary_parts),
        })

    async def _maybe_teach(self, event_type: str, event_details: str = "") -> None:
        """Emit a teaching moment if one is appropriate for this event."""
        moment = await self._teaching_engine.get_moment(
            event_type, event_details, self._project_type
        )
        if moment:
            await self._send({"type": "teaching_moment", **moment})

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

    def get_test_results(self) -> dict:
        """Return test results for REST endpoint."""
        return self._test_results

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
