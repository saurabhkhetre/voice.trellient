"""Gemini Live provider — interface stub for a future phase.

Deliberately not implemented: it exists so the abstraction is proven to be
provider-agnostic. Wiring it up means filling in create_model() only.
"""

from __future__ import annotations

from typing import Any

from voice_agent.providers.base import ProviderNotConfigured, RealtimeModelProvider


class GeminiLiveProvider(RealtimeModelProvider):
    name = "gemini_live"

    def validate(self) -> None:
        if not self.config.provider_keys.get("google"):
            raise ProviderNotConfigured("GOOGLE_API_KEY is not set")

    def create_model(self) -> Any:
        raise ProviderNotConfigured(
            "Gemini Live is not implemented in V1. Set REALTIME_PROVIDER=openai_realtime."
        )
