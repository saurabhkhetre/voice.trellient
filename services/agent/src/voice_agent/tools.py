"""Realtime function tools exposed to the model.

Each tool is a thin wrapper over BusinessClient: no business rule is duplicated
here. Prices, floors, discount limits and slot availability are decided by the
database, and the tool only relays the verdict to the model.

Which tools an agent gets is decided by the dashboard's Functions tab, through
`resolve_tool_settings`. An agent with no rows there keeps the defaults below.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable, Mapping
from typing import Any

from livekit.agents import function_tool

from voice_agent.business import BusinessClient, BusinessContext

logger = logging.getLogger("voice_agent.tools")

# The Functions tab's presets, mapped onto the tools the agent actually has.
# "custom" has no built-in behaviour, so it is deliberately absent.
PRESET_TOOLS: dict[str, tuple[str, ...]] = {
    "end_call": ("end_call",),
    "transfer_call": ("escalate_to_human",),
    "book_appointment": ("appointment_check", "appointment_create"),
    "pricing_lookup": ("pricing_lookup",),
    "create_quote": ("quote_create",),
}

# Tools that exist only when the Functions tab switches them on. Hanging up is
# opt-in: an agent that can end calls will sometimes end them too early.
OPT_IN_TOOLS = frozenset({"end_call"})


def _dump(value: Any) -> str:
    return json.dumps(value, default=str, ensure_ascii=False)


def resolve_tool_settings(settings: Mapping[str, bool]) -> tuple[set[str], set[str]]:
    """Turns the Functions tab's switches into tools to drop and tools to add."""
    disabled: set[str] = set()
    extra: set[str] = set()
    for preset, names in PRESET_TOOLS.items():
        if preset not in settings:
            continue
        if settings[preset]:
            extra.update(names)
        else:
            disabled.update(names)
    return disabled, extra


def build_tools(
    client: BusinessClient,
    ctx: BusinessContext,
    disabled: set[str] | frozenset[str] = frozenset(),
    extra: set[str] | frozenset[str] = frozenset(),
    on_end_call: Callable[[str], None] | None = None,
) -> list[Any]:
    """Builds the tool set bound to one call's business context."""

    @function_tool
    async def customer_lookup(phone: str) -> str:
        """Look up a caller by phone number to greet them by name and recall history."""
        found = await client.customer_lookup(ctx, phone)
        if found:
            ctx.customer_id = found["id"]
        return _dump(found or {"found": False})

    @function_tool
    async def save_customer(phone: str, name: str) -> str:
        """Save or update the caller's name and phone number."""
        customer = await client.customer_upsert(ctx, phone, name)
        ctx.customer_id = customer["id"]
        return _dump(customer)

    @function_tool
    async def product_lookup(query: str) -> str:
        """Find products in the business catalogue by name, category or description."""
        return _dump(await client.product_lookup(ctx, query))

    @function_tool
    async def service_lookup(query: str) -> str:
        """Find bookable services, with base price and duration."""
        return _dump(await client.service_lookup(ctx, query))

    @function_tool
    async def pricing_lookup(query: str) -> str:
        """Get the listed price plus the lowest price you are allowed to offer."""
        return _dump(await client.pricing_lookup(ctx, query))

    @function_tool
    async def policy_lookup(topic: str) -> str:
        """Read the business's own policy text on returns, warranty, payment or delivery."""
        return _dump(await client.policy_lookup(ctx, topic))

    @function_tool
    async def knowledge_lookup(topic: str) -> str:
        """Look up background notes the owner wrote for this business."""
        return _dump(await client.knowledge_lookup(ctx, topic))

    @function_tool
    async def appointment_check(date: str, time: str) -> str:
        """Check whether a date (YYYY-MM-DD) and time (HH:MM) is available."""
        return _dump(await client.appointment_check(ctx, date, time))

    @function_tool
    async def appointment_create(date: str, time: str, notes: str = "") -> str:
        """Book an appointment after checking availability."""
        return _dump(await client.appointment_create(ctx, date, time, notes or None))

    @function_tool
    async def quote_create(items_json: str, discount: float = 0.0) -> str:
        """Create a quote. items_json is a JSON list of {description, unit_price, quantity}."""
        try:
            items = json.loads(items_json)
        except json.JSONDecodeError:
            return _dump({"error": "items_json must be valid JSON"})
        return _dump(await client.quote_create(ctx, items, discount))

    @function_tool
    async def discount_request(
        requested_price: float, product_id: str = "", service_id: str = "", note: str = ""
    ) -> str:
        """Ask whether a lower price is allowed. If not, this files an owner approval request."""
        return _dump(
            await client.discount_request(
                ctx,
                requested_price,
                product_id or None,
                service_id or None,
                note or None,
            )
        )

    @function_tool
    async def escalate_to_human(reason: str, summary: str = "") -> str:
        """Hand the conversation to a human and tell the caller someone will call back."""
        await client.escalate(ctx, reason, summary or None)
        # Handing back the escalation row gives the model nothing to say, and it
        # has gone silent on callers who asked for a person. Say what comes next.
        return _dump(
            {
                "escalated": True,
                "say_next": (
                    "Tell the caller a colleague will call them back shortly. "
                    "One or two short sentences, then stop."
                ),
            }
        )

    @function_tool
    async def end_call(reason: str = "") -> str:
        """Say goodbye and hang up, once the caller's request is fully resolved."""
        ctx.mark("end_call")
        if on_end_call is not None:
            on_end_call(reason or "resolved")
        return _dump({"ending": True})

    catalogue: dict[str, Any] = {
        "customer_lookup": customer_lookup,
        "save_customer": save_customer,
        "product_lookup": product_lookup,
        "service_lookup": service_lookup,
        "pricing_lookup": pricing_lookup,
        "policy_lookup": policy_lookup,
        "knowledge_lookup": knowledge_lookup,
        "appointment_check": appointment_check,
        "appointment_create": appointment_create,
        "quote_create": quote_create,
        "discount_request": discount_request,
        "escalate_to_human": escalate_to_human,
        "end_call": end_call,
    }

    chosen = [
        tool
        for name, tool in catalogue.items()
        if name not in disabled
        and (name not in OPT_IN_TOOLS or name in extra)
        # end_call without a way to hang up would be a promise the agent can't keep.
        and (name != "end_call" or on_end_call is not None)
    ]
    logger.debug("tools built", extra={"count": len(chosen), "disabled": sorted(disabled)})
    return chosen
