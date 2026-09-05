"""Provider registry."""

from __future__ import annotations

from voice_agent.config import AgentConfig
from voice_agent.providers.base import (
    ProviderNotConfigured,
    RealtimeModelProvider,
)
from voice_agent.providers.gemini_live import GeminiLiveProvider
from voice_agent.providers.openai_realtime import OpenAIRealtimeProvider

PROVIDERS: dict[str, type[RealtimeModelProvider]] = {
    OpenAIRealtimeProvider.name: OpenAIRealtimeProvider,
    GeminiLiveProvider.name: GeminiLiveProvider,
}


def build_provider(config: AgentConfig) -> RealtimeModelProvider:
    """Resolves REALTIME_PROVIDER to a provider instance."""
    provider_cls = PROVIDERS.get(config.provider)
    if provider_cls is None:
        raise ProviderNotConfigured(
            f"Unknown provider '{config.provider}'. Available: {', '.join(sorted(PROVIDERS))}"
        )
    provider = provider_cls(config)
    provider.validate()
    return provider


__all__ = [
    "PROVIDERS",
    "GeminiLiveProvider",
    "OpenAIRealtimeProvider",
    "ProviderNotConfigured",
    "RealtimeModelProvider",
    "build_provider",
]
