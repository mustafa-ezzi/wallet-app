from __future__ import annotations

import os

from analytics_agent.errors import OverlappingRunError
from analytics_agent.lock import RunLock
import pytest


def test_live_pid_blocks_a_second_run(tmp_path):
    path = tmp_path / "analytics.json.lock"
    path.write_text(f"pid={os.getpid()}\n", encoding="utf-8")
    lock = RunLock(path, stale_seconds=3600)
    with pytest.raises(OverlappingRunError):
        lock.acquire()


def test_dead_pid_is_replaced(tmp_path):
    path = tmp_path / "analytics.json.lock"
    path.write_text("pid=2147000000\n", encoding="utf-8")
    lock = RunLock(path, stale_seconds=3600)
    lock.acquire()
    try:
        assert f"pid={os.getpid()}" in path.read_text(encoding="utf-8")
    finally:
        lock.release()
    assert not path.exists()


def test_release_lets_the_next_run_start(tmp_path):
    path = tmp_path / "analytics.json.lock"
    first = RunLock(path)
    second = RunLock(path)
    with first:
        with pytest.raises(OverlappingRunError):
            second.acquire()
    second.acquire()
    second.release()
    assert not path.exists()
