"""Worker entrypoint. Run locally with:

    python -m voice_agent.main dev

and in production LiveKit Cloud runs:

    python -m voice_agent.main start
"""

from __future__ import annotations

import functools

from livekit.agents import JobContext, WorkerOptions, cli

from voice_agent.agent import entrypoint
from voice_agent.config import ConfigError, load_config
from voice_agent.logging_setup import log_event, setup_logging


def main() -> None:
    logger = setup_logging()

    try:
        config = load_config()
    except ConfigError as exc:
        log_event(logger, "agent.config_invalid", missing=exc.missing)
        raise SystemExit(
            "Missing configuration: " + ", ".join(exc.missing) + ". See .env.example."
        ) from exc

    log_event(logger, "agent.started", **config.redacted)

    async def job(ctx: JobContext) -> None:
        await entrypoint(ctx, config)

    try:
        cli.run_app(
            WorkerOptions(
                entrypoint_fnc=functools.partial(job),
                ws_url=config.livekit_url,
                api_key=config.livekit_api_key,
                api_secret=config.livekit_api_secret,
            )
        )
    finally:
        log_event(logger, "agent.stopped")


if __name__ == "__main__":
    main()
