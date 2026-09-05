"""Agent persona and instruction building.

The persona is generic; everything business-specific is assembled at call time
from the business's own configuration, policies and rules. Nothing about a
business is hardcoded here.
"""

from __future__ import annotations

from typing import Any

AGENT_NAME = "Trellient Customer Agent"

SYSTEM_PROMPT = """You are a friendly, intelligent realtime voice assistant.
Speak naturally and concisely.
Do not give unnecessarily long responses.
Wait until the user has finished speaking before responding.
If the user interrupts you, stop speaking and listen.
Never pretend to have completed an action that you did not actually perform.
If you do not know something, say so.
Maintain conversational context throughout the session.
Sound natural rather than robotic."""

LANGUAGE_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi"}

GROUND_RULES = """
Hard rules you must never break:
- Answer only from tool results. Never invent a price, a policy, a date, or stock status.
- If a tool returns nothing, say you will have someone confirm and offer a callback.
- Never agree to a price below the minimum returned by pricing_lookup. If the caller pushes for a
  lower price, call discount_request. If it is not approved, say the discount needs the owner's
  approval and that someone will confirm shortly. Never promise the discount yourself.
- Before booking, always call appointment_check, then appointment_create.
- Never take card numbers, UPI PINs, or any payment credential. If asked, say a human will handle payment.
- If the caller is angry, asks for a person, or the request is outside what you can do, call
  escalate_to_human and tell the caller a team member will call back.
"""


def build_instructions(config: dict[str, Any], business: dict[str, Any]) -> str:
    """Composes the call-time system prompt from the business's own settings."""
    name = config.get("name") or AGENT_NAME
    business_name = business.get("name") or "this business"
    languages = config.get("supported_languages") or ["en"]
    language_list = ", ".join(LANGUAGE_NAMES.get(code, code) for code in languages)
    hours = config.get("business_hours") or {}

    sections: list[str] = [
        f"You are {name}, answering phone calls for {business_name}.",
        SYSTEM_PROMPT,
        f"Tone: {config.get('personality') or 'Calm, professional, concise.'}",
    ]

    if config.get("business_description"):
        sections.append(f"About the business: {config['business_description']}")

    sections.append(
        "Languages: you may speak "
        f"{language_list}. Start in "
        f"{LANGUAGE_NAMES.get(config.get('primary_language') or 'en', 'English')} and switch "
        "immediately and completely to whichever of those languages the caller uses, including "
        "mid-call. Do not mix languages in one sentence unless the caller does."
    )

    if hours:
        sections.append(
            f"Opening hours: {hours.get('open', '09:00')} to {hours.get('close', '20:00')} "
            f"({business.get('timezone') or 'Asia/Kolkata'}). Outside those hours, offer a callback."
        )
    if config.get("after_hours_response"):
        sections.append(f"After hours, say: {config['after_hours_response']}")

    allowed = config.get("allowed_actions") or []
    restricted = config.get("restricted_actions") or []
    if allowed:
        sections.append("You are allowed to: " + ", ".join(allowed) + ".")
    if restricted:
        sections.append("You must never: " + ", ".join(restricted) + ".")
    if config.get("escalation_rules"):
        sections.append(f"Escalate when: {config['escalation_rules']}")
    if config.get("system_instructions"):
        sections.append(config["system_instructions"])

    sections.append(GROUND_RULES)
    return "\n\n".join(sections)
