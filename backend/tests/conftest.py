"""Shared test fixtures."""

import os
import tempfile
import shutil

import pytest


@pytest.fixture
def tmp_project_dir():
    """Create a temporary project directory and clean up after test."""
    d = tempfile.mkdtemp(prefix="elisa-test-")
    yield d
    shutil.rmtree(d, ignore_errors=True)
