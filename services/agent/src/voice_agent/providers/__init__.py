"""Provider registry."""

from __future__ import annotations

from voice_agent.config import InfraConfig
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


def build_provider(infra: InfraConfig, provider_name: str | None = None) -> RealtimeModelProvider:
    """Resolves a provider name to a provider instance.

    If provider_name is given (from DB agent_configs.model_provider), use that.
    Otherwise fall back to infra.default_provider (from env REALTIME_PROVIDER).
    """
    name = provider_name or infra.default_provider
    provider_cls = PROVIDERS.get(name)
    if provider_cls is None:
        raise ProviderNotConfigured(
            f"Unknown provider '{name}'. Available: {', '.join(sorted(PROVIDERS))}"
        )
    provider = provider_cls(infra)
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
