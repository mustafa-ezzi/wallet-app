from __future__ import annotations

import json

from analytics_agent.lock import RunLock
from analytics_agent.runner import run
from tests.helpers import make_config, sample_snapshot


def test_fetcher_failure_preserves_previous_report(tmp_path):
    config = make_config(tmp_path)
    config.output_path.write_text("previous\n", encoding="utf-8")

    def boom(config, *, now, period):
        raise RuntimeError("database timed out")

    assert run(config, fetcher=boom) == 1
    assert config.output_path.read_text(encoding="utf-8") == "previous\n"
    assert not config.lock_path.exists()


def test_overlapping_run_does_not_fetch_or_replace(tmp_path):
    config = make_config(tmp_path)
    config.output_path.write_text("previous\n", encoding="utf-8")
    held = RunLock(config.lock_path)
    held.acquire()
    try:
        def should_not_run(config, *, now, period):
            raise AssertionError("overlapping run fetched data")

        assert run(config, fetcher=should_not_run) == 2
    finally:
        held.release()
    assert config.output_path.read_text(encoding="utf-8") == "previous\n"


def test_successful_run_publishes_valid_report(tmp_path):
    config = make_config(tmp_path, log_file=None)

    def fake(config, *, now, period):
        return sample_snapshot()

    assert run(config, fetcher=fake) == 0
    report = json.loads(config.output_path.read_text(encoding="utf-8"))
    assert report["schema_version"] == 1
    assert report["metrics"]["records"]["users"]["total"] == 10
    assert not config.lock_path.exists()


def test_dry_run_does_not_replace_file(tmp_path, capsys):
    config = make_config(tmp_path, dry_run=True)
    config.output_path.write_text("previous\n", encoding="utf-8")

    def fake(config, *, now, period):
        return sample_snapshot()

    assert run(config, fetcher=fake) == 0
    assert config.output_path.read_text(encoding="utf-8") == "previous\n"
    printed = json.loads(capsys.readouterr().out)
    assert printed["app"] == "wallettrails"
