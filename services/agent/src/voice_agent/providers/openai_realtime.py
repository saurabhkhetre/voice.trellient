"""OpenAI Realtime provider — the V1 default."""

from __future__ import annotations

from typing import Any

from voice_agent.config import AgentConfig
from voice_agent.providers.base import ProviderNotConfigured, RealtimeModelProvider


class OpenAIRealtimeProvider(RealtimeModelProvider):
    name = "openai_realtime"

    def __init__(self, config: AgentConfig) -> None:
        super().__init__(config)

    def validate(self) -> None:
        if not self.config.provider_keys.get("openai"):
            raise ProviderNotConfigured("OPENAI_API_KEY is not set")

    def create_model(self) -> Any:
        self.validate()
        # Imported lazily so tests and config validation don't require the SDK.
        from livekit.plugins import openai

        return openai.realtime.RealtimeModel(
            model=self.config.model,
            voice=self.config.voice,
            api_key=self.config.provider_keys["openai"],
        )
