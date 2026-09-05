"""Configuration loading and validation for the voice agent.

All secrets come from the environment. Nothing here is ever logged verbatim.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


class ConfigError(RuntimeError):
    """Raised when required configuration is missing or malformed."""

    def __init__(self, missing: list[str]) -> None:
        self.missing = missing
        super().__init__("Invalid agent configuration: " + ", ".join(missing))


@dataclass(frozen=True)
class AgentConfig:
    """Validated runtime configuration for a single agent worker."""

    livekit_url: str
    livekit_api_key: str
    livekit_api_secret: str
    provider: str = "openai_realtime"
    voice: str = "alloy"
    model: str = "gpt-4o-realtime-preview"
    greeting: str = (
        "Hey, I'm your voice assistant. What would you like to talk about?"
    )
    provider_keys: dict[str, str] = field(default_factory=dict)

    @property
    def redacted(self) -> dict[str, str]:
        """Log-safe view of the configuration."""
        return {
            "livekit_url": self.livekit_url,
            "provider": self.provider,
            "model": self.model,
            "voice": self.voice,
            "livekit_api_key": _mask(self.livekit_api_key),
        }


def _mask(value: str) -> str:
    if len(value) <= 4:
        return "***"
    return f"{value[:2]}***{value[-2:]}"


def load_config(env: dict[str, str] | None = None) -> AgentConfig:
    """Reads and validates configuration from the environment."""
    source = env if env is not None else dict(os.environ)

    livekit_url = (source.get("LIVEKIT_URL") or "").strip()
    api_key = (source.get("LIVEKIT_API_KEY") or "").strip()
    api_secret = (source.get("LIVEKIT_API_SECRET") or "").strip()
    provider = (source.get("REALTIME_PROVIDER") or "openai_realtime").strip()

    missing: list[str] = []
    if not livekit_url:
        missing.append("LIVEKIT_URL")
    elif not livekit_url.startswith(("ws://", "wss://")):
        missing.append("LIVEKIT_URL (must start with ws:// or wss://)")
    if not api_key:
        missing.append("LIVEKIT_API_KEY")
    if not api_secret:
        missing.append("LIVEKIT_API_SECRET")

    provider_keys: dict[str, str] = {}
    if provider == "openai_realtime":
        openai_key = (source.get("OPENAI_API_KEY") or "").strip()
        if not openai_key:
            missing.append("OPENAI_API_KEY")
        else:
            provider_keys["openai"] = openai_key
    elif provider == "gemini_live":
        gemini_key = (source.get("GOOGLE_API_KEY") or "").strip()
        if not gemini_key:
            missing.append("GOOGLE_API_KEY")
        else:
            provider_keys["google"] = gemini_key
    else:
        missing.append(f"REALTIME_PROVIDER (unknown value '{provider}')")

    if missing:
        raise ConfigError(missing)

    return AgentConfig(
        livekit_url=livekit_url,
        livekit_api_key=api_key,
        livekit_api_secret=api_secret,
        provider=provider,
        voice=(source.get("AGENT_VOICE") or "alloy").strip(),
        model=(source.get("REALTIME_MODEL") or "gpt-4o-realtime-preview").strip(),
        greeting=(
            source.get("AGENT_GREETING")
            or "Hey, I'm your voice assistant. What would you like to talk about?"
        ).strip(),
        provider_keys=provider_keys,
    )
