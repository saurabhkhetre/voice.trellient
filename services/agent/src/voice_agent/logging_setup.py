"""Structured JSON logging. Secrets are never written here."""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any

LOGGER_NAME = "voice_agent"

_REDACT_KEYS = {
    "api_key",
    "api_secret",
    "openai_api_key",
    "google_api_key",
    "token",
    "authorization",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname.lower(),
            "logger": record.name,
            "event": getattr(record, "event", record.getMessage()),
        }
        extra = getattr(record, "data", None)
        if isinstance(extra, dict):
            payload.update(_redact(extra))
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info).splitlines()[-1]
        return json.dumps(payload, default=str)


def _redact(data: dict[str, Any]) -> dict[str, Any]:
    return {
        key: ("***" if key.lower() in _REDACT_KEYS else value)
        for key, value in data.items()
    }


def setup_logging() -> logging.Logger:
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)

    return logging.getLogger(LOGGER_NAME)


def log_event(logger: logging.Logger, event: str, **data: Any) -> None:
    """Emits one structured event line."""
    logger.info(event, extra={"event": event, "data": data})
