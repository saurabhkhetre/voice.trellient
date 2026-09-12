"""VoiceAgent + ConversationManager: the LiveKit Agents entrypoint.

One job serves one phone call. The agent's instructions and tools are built at
call time from the calling business's own data, so a single worker deployment
serves every tenant.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
from typing import Any

from livekit.agents import Agent, AgentSession, JobContext, RoomInputOptions

# LiveKit plugins register themselves on import, and registration only works on
# the main thread. This module is imported when the worker starts, so load them
# here rather than lazily inside a call. The Google plugin is optional
# (pip install -e ".[google]").
from livekit.plugins import openai as _openai_plugin  # noqa: F401

try:
    from livekit.plugins import google as _google_plugin  # noqa: F401
except ImportError:
    _google_plugin = None

from voice_agent.business import BusinessClient, BusinessContext, BusinessDataError
from voice_agent.config import CallConfig, InfraConfig
from voice_agent.logging_setup import log_event
from voice_agent.prompts import AGENT_NAME, SYSTEM_PROMPT, build_instructions
from voice_agent.providers import build_provider
from voice_agent.tools import build_tools, resolve_tool_settings

logger = logging.getLogger("voice_agent.agent")

# Data-channel topic the browser console uses to ask for a human handoff.
ESCALATION_TOPIC = "trellient.escalate"

# How long the goodbye may take before a call over its time limit is cut.
GOODBYE_TIMEOUT_S = 20

# Time the agent gets to finish saying goodbye after it calls end_call itself.
GOODBYE_GRACE_S = 6

# Model errors tolerated before a call is given up on. The plugin retries
# forever, which leaves the caller listening to silence.
MAX_MODEL_ERRORS = 3


def failure_summary(detail: str) -> str:
    """A short, human explanation for a call the model could not run."""
    lowered = detail.lower()
    if "insufficient_quota" in lowered or "credit" in lowered:
        return "Call failed: the AI provider account has no credits left, so the agent could not speak."
    if "invalid_api_key" in lowered or "unauthorized" in lowered or "401" in lowered:
        return "Call failed: the AI provider rejected the API key."
    if "model" in lowered and ("not found" in lowered or "does not exist" in lowered or "access" in lowered):
        return f"Call failed: the realtime model was rejected — {detail[:160]}"
    return f"Call failed: the AI model could not be reached — {detail[:160]}"


class VoiceAgent(Agent):
    """The assistant persona. Behaviour lives entirely in the instructions."""

    def __init__(self, instructions: str = SYSTEM_PROMPT, tools: list[Any] | None = None) -> None:
        super().__init__(instructions=instructions, tools=tools or [])


def read_job_metadata(ctx: JobContext) -> dict[str, Any]:
    """Reads {business_id, call_id, caller_number, agent_config_id} from room metadata or job payload."""
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

    def __init__(self, infra: InfraConfig) -> None:
        self.infra = infra
        self.session: AgentSession | None = None
        self.client: BusinessClient | None = None
        self.business: BusinessContext | None = None
        self.call_config: CallConfig | None = None
        self.started_at = time.monotonic()
        self.turns: list[tuple[str, str]] = []
        self._limit_task: asyncio.Task[None] | None = None
        self._model_errors = 0
        self._failed = False
        self._stopped = False
        self._ending = False

    async def load_business(self, ctx: JobContext) -> BusinessContext | None:
        """Loads business data for this call. Returns None when unconfigured."""
        metadata = read_job_metadata(ctx)
        business_id = metadata.get("business_id") or os.environ.get("DEFAULT_BUSINESS_ID")
        if not business_id:
            log_event(logger, "business.not_linked", room=ctx.room.name)
            return None
        try:
            self.client = BusinessClient()
            await self.client.connect()
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
                    agent_config_id=metadata.get("agent_config_id"),
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

    async def start(self, ctx: JobContext) -> AgentSession | None:
        started = time.monotonic()
        business = await self.load_business(ctx)

        if business is None or not business.config:
            # A job can arrive without business metadata — LiveKit redispatches
            # one after a reconnect. Carrying on would answer the caller as a
            # generic assistant with no tools, on whichever provider the worker
            # happens to default to, and file that as an ordinary call. Refuse.
            log_event(logger, "call.not_linked_abort", room=ctx.room.name)
            ctx.shutdown(reason="business_not_linked")
            return None

        self.call_config = CallConfig.from_db(business.config, self.infra)
        instructions = build_instructions(business.config, business.business)
        greeting = self.call_config.greeting
        tools: list[Any] = []
        if self.client is not None:
            # The dashboard's Functions tab decides what this agent can do.
            settings: dict[str, bool] = {}
            with contextlib.suppress(Exception):
                settings = await self.client.load_tool_settings(business)
            disabled, extra = resolve_tool_settings(settings)
            tools = build_tools(
                self.client,
                business,
                disabled=disabled,
                extra=extra,
                on_end_call=lambda reason: self._end_call(ctx, reason),
            )

        # Build provider dynamically from the DB config's model_provider
        provider = build_provider(self.infra, self.call_config.provider)

        log_event(
            logger,
            "model.started",
            **provider.describe(self.call_config),
            room=ctx.room.name,
            tools=len(tools),
        )

        session = AgentSession(llm=provider.create_model(self.call_config))
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

        # Rows created before the agent joined (browser test calls, outbound)
        # start as "ringing"; the call is live from here.
        if self.client is not None and self.business is not None:
            with contextlib.suppress(Exception):
                await self.client.mark_answered(self.business)

        self._limit_task = asyncio.create_task(self._enforce_call_limit(ctx))

        # Spelled out, because a realtime model asked only to "greet the caller"
        # improvises — especially when the line is quiet as it connects.
        await session.generate_reply(
            instructions=(
                "Open the call by saying this greeting word for word, then stop and wait "
                f"for the caller to speak: {greeting}"
            )
        )
        return session

    async def _enforce_call_limit(self, ctx: JobContext) -> None:
        """Ends the call once the agent's max_call_seconds is reached, after a short goodbye."""
        limit = self.call_config.max_call_seconds if self.call_config else CallConfig.max_call_seconds
        await asyncio.sleep(limit)
        log_event(logger, "call.limit_reached", room=ctx.room.name, limit_s=limit)
        if self.session is not None:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(
                    self.session.generate_reply(
                        instructions=(
                            "Tell the caller this call has reached its time limit, that their "
                            "details are saved and someone will follow up if needed, then say "
                            "goodbye. One or two short sentences."
                        )
                    ),
                    timeout=GOODBYE_TIMEOUT_S,
                )
        ctx.shutdown(reason="max_call_seconds")

    async def _abort(self, ctx: JobContext, detail: str) -> None:
        """Ends a call the model can't run, recording why instead of leaving silence."""
        if self._failed:
            return
        self._failed = True
        log_event(logger, "call.aborted", room=ctx.room.name, detail=detail[:300])
        if self.client is not None and self.business is not None:
            with contextlib.suppress(Exception):
                await self.client.fail_call(
                    self.business,
                    reason=failure_summary(detail),
                    duration_seconds=int(time.monotonic() - self.started_at),
                )
        ctx.shutdown(reason="model_error")

    def _end_call(self, ctx: JobContext, reason: str) -> None:
        """Hangs up once the agent's goodbye has played, for the End call function."""
        if self._ending:
            return
        self._ending = True
        log_event(logger, "call.ended_by_agent", room=ctx.room.name, reason=reason[:160])

        async def close() -> None:
            await asyncio.sleep(GOODBYE_GRACE_S)
            ctx.shutdown(reason="agent_ended_call")

        asyncio.create_task(close())  # noqa: RUF006 - fire-and-forget teardown

    def _record(self, speaker: str, text: str) -> None:
        if not text.strip():
            return
        self.turns.append((speaker, text))
        if self.client and self.business:
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
            error = getattr(event, "error", event)
            detail = str(error)
            log_event(logger, "session.error", detail=detail)
            self._model_errors += 1
            # The plugin retries a failure it can't recover from — no credit on
            # the account, a rejected key, a withdrawn model — which leaves the
            # caller in silence. Give up and close the call with the reason.
            if not bool(getattr(error, "recoverable", True)) or self._model_errors >= MAX_MODEL_ERRORS:
                asyncio.create_task(self._abort(ctx, detail))  # noqa: RUF006

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
        """Closes the call row and the session. Safe to call more than once."""
        if self._stopped:
            return
        self._stopped = True
        if self._limit_task is not None:
            self._limit_task.cancel()
        duration = int(time.monotonic() - self.started_at)
        if self.client and self.business:
            # A call given up on is already closed, with the reason on the row.
            if not self._failed:
                with contextlib.suppress(Exception):
                    await self.client.finish_call(
                        self.business, duration_seconds=duration, summary=self._summary()
                    )
            with contextlib.suppress(Exception):
                await self.client.aclose()
        if self.session is not None:
            with contextlib.suppress(Exception):
                await self.session.aclose()
            log_event(logger, "session.stopped", duration_s=duration, failed=self._failed)
            self.session = None


async def entrypoint(ctx: JobContext, infra: InfraConfig) -> None:
    """Job entrypoint: connect to the room and run one conversation."""
    manager = ConversationManager(infra)
    # Runs when the caller hangs up or the job ends for any other reason, and
    # writes the duration, summary and tools used onto the call row.
    ctx.add_shutdown_callback(manager.stop)

    await ctx.connect()
    log_event(logger, "room.connected", room=ctx.room.name)

    @ctx.room.on("participant_connected")
    def _on_join(participant) -> None:  # noqa: ANN001
        log_event(logger, "user.joined", identity=participant.identity)

    @ctx.room.on("participant_disconnected")
    def _on_leave(participant) -> None:  # noqa: ANN001
        log_event(logger, "user.left", identity=participant.identity)
        # The caller hung up. Without this the job sits in an empty room until
        # max_call_seconds: the call row stays in_progress, its duration and
        # tools_used are never written, and the realtime model keeps running.
        remaining = [
            p for p in ctx.room.remote_participants.values() if p.sid != participant.sid
        ]
        if not remaining:
            log_event(logger, "call.caller_left", room=ctx.room.name)
            ctx.shutdown(reason="caller_left")

    @ctx.room.on("data_received")
    def _on_data(packet) -> None:  # noqa: ANN001 - SDK packet object
        if getattr(packet, "topic", None) != ESCALATION_TOPIC:
            return
        reason = "caller_requested_human"
        with contextlib.suppress(Exception):
            payload = json.loads(bytes(getattr(packet, "data", b"")).decode("utf-8"))
            if isinstance(payload, dict) and payload.get("reason"):
                reason = str(payload["reason"])[:120]
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
