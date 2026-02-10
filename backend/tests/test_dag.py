"""Tests for TaskDAG (topological sort, cycle detection, ready tasks)."""

from graphlib import CycleError

import pytest

from app.utils.dag import TaskDAG


class TestTaskDAG:
    def test_empty_dag(self):
        dag = TaskDAG()
        assert dag.get_order() == []
        assert dag.get_ready(set()) == []

    def test_single_task(self):
        dag = TaskDAG()
        dag.add_task("t1")
        assert dag.get_order() == ["t1"]
        assert dag.get_ready(set()) == ["t1"]

    def test_linear_chain(self):
        dag = TaskDAG()
        dag.add_task("t1")
        dag.add_task("t2", ["t1"])
        dag.add_task("t3", ["t2"])
        order = dag.get_order()
        assert order.index("t1") < order.index("t2") < order.index("t3")

    def test_diamond_dependency(self):
        dag = TaskDAG()
        dag.add_task("t1")
        dag.add_task("t2", ["t1"])
        dag.add_task("t3", ["t1"])
        dag.add_task("t4", ["t2", "t3"])
        order = dag.get_order()
        assert order.index("t1") < order.index("t2")
        assert order.index("t1") < order.index("t3")
        assert order.index("t2") < order.index("t4")
        assert order.index("t3") < order.index("t4")

    def test_cycle_detection(self):
        dag = TaskDAG()
        dag.add_task("t1", ["t2"])
        dag.add_task("t2", ["t1"])
        with pytest.raises(CycleError):
            dag.get_order()

    def test_get_ready_none_completed(self):
        dag = TaskDAG()
        dag.add_task("t1")
        dag.add_task("t2", ["t1"])
        assert dag.get_ready(set()) == ["t1"]

    def test_get_ready_after_first_done(self):
        dag = TaskDAG()
        dag.add_task("t1")
        dag.add_task("t2", ["t1"])
        dag.add_task("t3", ["t1"])
        ready = dag.get_ready({"t1"})
        assert sorted(ready) == ["t2", "t3"]

    def test_get_ready_excludes_completed(self):
        dag = TaskDAG()
        dag.add_task("t1")
        dag.add_task("t2", ["t1"])
        assert dag.get_ready({"t1", "t2"}) == []

    def test_get_ready_blocked_task(self):
        dag = TaskDAG()
        dag.add_task("t1")
        dag.add_task("t2", ["t1"])
        dag.add_task("t3", ["t1", "t2"])
        ready = dag.get_ready({"t1"})
        assert ready == ["t2"]

    def test_independent_tasks_all_ready(self):
        dag = TaskDAG()
        dag.add_task("t1")
        dag.add_task("t2")
        dag.add_task("t3")
        ready = dag.get_ready(set())
        assert sorted(ready) == ["t1", "t2", "t3"]
