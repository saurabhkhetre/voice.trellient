"""RealtimeModelProvider abstraction.

The rest of the agent never imports a vendor SDK directly: it asks a provider
for a realtime model object. Adding Gemini Live (or any other realtime API)
means adding one module here, not touching the agent.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from voice_agent.config import AgentConfig


class RealtimeModelProvider(ABC):
    """Creates a LiveKit-compatible realtime model for a session."""

    #: Stable identifier used by REALTIME_PROVIDER.
    name: str = "base"

    def __init__(self, config: AgentConfig) -> None:
        self.config = config

    @abstractmethod
    def validate(self) -> None:
        """Raises if the provider cannot run with the current configuration."""

    @abstractmethod
    def create_model(self) -> Any:
        """Returns a realtime model instance for AgentSession(llm=...)."""

    def describe(self) -> dict[str, str]:
        """Log-safe provider description."""
        return {
            "provider": self.name,
            "model": self.config.model,
            "voice": self.config.voice,
        }


class ProviderNotConfigured(RuntimeError):
    """Raised when a provider is selected but cannot be initialised."""
