"""Errors the analytics agent reports to the operator."""


class AnalyticsError(Exception):
    """Base error. The previous analytics.json is left in place."""


class ConfigError(AnalyticsError):
    """Environment or CLI configuration is invalid."""


class OverlappingRunError(AnalyticsError):
    """Another analytics run still holds the lock."""


class ReportValidationError(AnalyticsError):
    """The report does not match the published schema."""


class FetchError(AnalyticsError):
    """Reading application data failed. No source rows were modified."""
