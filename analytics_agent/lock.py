"""Stop a second scheduled run from overlapping the first."""

from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from pathlib import Path

from analytics_agent.errors import OverlappingRunError


def pid_exists(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        kernel32 = ctypes.windll.kernel32
        process_query_limited_information = 0x1000
        handle = kernel32.OpenProcess(process_query_limited_information, False, pid)
        if handle:
            kernel32.CloseHandle(handle)
            return True
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _read_pid(path: Path) -> int | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    for line in text.splitlines():
        if line.startswith("pid="):
            try:
                return int(line.split("=", 1)[1].strip())
            except ValueError:
                return None
    return None


def _is_stale(path: Path, stale_seconds: int) -> bool:
    pid = _read_pid(path)
    if pid is not None:
        return not pid_exists(pid)
    try:
        age = time.time() - path.stat().st_mtime
    except OSError:
        return True
    return age >= stale_seconds


class RunLock:
    def __init__(self, path: Path, stale_seconds: int = 3600) -> None:
        self.path = Path(path)
        self.stale_seconds = stale_seconds
        self._held = False

    def acquire(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists() and _is_stale(self.path, self.stale_seconds):
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass
        try:
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            holder = _read_pid(self.path)
            who = f"pid {holder}" if holder else "another process"
            raise OverlappingRunError(
                f"Analytics run already in progress ({who}). "
                f"Lock file: {self.path}."
            ) from exc
        payload = (
            f"pid={os.getpid()}\n"
            f"created_at={datetime.now(timezone.utc).isoformat()}\n"
        )
        try:
            os.write(fd, payload.encode("utf-8"))
        finally:
            os.close(fd)
        self._held = True

    def release(self) -> None:
        if not self._held:
            return
        if _read_pid(self.path) == os.getpid():
            try:
                self.path.unlink()
            except FileNotFoundError:
                pass
        self._held = False

    def __enter__(self) -> "RunLock":
        self.acquire()
        return self

    def __exit__(self, *exc_info) -> None:
        self.release()
