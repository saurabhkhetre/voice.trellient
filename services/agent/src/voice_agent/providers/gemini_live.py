"""Gemini Live provider — Google's Live API via the LiveKit plugin.

Requires:
  - GOOGLE_API_KEY in the environment
  - livekit-plugins-google installed (pip install -e ".[google]")
"""

from __future__ import annotations

import logging
from typing import Any

from voice_agent.config import CallConfig, InfraConfig
from voice_agent.providers.base import ProviderNotConfigured, RealtimeModelProvider

logger = logging.getLogger("voice_agent.providers.gemini_live")

# Google's current Live API model for spoken conversation.
DEFAULT_MODEL = "gemini-2.5-flash-native-audio-latest"
DEFAULT_VOICE = "Puck"

# Live API voices. An agent set up with another provider's voice (OpenAI's
# "alloy", say) would be rejected mid-call, so fall back to the default.
VOICES = frozenset({"Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Zephyr"})

# How long a caller must be quiet before Gemini treats their turn as finished.
# Left at its default, most of a reply's delay is dead air, which a caller on a
# phone reads as the agent having missed the question. Too short and the agent
# talks over anyone who pauses mid-sentence, so this sits deliberately between.
END_OF_TURN_SILENCE_MS = 700
START_PADDING_MS = 200


def _turn_detection() -> Any:
    """Gemini's end-of-turn settings, tuned for the pacing of a phone call."""
    # Imported here, not at module scope: the Google plugin is optional.
    from google.genai import types

    return types.RealtimeInputConfig(
        automatic_activity_detection=types.AutomaticActivityDetection(
            end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_HIGH,
            silence_duration_ms=END_OF_TURN_SILENCE_MS,
            prefix_padding_ms=START_PADDING_MS,
        )
    )


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
                'livekit-plugins-google is not installed. Run: pip install -e ".[google]"'
            )

    def create_model(self, call_config: CallConfig | None = None) -> Any:
        self.validate()
        from livekit.plugins import google

        model = (call_config.model if call_config else None) or DEFAULT_MODEL
        voice = (call_config.voice if call_config else None) or DEFAULT_VOICE
        if voice not in VOICES:
            logger.info(
                "configured voice is not a Gemini voice; using the default",
                extra={"event": "provider.voice_replaced", "configured": voice, "used": DEFAULT_VOICE},
            )
            voice = DEFAULT_VOICE

        return google.realtime.RealtimeModel(
            model=model,
            voice=voice,
            api_key=self.infra.provider_keys["google"],
        )
