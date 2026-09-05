"""Realtime function tools exposed to the model.

Each tool is a thin wrapper over BusinessClient: no business rule is duplicated
here. Prices, floors, discount limits and slot availability are decided by the
database, and the tool only relays the verdict to the model.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from livekit.agents import function_tool

from voice_agent.business import BusinessClient, BusinessContext

logger = logging.getLogger("voice_agent.tools")


def _dump(value: Any) -> str:
    return json.dumps(value, default=str, ensure_ascii=False)


def build_tools(client: BusinessClient, ctx: BusinessContext) -> list[Any]:
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
        return _dump(await client.escalate(ctx, reason, summary or None))

    return [
        customer_lookup,
        save_customer,
        product_lookup,
        service_lookup,
        pricing_lookup,
        policy_lookup,
        knowledge_lookup,
        appointment_check,
        appointment_create,
        quote_create,
        discount_request,
        escalate_to_human,
    ]
