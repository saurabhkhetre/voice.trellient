"""VoiceAgent + ConversationManager: the LiveKit Agents entrypoint.

One job serves one phone call. The agent's instructions and tools are built at
call time from the calling business's own data, so a single worker deployment
serves every tenant.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import time
from typing import Any

from livekit.agents import Agent, AgentSession, JobContext, RoomInputOptions

from voice_agent.business import BusinessClient, BusinessContext, BusinessDataError
from voice_agent.config import AgentConfig
from voice_agent.logging_setup import log_event
from voice_agent.prompts import AGENT_NAME, SYSTEM_PROMPT, build_instructions
from voice_agent.providers import RealtimeModelProvider, build_provider
from voice_agent.tools import build_tools

logger = logging.getLogger("voice_agent.agent")

# Data-channel topic the browser console uses to ask for a human handoff.
ESCALATION_TOPIC = "trellient.escalate"


class VoiceAgent(Agent):
    """The assistant persona. Behaviour lives entirely in the instructions."""

    def __init__(self, instructions: str = SYSTEM_PROMPT, tools: list[Any] | None = None) -> None:
        super().__init__(instructions=instructions, tools=tools or [])


def read_job_metadata(ctx: JobContext) -> dict[str, Any]:
    """Reads {business_id, call_id, caller_number} from room metadata or job payload."""
    for raw in (getattr(ctx.job, "metadata", None), getattr(ctx.room, "metadata", None)):
        if not raw:
            continue
        with contextlib.suppress(json.JSONDecodeError, TypeError):
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
    return {}


class ConversationManager:
    """Owns one realtime conversation: session start, greeting, teardown."""

    def __init__(self, config: AgentConfig, provider: RealtimeModelProvider) -> None:
        self.config = config
        self.provider = provider
        self.session: AgentSession | None = None
        self.client: BusinessClient | None = None
        self.business: BusinessContext | None = None
        self.started_at = time.monotonic()
        self.turns: list[tuple[str, str]] = []

    async def load_business(self, ctx: JobContext) -> BusinessContext | None:
        """Loads business data for this call. Returns None when unconfigured."""
        metadata = read_job_metadata(ctx)
        business_id = metadata.get("business_id") or os.environ.get("DEFAULT_BUSINESS_ID")
        if not business_id:
            log_event(logger, "business.not_linked", room=ctx.room.name)
            return None
        try:
            self.client = BusinessClient()
            business = await self.client.load_context(
                business_id,
                call_id=metadata.get("call_id"),
                caller_number=metadata.get("caller_number"),
                agent_config_id=metadata.get("agent_config_id"),
            )
        except (BusinessDataError, Exception) as exc:  # noqa: BLE001 - degrade gracefully
            log_event(logger, "business.load_failed", detail=type(exc).__name__)
            return None

        if not business.call_id and self.client is not None:
            with contextlib.suppress(Exception):
                business.call_id = await self.client.start_call(
                    business_id=business.business_id,
                    provider=metadata.get("provider") or "browser",
                    room_name=ctx.room.name,
                    caller_number=business.caller_number,
                    customer_id=business.customer_id,
                )
        self.business = business
        log_event(
            logger,
            "business.loaded",
            business=business.business.get("name"),
            language=business.language,
            call_id=business.call_id,
        )
        return business

    async def start(self, ctx: JobContext) -> AgentSession:
        started = time.monotonic()
        business = await self.load_business(ctx)

        instructions = SYSTEM_PROMPT
        tools: list[Any] = []
        greeting = self.config.greeting
        if business is not None and self.client is not None:
            instructions = build_instructions(business.config, business.business)
            tools = build_tools(self.client, business)
            greeting = business.config.get("greeting") or greeting

        log_event(
            logger,
            "model.started",
            **self.provider.describe(),
            room=ctx.room.name,
            tools=len(tools),
        )

        session = AgentSession(llm=self.provider.create_model())
        self.session = session
        self._attach_listeners(session, ctx)

        await session.start(
            room=ctx.room,
            agent=VoiceAgent(instructions=instructions, tools=tools),
            # Realtime models handle turn detection and barge-in natively; the
            # session cancels agent audio as soon as the user starts speaking.
            room_input_options=RoomInputOptions(),
        )

        log_event(
            logger,
            "session.started",
            agent=AGENT_NAME,
            room=ctx.room.name,
            startup_ms=round((time.monotonic() - started) * 1000),
        )

        await session.generate_reply(instructions=f"Greet the caller: {greeting}")
        return session

    def _record(self, speaker: str, text: str) -> None:
        if not text.strip():
            return
        self.turns.append((speaker, text))
        if self.client and self.business:
            import asyncio

            asyncio.create_task(  # noqa: RUF006 - fire-and-forget persistence
                self._persist(speaker, text)
            )

    async def _persist(self, speaker: str, text: str) -> None:
        if not self.client or not self.business:
            return
        with contextlib.suppress(Exception):
            await self.client.add_transcript(self.business, speaker, text)

    def _attach_listeners(self, session: AgentSession, ctx: JobContext) -> None:
        @session.on("user_input_transcribed")
        def _on_user_input(event) -> None:  # noqa: ANN001 - SDK event object
            if getattr(event, "is_final", False):
                log_event(logger, "user.turn_final", room=ctx.room.name)
                self._record("caller", str(getattr(event, "transcript", "")))

        @session.on("agent_state_changed")
        def _on_agent_state(event) -> None:  # noqa: ANN001
            log_event(
                logger,
                "agent.state_changed",
                state=str(getattr(event, "new_state", "unknown")),
            )

        @session.on("conversation_item_added")
        def _on_item(event) -> None:  # noqa: ANN001
            item = getattr(event, "item", None)
            role = str(getattr(item, "role", "unknown"))
            log_event(logger, "model.response", role=role)
            if role == "assistant":
                self._record("agent", str(getattr(item, "text_content", "") or ""))

        @session.on("error")
        def _on_error(event) -> None:  # noqa: ANN001
            log_event(logger, "session.error", detail=str(getattr(event, "error", event)))

    async def request_escalation(self, reason: str) -> None:
        """Files a human handoff for the live call and tells the caller."""
        if self.client is None or self.business is None:
            log_event(logger, "escalation.skipped", detail="business_not_linked")
            return
        with contextlib.suppress(Exception):
            await self.client.escalate(
                self.business,
                reason=reason,
                summary="Caller asked to speak with a person during the call.",
            )
        log_event(logger, "escalation.filed", reason=reason, call_id=self.business.call_id)
        if self.session is not None:
            with contextlib.suppress(Exception):
                await self.session.generate_reply(
                    instructions=(
                        "Tell the caller you are handing the conversation to a human "
                        "colleague, that their details are saved, and that someone will "
                        "follow up shortly. Keep it to two short sentences."
                    )
                )

    def _summary(self) -> str:
        caller_turns = [text for speaker, text in self.turns if speaker == "caller"]
        if not caller_turns:
            return "Call ended with no caller speech recorded."
        first = caller_turns[0][:180]
        return f"Caller asked: {first}. {len(self.turns)} turns exchanged."

    async def stop(self) -> None:
        duration = int(time.monotonic() - self.started_at)
        if self.client and self.business:
            with contextlib.suppress(Exception):
                await self.client.finish_call(
                    self.business, duration_seconds=duration, summary=self._summary()
                )
            with contextlib.suppress(Exception):
                await self.client.aclose()
        if self.session is not None:
            await self.session.aclose()
            log_event(logger, "session.stopped", duration_s=duration)
            self.session = None


async def entrypoint(ctx: JobContext, config: AgentConfig) -> None:
    """Job entrypoint: connect to the room and run one conversation."""
    provider = build_provider(config)
    manager = ConversationManager(config, provider)

    await ctx.connect()
    log_event(logger, "room.connected", room=ctx.room.name)

    @ctx.room.on("participant_connected")
    def _on_join(participant) -> None:  # noqa: ANN001
        log_event(logger, "user.joined", identity=participant.identity)

    @ctx.room.on("participant_disconnected")
    def _on_leave(participant) -> None:  # noqa: ANN001
        log_event(logger, "user.left", identity=participant.identity)

    @ctx.room.on("data_received")
    def _on_data(packet) -> None:  # noqa: ANN001 - SDK packet object
        if getattr(packet, "topic", None) != ESCALATION_TOPIC:
            return
        reason = "caller_requested_human"
        with contextlib.suppress(Exception):
            payload = json.loads(bytes(getattr(packet, "data", b"")).decode("utf-8"))
            if isinstance(payload, dict) and payload.get("reason"):
                reason = str(payload["reason"])[:120]
        import asyncio

        asyncio.create_task(manager.request_escalation(reason))  # noqa: RUF006

    @ctx.room.on("disconnected")
    def _on_room_disconnect() -> None:
        log_event(logger, "room.disconnected", room=ctx.room.name)

    try:
        await manager.start(ctx)
    except Exception as exc:  # pragma: no cover - runtime safety net
        log_event(logger, "agent.error", detail=type(exc).__name__)
        logger.exception("agent failed", extra={"event": "agent.error"})
        await manager.stop()
        raise
