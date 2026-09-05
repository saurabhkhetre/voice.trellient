import pytest

from voice_agent.config import AgentConfig, ConfigError, load_config

BASE_ENV = {
    "LIVEKIT_URL": "wss://example.livekit.cloud",
    "LIVEKIT_API_KEY": "APIkey123",
    "LIVEKIT_API_SECRET": "secret-value-123",
    "OPENAI_API_KEY": "sk-test-123",
}


def test_load_config_valid() -> None:
    config = load_config(dict(BASE_ENV))
    assert isinstance(config, AgentConfig)
    assert config.provider == "openai_realtime"
    assert config.provider_keys["openai"] == "sk-test-123"


def test_missing_secret_is_reported() -> None:
    env = dict(BASE_ENV)
    del env["LIVEKIT_API_SECRET"]
    with pytest.raises(ConfigError) as exc:
        load_config(env)
    assert "LIVEKIT_API_SECRET" in exc.value.missing


def test_url_scheme_is_validated() -> None:
    env = dict(BASE_ENV) | {"LIVEKIT_URL": "https://example.livekit.cloud"}
    with pytest.raises(ConfigError):
        load_config(env)


def test_unknown_provider_rejected() -> None:
    env = dict(BASE_ENV) | {"REALTIME_PROVIDER": "not-a-provider"}
    with pytest.raises(ConfigError):
        load_config(env)


def test_redacted_config_never_leaks_secrets() -> None:
    config = load_config(dict(BASE_ENV))
    dumped = str(config.redacted)
    assert "secret-value-123" not in dumped
    assert "sk-test-123" not in dumped
    assert "APIkey123" not in dumped
