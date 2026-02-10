"""Manages context windows and token budgets for agent calls."""

import os
from typing import Any


class ContextManager:
    """Tracks and manages context across agent invocations."""

    def __init__(self, max_tokens: int = 100000) -> None:
        self.max_tokens = max_tokens
        self._usage: dict[str, int] = {}

    def track(self, agent_name: str, tokens_used: int) -> None:
        """Record token usage for an agent."""
        self._usage[agent_name] = self._usage.get(agent_name, 0) + tokens_used

    def get_usage(self) -> dict[str, int]:
        """Return token usage by agent."""
        return dict(self._usage)

    @staticmethod
    def cap_summary(text: str, max_words: int = 500) -> str:
        """Truncate a summary to max_words."""
        words = text.split()
        if len(words) <= max_words:
            return text
        return " ".join(words[:max_words]) + " [truncated]"

    @staticmethod
    def build_file_manifest(project_dir: str, max_entries: int = 200) -> str:
        """Walk project dir, return file listing with first-line hints.

        Skips .elisa/ and .git/ directories. Format per line:
            path/to/file.py  # first line of file
        """
        entries: list[str] = []
        for root, dirs, files in os.walk(project_dir):
            dirs[:] = [d for d in dirs if d not in (".elisa", ".git", "__pycache__")]
            for fname in sorted(files):
                full = os.path.join(root, fname)
                rel = os.path.relpath(full, project_dir).replace("\\", "/")
                hint = ""
                try:
                    with open(full, "r", encoding="utf-8", errors="replace") as f:
                        first = f.readline().strip()
                    if first:
                        hint = f"  # {first[:80]}"
                except Exception:
                    pass
                entries.append(f"{rel}{hint}")
                if len(entries) >= max_entries:
                    remaining = sum(1 for _ in _count_remaining(project_dir, dirs))
                    if remaining > 0:
                        entries.append(f"(and {remaining} more...)")
                    return "\n".join(entries)
        return "\n".join(entries)

    @staticmethod
    def build_project_context(
        task_summaries: dict[str, str], completed_task_ids: set[str]
    ) -> str:
        """Assemble cumulative project context from all completed task summaries."""
        lines = ["# Project Context", ""]
        for task_id in sorted(completed_task_ids):
            summary = task_summaries.get(task_id, "")
            if summary:
                lines.append(f"## {task_id}")
                lines.append(summary)
                lines.append("")
        return "\n".join(lines)

    @staticmethod
    def build_current_state(
        tasks: list[dict[str, Any]], agents: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Return JSON-serializable dict of task statuses and agent states."""
        return {
            "tasks": {
                t["id"]: {
                    "name": t.get("name", ""),
                    "status": t.get("status", "pending"),
                    "agent_name": t.get("agent_name", ""),
                }
                for t in tasks
            },
            "agents": {
                a["name"]: {
                    "role": a.get("role", ""),
                    "status": a.get("status", "idle"),
                }
                for a in agents
            },
        }

    @staticmethod
    def get_transitive_predecessors(
        task_id: str, task_map: dict[str, dict]
    ) -> list[str]:
        """Compute all transitive predecessor task IDs by walking dependencies."""
        result: list[str] = []
        visited: set[str] = set()
        stack = list(task_map.get(task_id, {}).get("dependencies", []))
        while stack:
            dep = stack.pop()
            if dep in visited:
                continue
            visited.add(dep)
            result.append(dep)
            stack.extend(task_map.get(dep, {}).get("dependencies", []))
        return result


def _count_remaining(project_dir: str, skip_dirs: list[str]):
    """Generator that yields 1 per file remaining (for counting overflow)."""
    for root, dirs, files in os.walk(project_dir):
        dirs[:] = [d for d in dirs if d not in (".elisa", ".git", "__pycache__")]
        for _ in files:
            yield 1
