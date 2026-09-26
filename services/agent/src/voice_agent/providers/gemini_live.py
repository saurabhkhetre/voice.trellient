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
#
# This was 700ms with END_SENSITIVITY_HIGH, chosen to cut dead air. On a live
# call that truncated callers mid-sentence -- "Where can I" arrived as a
# finished turn -- so it now waits longer and ends a turn less eagerly. That
# partially reverses the dead-air tuning on purpose: a clipped question is worse
# than a slower answer, because the caller has to start again. Measure both.
END_OF_TURN_SILENCE_MS = 1000
START_PADDING_MS = 200

# The language the inbound ASR is pinned to. Left unset, the Live API
# auto-detects per turn and guesses a script: English spoken with an Indian
# accent came back as Devanagari ("डू यू सेल एरोप्लेन टेक") and once as Arabic.
# The model still understood the audio and answered correctly, so this is a
# transcript-fidelity fix, not an audio one.
#
# en-IN is accepted here but NOT by speech_config, which rejects it with
# "1007 Unsupported language code 'en-IN'" and kills the session on the first
# turn. The two settings take different language sets, so the agent's *output*
# language is deliberately left unset (the prompt already fixes what it speaks)
# and only the *input* transcription is pinned. Verified against the live API
# for gemini-2.5-flash-native-audio-latest.
TRANSCRIPTION_LANGUAGE = "en-IN"


def _input_transcription() -> Any:
    """Pins the inbound ASR to one language instead of auto-detecting per turn."""
    from google.genai import types

    return types.AudioTranscriptionConfig(language_codes=[TRANSCRIPTION_LANGUAGE])


def _turn_detection() -> Any:
    """Gemini's end-of-turn settings, tuned for the pacing of a phone call."""
    # Imported here, not at module scope: the Google plugin is optional.
    from google.genai import types

    return types.RealtimeInputConfig(
        automatic_activity_detection=types.AutomaticActivityDetection(
            end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
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
            realtime_input_config=_turn_detection(),
            # Inbound ASR language. This is the setting that stops the script
            # guessing; speech_config does not affect transcription, and would
            # reject this value anyway (see TRANSCRIPTION_LANGUAGE).
            input_audio_transcription=_input_transcription(),
        )
