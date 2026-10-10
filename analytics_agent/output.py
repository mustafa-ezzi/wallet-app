"""Publish analytics.json only after the temporary file validates."""

from __future__ import annotations

import json
import os
from pathlib import Path

from analytics_agent.schema import validate_report


def dumps_report(report: dict) -> str:
    return json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n"


def publish(report: dict, path: Path) -> None:
    """Validate, write a sibling temp file, and replace the destination.

    If validation or replacement fails, the previous destination is unchanged.
    """
    validate_report(report)
    payload = dumps_report(report)
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + ".tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        loaded = json.loads(temporary.read_text(encoding="utf-8"))
        validate_report(loaded)
        os.replace(temporary, destination)
    except Exception:
        if temporary.exists():
            temporary.unlink()
        raise
