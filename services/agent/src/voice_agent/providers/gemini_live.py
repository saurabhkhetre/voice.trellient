"""Gemini Live provider — uses Google's Multimodal Live API via LiveKit plugin.

Requires:
  - GOOGLE_API_KEY in the environment
  - livekit-plugins-google installed (pip install livekit-agents[google])
"""

from __future__ import annotations

from typing import Any

from voice_agent.config import CallConfig, InfraConfig
from voice_agent.providers.base import ProviderNotConfigured, RealtimeModelProvider


class GeminiLiveProvider(RealtimeModelProvider):
    name = "gemini_live"

    def __init__(self, infra: InfraConfig) -> None:
        super().__init__(infra)

    def validate(self) -> None:
        if not self.infra.provider_keys.get("google"):
            raise ProviderNotConfigured("GOOGLE_API_KEY is not set")
        # Verify the plugin is actually installed
        try:
            from livekit.plugins import google  # noqa: F401
        except ImportError:
            raise ProviderNotConfigured(
                "livekit-plugins-google is not installed. "
                "Run: pip install 'livekit-agents[google]'"
            )

    def create_model(self, call_config: CallConfig | None = None) -> Any:
        self.validate()
        from livekit.plugins import google

        model = call_config.model if call_config else "gemini-2.0-flash-live-001"
        voice = call_config.voice if call_config else "Puck"

        return google.realtime.RealtimeModel(
            model=model,
            voice=voice,
            api_key=self.infra.provider_keys["google"],
        )
