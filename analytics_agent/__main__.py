"""CLI entry point: python -m analytics_agent"""

from __future__ import annotations

import sys

from analytics_agent.config import PACKAGE_DIR, load_env_file, parse_config
from analytics_agent.errors import ConfigError
from analytics_agent.logging_setup import configure_logging
from analytics_agent.runner import run


def main(argv: list[str] | None = None) -> int:
    load_env_file(PACKAGE_DIR / ".env")
    try:
        config = parse_config(argv)
    except ConfigError as exc:
        print(f"analytics_agent: {exc}", file=sys.stderr)
        return 1
    configure_logging(config.log_level, config.log_file)
    return run(config)


if __name__ == "__main__":
    raise SystemExit(main())
