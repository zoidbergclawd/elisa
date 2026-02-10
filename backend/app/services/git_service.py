"""Manages Git operations for build sessions."""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from git import Repo, InvalidGitRepositoryError

logger = logging.getLogger(__name__)


@dataclass
class CommitInfo:
    sha: str = ""
    short_sha: str = ""
    message: str = ""
    agent_name: str = ""
    task_id: str = ""
    timestamp: str = ""
    files_changed: list[str] = field(default_factory=list)


class GitService:
    """Handles repo init, commits, and log retrieval."""

    def init_repo(self, path: str, project_goal: str) -> None:
        """Initialize a git repo at path with a README and initial commit."""
        repo = Repo.init(path)
        repo.config_writer().set_value("user", "name", "Elisa").release()
        repo.config_writer().set_value("user", "email", "elisa@local").release()

        readme_path = f"{path}/README.md"
        with open(readme_path, "w", encoding="utf-8") as f:
            f.write(f"# {project_goal}\n\nBuilt with Elisa.\n")

        repo.index.add(["README.md"])
        repo.index.commit("Project started!")

    def commit(
        self, path: str, message: str, agent_name: str, task_id: str
    ) -> CommitInfo:
        """Stage all changes and commit. Returns CommitInfo (empty sha if nothing to commit)."""
        try:
            repo = Repo(path)
        except InvalidGitRepositoryError:
            logger.warning("No git repo at %s, skipping commit", path)
            return CommitInfo()

        repo.git.add(A=True)

        if not repo.is_dirty(index=True, working_tree=False):
            return CommitInfo()

        commit = repo.index.commit(message)
        changed = [item.a_path for item in commit.diff(commit.parents[0])] if commit.parents else []

        return CommitInfo(
            sha=commit.hexsha,
            short_sha=commit.hexsha[:7],
            message=message,
            agent_name=agent_name,
            task_id=task_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            files_changed=changed,
        )
