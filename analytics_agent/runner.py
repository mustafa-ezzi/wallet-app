"""Run one analytics pass: lock, read, calculate, validate, publish."""

from __future__ import annotations

import logging
import sys
from datetime import datetime

from analytics_agent.errors import FetchError, OverlappingRunError
from analytics_agent.fetch import fetch_snapshot
from analytics_agent.insights import build_insights
from analytics_agent.lock import RunLock
from analytics_agent.metrics import build_report
from analytics_agent.output import dumps_report, publish
from analytics_agent.periods import require_zone, trailing_period
from analytics_agent.schema import validate_report

logger = logging.getLogger("analytics_agent")


def run(config, *, fetcher=None, insight_builder=None, publisher=None) -> int:
    lock = RunLock(config.lock_path, config.lock_stale_seconds)
    try:
        lock.acquire()
    except OverlappingRunError as exc:
        logger.error("%s", exc)
        return 2

    try:
        zone = require_zone(config.timezone)
        now = datetime.now(zone)
        period = trailing_period(now.date(), config.period_days, config.timezone)
        logger.info(
            "analytics run started period=%s..%s timezone=%s dry_run=%s",
            period.start,
            period.end,
            config.timezone,
            config.dry_run,
        )
        snapshot = (fetcher or fetch_snapshot)(config, now=now, period=period)
        snapshot["cron"] = config.cron
        snapshot["category_limit"] = config.category_limit
        snapshot["generated_at"] = now
        report = build_report(snapshot)
        insights, extra_warnings = (insight_builder or build_insights)(report, config)
        report["insights"] = insights
        warnings = [*report["status"]["warnings"], *extra_warnings]
        report["status"]["warnings"] = warnings[:20]
        report["status"]["state"] = "partial" if warnings else "ok"
        report["status"]["read_only"] = True

        if config.dry_run:
            validate_report(report)
            sys.stdout.write(dumps_report(report))
            logger.info("dry run validated; analytics.json was not replaced")
            return 0

        (publisher or publish)(report, config.output_path)
        logger.info(
            "published %s users=%s transactions=%s state=%s",
            config.output_path,
            report["metrics"]["records"]["users"]["total"],
            report["metrics"]["records"]["transactions"]["total"],
            report["status"]["state"],
        )
        return 0
    except FetchError as exc:
        logger.error("analytics run failed; previous report preserved: %s", exc)
        return 1
    except Exception:
        logger.exception("analytics run failed; previous report preserved")
        return 1
    finally:
        lock.release()
