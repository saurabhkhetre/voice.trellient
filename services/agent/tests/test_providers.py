import pytest

from voice_agent.config import load_config
from voice_agent.providers import (
    GeminiLiveProvider,
    OpenAIRealtimeProvider,
    ProviderNotConfigured,
    build_provider,
)

BASE_ENV = {
    "LIVEKIT_URL": "wss://example.livekit.cloud",
    "LIVEKIT_API_KEY": "APIkey123",
    "LIVEKIT_API_SECRET": "secret-value-123",
    "OPENAI_API_KEY": "sk-test-123",
}


def test_default_provider_is_openai_realtime() -> None:
    provider = build_provider(load_config(dict(BASE_ENV)))
    assert isinstance(provider, OpenAIRealtimeProvider)
    assert provider.describe()["provider"] == "openai_realtime"


def test_provider_validation_requires_key() -> None:
    config = load_config(dict(BASE_ENV))
    stripped = type(config)(**{**config.__dict__, "provider_keys": {}})
    with pytest.raises(ProviderNotConfigured):
        OpenAIRealtimeProvider(stripped).validate()


def test_gemini_is_interface_only() -> None:
    config = load_config(dict(BASE_ENV))
    gemini = GeminiLiveProvider(
        type(config)(**{**config.__dict__, "provider_keys": {"google": "key"}})
    )
    gemini.validate()
    with pytest.raises(ProviderNotConfigured):
        gemini.create_model()
