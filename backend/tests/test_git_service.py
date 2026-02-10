"""Tests for GitService (repo init, commits, edge cases)."""

import os

import pytest
from git import Repo

from app.services.git_service import GitService, CommitInfo


class TestGitServiceInit:
    def test_init_creates_repo(self, tmp_project_dir):
        svc = GitService()
        svc.init_repo(tmp_project_dir, "My Project")
        assert os.path.isdir(os.path.join(tmp_project_dir, ".git"))

    def test_init_creates_readme(self, tmp_project_dir):
        svc = GitService()
        svc.init_repo(tmp_project_dir, "My Project")
        readme = os.path.join(tmp_project_dir, "README.md")
        assert os.path.isfile(readme)
        with open(readme) as f:
            content = f.read()
        assert "My Project" in content

    def test_init_creates_initial_commit(self, tmp_project_dir):
        svc = GitService()
        svc.init_repo(tmp_project_dir, "My Project")
        repo = Repo(tmp_project_dir)
        commits = list(repo.iter_commits())
        assert len(commits) == 1
        assert commits[0].message.strip() == "Project started!"

    def test_init_configures_user(self, tmp_project_dir):
        svc = GitService()
        svc.init_repo(tmp_project_dir, "Test")
        repo = Repo(tmp_project_dir)
        reader = repo.config_reader()
        assert reader.get_value("user", "name") == "Elisa"
        assert reader.get_value("user", "email") == "elisa@local"


class TestGitServiceCommit:
    def test_commit_with_changes(self, tmp_project_dir):
        svc = GitService()
        svc.init_repo(tmp_project_dir, "Test")

        with open(os.path.join(tmp_project_dir, "app.py"), "w") as f:
            f.write("print('hello')\n")

        info = svc.commit(tmp_project_dir, "Added app", "Sparky", "t1")
        assert info.sha != ""
        assert info.short_sha == info.sha[:7]
        assert info.message == "Added app"
        assert info.agent_name == "Sparky"
        assert info.task_id == "t1"
        assert info.timestamp != ""

    def test_commit_no_changes(self, tmp_project_dir):
        svc = GitService()
        svc.init_repo(tmp_project_dir, "Test")

        info = svc.commit(tmp_project_dir, "Nothing changed", "Sparky", "t1")
        assert info.sha == ""
        assert info.short_sha == ""

    def test_commit_not_a_repo(self, tmp_project_dir):
        svc = GitService()
        info = svc.commit(tmp_project_dir, "No repo", "Sparky", "t1")
        assert info.sha == ""

    def test_multiple_commits(self, tmp_project_dir):
        svc = GitService()
        svc.init_repo(tmp_project_dir, "Test")

        with open(os.path.join(tmp_project_dir, "a.py"), "w") as f:
            f.write("a\n")
        info1 = svc.commit(tmp_project_dir, "First", "Sparky", "t1")

        with open(os.path.join(tmp_project_dir, "b.py"), "w") as f:
            f.write("b\n")
        info2 = svc.commit(tmp_project_dir, "Second", "Checkers", "t2")

        assert info1.sha != info2.sha
        repo = Repo(tmp_project_dir)
        commits = list(repo.iter_commits())
        assert len(commits) == 3  # init + 2 commits


class TestCommitInfo:
    def test_defaults(self):
        info = CommitInfo()
        assert info.sha == ""
        assert info.files_changed == []

    def test_custom_values(self):
        info = CommitInfo(sha="abc123", agent_name="Bot", files_changed=["a.py"])
        assert info.sha == "abc123"
        assert info.files_changed == ["a.py"]
