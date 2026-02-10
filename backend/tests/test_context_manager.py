"""Tests for ContextManager (summaries, manifests, transitive deps, state)."""

import os

import pytest

from app.utils.context_manager import ContextManager


class TestCapSummary:
    def test_short_text_unchanged(self):
        assert ContextManager.cap_summary("hello world") == "hello world"

    def test_exact_limit_unchanged(self):
        text = " ".join(["word"] * 500)
        assert ContextManager.cap_summary(text) == text

    def test_over_limit_truncated(self):
        text = " ".join(["word"] * 501)
        result = ContextManager.cap_summary(text)
        assert result.endswith("[truncated]")
        assert len(result.split()) == 501  # 500 words + "[truncated]"

    def test_custom_limit(self):
        text = "one two three four five"
        result = ContextManager.cap_summary(text, max_words=3)
        assert result == "one two three [truncated]"

    def test_empty_string(self):
        assert ContextManager.cap_summary("") == ""


class TestBuildFileManifest:
    def test_empty_directory(self, tmp_project_dir):
        result = ContextManager.build_file_manifest(tmp_project_dir)
        assert result == ""

    def test_single_file(self, tmp_project_dir):
        filepath = os.path.join(tmp_project_dir, "hello.py")
        with open(filepath, "w") as f:
            f.write("# My script\nprint('hello')\n")
        result = ContextManager.build_file_manifest(tmp_project_dir)
        assert "hello.py" in result
        assert "# My script" in result

    def test_skips_elisa_and_git(self, tmp_project_dir):
        os.makedirs(os.path.join(tmp_project_dir, ".elisa", "comms"))
        os.makedirs(os.path.join(tmp_project_dir, ".git", "objects"))
        with open(os.path.join(tmp_project_dir, ".elisa", "comms", "secret.md"), "w") as f:
            f.write("hidden")
        with open(os.path.join(tmp_project_dir, ".git", "objects", "abc"), "w") as f:
            f.write("blob")
        with open(os.path.join(tmp_project_dir, "visible.py"), "w") as f:
            f.write("# visible\n")
        result = ContextManager.build_file_manifest(tmp_project_dir)
        assert "visible.py" in result
        assert "secret.md" not in result
        assert "abc" not in result

    def test_nested_directory(self, tmp_project_dir):
        os.makedirs(os.path.join(tmp_project_dir, "src"))
        with open(os.path.join(tmp_project_dir, "src", "app.py"), "w") as f:
            f.write("import flask\n")
        result = ContextManager.build_file_manifest(tmp_project_dir)
        assert "src/app.py" in result
        assert "import flask" in result

    def test_cap_at_max_entries(self, tmp_project_dir):
        for i in range(10):
            with open(os.path.join(tmp_project_dir, f"file_{i:02d}.txt"), "w") as f:
                f.write(f"file {i}\n")
        result = ContextManager.build_file_manifest(tmp_project_dir, max_entries=5)
        lines = result.strip().split("\n")
        # Should have 5 file entries + possible overflow message
        assert len(lines) <= 6

    def test_binary_file_graceful(self, tmp_project_dir):
        with open(os.path.join(tmp_project_dir, "image.bin"), "wb") as f:
            f.write(bytes(range(256)))
        result = ContextManager.build_file_manifest(tmp_project_dir)
        assert "image.bin" in result


class TestBuildProjectContext:
    def test_empty(self):
        result = ContextManager.build_project_context({}, set())
        assert "# Project Context" in result

    def test_includes_completed_tasks(self):
        summaries = {"t1": "Built the login page", "t2": "Wrote tests"}
        result = ContextManager.build_project_context(summaries, {"t1", "t2"})
        assert "Built the login page" in result
        assert "Wrote tests" in result

    def test_excludes_incomplete_tasks(self):
        summaries = {"t1": "Done", "t2": "Not done"}
        result = ContextManager.build_project_context(summaries, {"t1"})
        assert "Done" in result
        assert "Not done" not in result

    def test_sorted_output(self):
        summaries = {"t3": "Third", "t1": "First", "t2": "Second"}
        result = ContextManager.build_project_context(summaries, {"t1", "t2", "t3"})
        assert result.index("First") < result.index("Second") < result.index("Third")


class TestBuildCurrentState:
    def test_basic_state(self):
        tasks = [{"id": "t1", "name": "Build", "status": "done", "agent_name": "Sparky"}]
        agents = [{"name": "Sparky", "role": "builder", "status": "idle"}]
        state = ContextManager.build_current_state(tasks, agents)
        assert state["tasks"]["t1"]["status"] == "done"
        assert state["agents"]["Sparky"]["role"] == "builder"

    def test_empty_lists(self):
        state = ContextManager.build_current_state([], [])
        assert state == {"tasks": {}, "agents": {}}


class TestGetTransitivePredecessors:
    def test_no_dependencies(self):
        task_map = {"t1": {"dependencies": []}}
        assert ContextManager.get_transitive_predecessors("t1", task_map) == []

    def test_direct_only(self):
        task_map = {
            "t1": {"dependencies": []},
            "t2": {"dependencies": ["t1"]},
        }
        result = ContextManager.get_transitive_predecessors("t2", task_map)
        assert result == ["t1"]

    def test_transitive_chain(self):
        task_map = {
            "t1": {"dependencies": []},
            "t2": {"dependencies": ["t1"]},
            "t3": {"dependencies": ["t2"]},
        }
        result = ContextManager.get_transitive_predecessors("t3", task_map)
        assert set(result) == {"t1", "t2"}

    def test_diamond(self):
        task_map = {
            "t1": {"dependencies": []},
            "t2": {"dependencies": ["t1"]},
            "t3": {"dependencies": ["t1"]},
            "t4": {"dependencies": ["t2", "t3"]},
        }
        result = ContextManager.get_transitive_predecessors("t4", task_map)
        assert set(result) == {"t1", "t2", "t3"}

    def test_missing_task_id(self):
        assert ContextManager.get_transitive_predecessors("missing", {}) == []

    def test_visited_set_prevents_loops(self):
        # Even though DAG validation prevents this, the code guards against it
        task_map = {
            "t1": {"dependencies": ["t2"]},
            "t2": {"dependencies": ["t1"]},
        }
        # Should terminate without infinite loop
        result = ContextManager.get_transitive_predecessors("t1", task_map)
        assert set(result) == {"t1", "t2"}


class TestTokenTracking:
    def test_track_and_get(self):
        ctx = ContextManager()
        ctx.track("Sparky", 1000)
        ctx.track("Sparky", 500)
        ctx.track("Checkers", 200)
        usage = ctx.get_usage()
        assert usage["Sparky"] == 1500
        assert usage["Checkers"] == 200

    def test_empty_usage(self):
        ctx = ContextManager()
        assert ctx.get_usage() == {}
