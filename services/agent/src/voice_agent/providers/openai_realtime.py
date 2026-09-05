"""OpenAI Realtime provider — the V1 default."""

from __future__ import annotations

from typing import Any

from voice_agent.config import CallConfig, InfraConfig
from voice_agent.providers.base import ProviderNotConfigured, RealtimeModelProvider


class OpenAIRealtimeProvider(RealtimeModelProvider):
    name = "openai_realtime"

    def __init__(self, infra: InfraConfig) -> None:
        super().__init__(infra)

    def validate(self) -> None:
        if not self.infra.provider_keys.get("openai"):
            raise ProviderNotConfigured("OPENAI_API_KEY is not set")

    def create_model(self, call_config: CallConfig | None = None) -> Any:
        self.validate()
        # Imported lazily so tests and config validation don't require the SDK.
        from livekit.plugins import openai

        model = call_config.model if call_config else self.infra.default_model
        voice = call_config.voice if call_config else self.infra.default_voice

        return openai.realtime.RealtimeModel(
            model=model,
            voice=voice,
            api_key=self.infra.provider_keys["openai"],
        )
