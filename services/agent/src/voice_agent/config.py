"""Configuration loading and validation for the voice agent.

Infrastructure config (LiveKit credentials, API keys) comes from environment.
Per-call agent config (model, voice, greeting) comes from the database via
room/job metadata → BusinessClient.load_context().

Nothing here is ever logged verbatim.
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
class InfraConfig:
    """Infrastructure credentials — loaded once at worker startup from env."""

    livekit_url: str
    livekit_api_key: str
    livekit_api_secret: str
    provider_keys: dict[str, str] = field(default_factory=dict)

    # Defaults used when the DB agent_config doesn't specify values
    default_provider: str = "openai_realtime"
    default_model: str = "gpt-4o-realtime-preview"
    default_voice: str = "alloy"
    default_greeting: str = (
        "Hey, I'm your voice assistant. What would you like to talk about?"
    )

    @property
    def redacted(self) -> dict[str, str]:
        """Log-safe view of the configuration."""
        return {
            "livekit_url": self.livekit_url,
            "default_provider": self.default_provider,
            "default_model": self.default_model,
            "default_voice": self.default_voice,
            "livekit_api_key": _mask(self.livekit_api_key),
        }


@dataclass(frozen=True)
class CallConfig:
    """Per-call runtime configuration — built from DB agent_configs row."""

    provider: str
    model: str
    voice: str
    voice_speed: float = 1.0
    greeting: str = "Thank you for calling. How can I help you today?"
    max_call_seconds: int = 900
    recording_enabled: bool = False

    @staticmethod
    def from_db(config: dict, defaults: InfraConfig) -> "CallConfig":
        """Build a CallConfig from a DB agent_configs row, falling back to
        infrastructure defaults for any missing fields."""
        return CallConfig(
            provider=config.get("model_provider") or defaults.default_provider,
            model=config.get("model_name") or defaults.default_model,
            voice=config.get("voice_name") or defaults.default_voice,
            voice_speed=float(config.get("voice_speed") or 1.0),
            greeting=config.get("greeting") or defaults.default_greeting,
            max_call_seconds=int(config.get("max_call_seconds") or 900),
            recording_enabled=bool(config.get("recording_enabled")),
        )


# Keep backward-compatible alias for existing code that references AgentConfig
AgentConfig = InfraConfig


def _mask(value: str) -> str:
    if len(value) <= 4:
        return "***"
    return f"{value[:2]}***{value[-2:]}"


def load_config(env: dict[str, str] | None = None) -> InfraConfig:
    """Reads and validates infrastructure configuration from the environment."""
    source = env if env is not None else dict(os.environ)

    livekit_url = (source.get("LIVEKIT_URL") or "").strip()
    api_key = (source.get("LIVEKIT_API_KEY") or "").strip()
    api_secret = (source.get("LIVEKIT_API_SECRET") or "").strip()

    missing: list[str] = []
    if not livekit_url:
        missing.append("LIVEKIT_URL")
    elif not livekit_url.startswith(("ws://", "wss://")):
        missing.append("LIVEKIT_URL (must start with ws:// or wss://)")
    if not api_key:
        missing.append("LIVEKIT_API_KEY")
    if not api_secret:
        missing.append("LIVEKIT_API_SECRET")

    # Collect all available provider keys — we don't know which provider
    # a particular call will need until room metadata arrives.
    provider_keys: dict[str, str] = {}
    openai_key = (source.get("OPENAI_API_KEY") or "").strip()
    if openai_key:
        provider_keys["openai"] = openai_key

    google_key = (source.get("GOOGLE_API_KEY") or "").strip()
    if google_key:
        provider_keys["google"] = google_key

    # At least one provider key is needed
    if not provider_keys:
        missing.append("OPENAI_API_KEY or GOOGLE_API_KEY (at least one required)")

    if missing:
        raise ConfigError(missing)

    return InfraConfig(
        livekit_url=livekit_url,
        livekit_api_key=api_key,
        livekit_api_secret=api_secret,
        default_provider=(source.get("REALTIME_PROVIDER") or "openai_realtime").strip(),
        default_model=(source.get("REALTIME_MODEL") or "gpt-4o-realtime-preview").strip(),
        default_voice=(source.get("AGENT_VOICE") or "alloy").strip(),
        default_greeting=(
            source.get("AGENT_GREETING")
            or "Hey, I'm your voice assistant. What would you like to talk about?"
        ).strip(),
        provider_keys=provider_keys,
    )
