"""RealtimeModelProvider abstraction.

The rest of the agent never imports a vendor SDK directly: it asks a provider
for a realtime model object. Adding Gemini Live (or any other realtime API)
means adding one module here, not touching the agent.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from voice_agent.config import CallConfig, InfraConfig


class RealtimeModelProvider(ABC):
    """Creates a LiveKit-compatible realtime model for a session."""

    #: Stable identifier used by model_provider in agent_configs.
    name: str = "base"

    def __init__(self, infra: InfraConfig) -> None:
        self.infra = infra
        # Keep backward compat — some code references self.config
        self.config = infra

    @abstractmethod
    def validate(self) -> None:
        """Raises if the provider cannot run with the current configuration."""

    @abstractmethod
    def create_model(self, call_config: CallConfig | None = None) -> Any:
        """Returns a realtime model instance for AgentSession(llm=...).

        If call_config is provided, uses its model/voice. Otherwise uses
        infrastructure defaults.
        """

    def describe(self, call_config: CallConfig | None = None) -> dict[str, str]:
        """Log-safe provider description."""
        if call_config:
            return {
                "provider": self.name,
                "model": call_config.model,
                "voice": call_config.voice,
            }
        return {
            "provider": self.name,
            "model": self.infra.default_model,
            "voice": self.infra.default_voice,
        }


class ProviderNotConfigured(RuntimeError):
    """Raised when a provider is selected but cannot be initialised."""
