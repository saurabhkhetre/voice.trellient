"""Business data access for the voice agent.

The agent reads the business's own data (products, services, pricing rules,
policies, customers) straight from Postgres via asyncpg. Business rules —
price floors, maximum discount, opening hours, slot availability — are
evaluated by database functions (pricing_lookup, appointment_check,
discount_request), so the prompt can never talk its way past them.

The agent connects straight to Postgres with DATABASE_URL. The three database
functions above are defined in db/migrations/0001_schema.sql.
"""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass, field
from datetime import date as date_cls
from datetime import time as time_cls
from typing import Any

import asyncpg


class BusinessDataError(RuntimeError):
    """Raised when the business backend cannot be reached or is misconfigured."""


@dataclass
class BusinessContext:
    """Everything a single call needs to know about the business it serves."""

    business_id: str
    call_id: str | None = None
    customer_id: str | None = None
    agent_config_id: str | None = None
    caller_number: str | None = None
    language: str = "en"
    config: dict[str, Any] = field(default_factory=dict)
    business: dict[str, Any] = field(default_factory=dict)
    tools_used: list[str] = field(default_factory=list)

    def mark(self, tool: str) -> None:
        if tool not in self.tools_used:
            self.tools_used.append(tool)


def _parse_date(value: str) -> date_cls:
    return date_cls.fromisoformat(value)


def _parse_time(value: str) -> time_cls:
    hour, _, minute = value.partition(":")
    return time_cls(int(hour), int(minute or 0))


async def _init_connection(conn: asyncpg.Connection) -> None:
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog", format="text"
    )


class BusinessClient:
    """Thin Postgres client. `DATABASE_URL` stays on the server.

    Uses a small pool rather than one connection: transcript inserts run as
    background tasks while tool calls query at the same time, and a single
    asyncpg connection rejects concurrent operations.
    """

    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or os.environ.get("DATABASE_URL") or ""
        if not self.dsn:
            raise BusinessDataError("DATABASE_URL is required")
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(
            self.dsn, min_size=1, max_size=4, init=_init_connection
        )

    @property
    def conn(self) -> asyncpg.Pool:
        if self._pool is None:
            raise BusinessDataError("BusinessClient.connect() was not called")
        return self._pool

    async def aclose(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    # ---------- context loading ----------

    async def load_context(
        self,
        business_id: str,
        call_id: str | None = None,
        caller_number: str | None = None,
        agent_config_id: str | None = None,
    ) -> BusinessContext:
        business = await self.conn.fetchrow("SELECT * FROM businesses WHERE id = $1", business_id)
        if not business:
            raise BusinessDataError("unknown business")

        if agent_config_id:
            config_row = await self.conn.fetchrow(
                "SELECT * FROM agent_configs WHERE id = $1", agent_config_id
            )
        else:
            config_row = await self.conn.fetchrow(
                "SELECT * FROM agent_configs WHERE business_id = $1 ORDER BY created_at ASC LIMIT 1",
                business_id,
            )
        config = dict(config_row) if config_row else {}
        business_dict = dict(business)

        context = BusinessContext(
            business_id=business_id,
            call_id=call_id,
            agent_config_id=str(config["id"]) if config.get("id") else None,
            caller_number=caller_number,
            language=config.get("primary_language") or business_dict.get("default_language") or "en",
            config=config,
            business=business_dict,
        )
        if caller_number:
            customer = await self.customer_lookup(context, caller_number)
            context.customer_id = customer.get("id") if customer else None
        return context

    async def load_tool_settings(self, ctx: BusinessContext) -> dict[str, bool]:
        """The dashboard Functions tab's switches for this agent, by tool type.

        An agent with no rows keeps the full default tool set.
        """
        if not ctx.agent_config_id:
            return {}
        rows = await self.conn.fetch(
            """SELECT tool_type, bool_and(enabled) AS enabled
               FROM agent_tools WHERE agent_config_id = $1 GROUP BY tool_type""",
            ctx.agent_config_id,
        )
        return {row["tool_type"]: row["enabled"] for row in rows}

    # ---------- agent tools ----------

    async def customer_lookup(self, ctx: BusinessContext, phone: str) -> dict[str, Any] | None:
        ctx.mark("customer_lookup")
        row = await self.conn.fetchrow(
            """SELECT id, name, phone, preferred_language, notes
               FROM customers WHERE business_id = $1 AND phone = $2 LIMIT 1""",
            ctx.business_id,
            phone,
        )
        return dict(row) if row else None

    async def customer_upsert(
        self, ctx: BusinessContext, phone: str, name: str | None = None
    ) -> dict[str, Any]:
        existing = await self.customer_lookup(ctx, phone)
        if existing:
            if name and not existing.get("name"):
                await self.conn.execute("UPDATE customers SET name = $1 WHERE id = $2", name, existing["id"])
                existing["name"] = name
            return existing
        row = await self.conn.fetchrow(
            """INSERT INTO customers (business_id, phone, name) VALUES ($1, $2, $3)
               RETURNING id, name, phone, preferred_language, notes""",
            ctx.business_id,
            phone,
            name,
        )
        return dict(row)

    async def product_lookup(self, ctx: BusinessContext, query: str) -> list[dict[str, Any]]:
        ctx.mark("product_lookup")
        pattern = f"%{query}%"
        rows = await self.conn.fetch(
            """SELECT id, name, category, price, currency, stock_status, description
               FROM products
               WHERE business_id = $1 AND active
                 AND (name ILIKE $2 OR category ILIKE $2 OR description ILIKE $2)
               LIMIT 5""",
            ctx.business_id,
            pattern,
        )
        return [dict(r) for r in rows]

    async def service_lookup(self, ctx: BusinessContext, query: str) -> list[dict[str, Any]]:
        ctx.mark("service_lookup")
        pattern = f"%{query}%"
        rows = await self.conn.fetch(
            """SELECT id, name, base_price, duration_minutes, description
               FROM services
               WHERE business_id = $1 AND active AND (name ILIKE $2 OR description ILIKE $2)
               LIMIT 5""",
            ctx.business_id,
            pattern,
        )
        return [dict(r) for r in rows]

    async def pricing_lookup(self, ctx: BusinessContext, query: str) -> Any:
        """Price plus the floor and discount ceiling, decided in the database."""
        ctx.mark("pricing_lookup")
        return await self.conn.fetchval(
            "SELECT pricing_lookup($1, $2)", ctx.business_id, query
        )

    async def policy_lookup(self, ctx: BusinessContext, topic: str) -> list[dict[str, Any]]:
        ctx.mark("policy_lookup")
        pattern = f"%{topic}%"
        rows = await self.conn.fetch(
            """SELECT policy_type, title, content
               FROM business_policies
               WHERE business_id = $1 AND active
                 AND (policy_type ILIKE $2 OR title ILIKE $2 OR content ILIKE $2)
               LIMIT 3""",
            ctx.business_id,
            pattern,
        )
        return [dict(r) for r in rows]

    async def knowledge_lookup(self, ctx: BusinessContext, topic: str) -> list[dict[str, Any]]:
        ctx.mark("knowledge_lookup")
        pattern = f"%{topic}%"
        rows = await self.conn.fetch(
            """SELECT title, content
               FROM agent_knowledge
               WHERE business_id = $1 AND active AND (title ILIKE $2 OR content ILIKE $2)
               LIMIT 3""",
            ctx.business_id,
            pattern,
        )
        return [dict(r) for r in rows]

    async def appointment_check(self, ctx: BusinessContext, date: str, time: str) -> Any:
        ctx.mark("appointment_check")
        return await self.conn.fetchval(
            "SELECT appointment_check($1, $2, $3)",
            ctx.business_id,
            _parse_date(date),
            _parse_time(time),
        )

    async def appointment_create(
        self, ctx: BusinessContext, date: str, time: str, notes: str | None = None
    ) -> dict[str, Any]:
        ctx.mark("appointment_create")
        row = await self.conn.fetchrow(
            """INSERT INTO appointments
                 (business_id, customer_id, requested_date, requested_time, notes, source_call_id, status)
               VALUES ($1, $2, $3, $4, $5, $6, 'requested')
               RETURNING *""",
            ctx.business_id,
            ctx.customer_id,
            _parse_date(date),
            _parse_time(time),
            notes,
            ctx.call_id,
        )
        return dict(row)

    async def quote_create(
        self, ctx: BusinessContext, items: list[dict[str, Any]], discount: float = 0.0
    ) -> dict[str, Any]:
        """Creates a quote with line items. Totals are computed here, not spoken."""
        ctx.mark("quote_create")
        subtotal = sum(float(i["unit_price"]) * float(i.get("quantity", 1)) for i in items)
        total = max(subtotal - discount, 0.0)
        # quotes has UNIQUE (business_id, quote_number), so every quote — even a
        # second one in the same call — needs its own number.
        number = f"Q-{secrets.token_hex(4).upper()}"
        async with self.conn.acquire() as conn, conn.transaction():
            quote = await conn.fetchrow(
                """INSERT INTO quotes
                     (business_id, customer_id, quote_number, status, subtotal, discount, total,
                      approval_required, source_call_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                   RETURNING *""",
                ctx.business_id,
                ctx.customer_id,
                number,
                "pending_approval" if discount > 0 else "draft",
                subtotal,
                discount,
                total,
                discount > 0,
                ctx.call_id,
            )
            quote_dict = dict(quote)
            for item in items:
                quantity = item.get("quantity", 1)
                await conn.execute(
                    """INSERT INTO quote_items
                         (quote_id, business_id, product_id, service_id, description, quantity, unit_price, total)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                    quote_dict["id"],
                    ctx.business_id,
                    item.get("product_id"),
                    item.get("service_id"),
                    item["description"],
                    quantity,
                    item["unit_price"],
                    float(item["unit_price"]) * float(quantity),
                )
        return quote_dict

    async def discount_request(
        self,
        ctx: BusinessContext,
        requested_price: float,
        product_id: str | None = None,
        service_id: str | None = None,
        note: str | None = None,
    ) -> Any:
        """Asks the database whether a price is allowed. Files an approval if not."""
        ctx.mark("discount_request")
        # discount_request() only accounts for products, not services (matches
        # the database function's actual signature).
        del service_id
        return await self.conn.fetchval(
            "SELECT discount_request($1, $2, $3, $4, $5, $6)",
            ctx.business_id,
            product_id,
            requested_price,
            ctx.customer_id,
            ctx.call_id,
            note,
        )

    async def escalate(
        self, ctx: BusinessContext, reason: str, summary: str | None = None
    ) -> dict[str, Any]:
        ctx.mark("escalate_to_human")
        row = await self.conn.fetchrow(
            """INSERT INTO escalations (business_id, call_id, customer_id, reason, summary, status)
               VALUES ($1, $2, $3, $4, $5, 'open')
               RETURNING *""",
            ctx.business_id,
            ctx.call_id,
            ctx.customer_id,
            reason,
            summary,
        )
        if ctx.call_id:
            await self.conn.execute(
                "UPDATE calls SET escalation_required = true, escalation_reason = $1 WHERE id = $2",
                reason,
                ctx.call_id,
            )
        return dict(row)

    # ---------- call bookkeeping ----------

    async def start_call(
        self,
        business_id: str,
        provider: str,
        room_name: str,
        caller_number: str | None,
        customer_id: str | None = None,
        agent_config_id: str | None = None,
    ) -> str:
        call_id = await self.conn.fetchval(
            """INSERT INTO calls
                 (business_id, agent_config_id, customer_id, provider, provider_call_id, room_name,
                  caller_number, status, answered_at)
               VALUES ($1, $2, $3, $4, $5, $5, $6, 'in_progress', now())
               RETURNING id""",
            business_id,
            agent_config_id,
            customer_id,
            provider,
            room_name,
            caller_number,
        )
        return str(call_id)

    async def mark_answered(self, ctx: BusinessContext) -> None:
        """Moves a call row created before the agent joined from ringing to in_progress."""
        if not ctx.call_id:
            return
        await self.conn.execute(
            """UPDATE calls SET status = 'in_progress', answered_at = now()
               WHERE id = $1 AND status = 'ringing'""",
            ctx.call_id,
        )

    async def add_transcript(self, ctx: BusinessContext, speaker: str, text: str) -> None:
        if not ctx.call_id or not text.strip():
            return
        await self.conn.execute(
            "INSERT INTO call_transcripts (call_id, business_id, speaker, text) VALUES ($1, $2, $3, $4)",
            ctx.call_id,
            ctx.business_id,
            speaker,
            text,
        )

    async def add_event(
        self, ctx: BusinessContext, event_type: str, data: dict[str, Any] | None = None
    ) -> None:
        if not ctx.call_id:
            return
        await self.conn.execute(
            "INSERT INTO call_events (call_id, business_id, event_type, event_data) VALUES ($1, $2, $3, $4)",
            ctx.call_id,
            ctx.business_id,
            event_type,
            data or {},
        )

    async def finish_call(
        self,
        ctx: BusinessContext,
        duration_seconds: int,
        summary: str | None,
        intent: str | None = None,
        outcome: str | None = None,
    ) -> None:
        if not ctx.call_id:
            return
        await self.conn.execute(
            """UPDATE calls
               SET ended_at = now(), duration_seconds = $1, status = 'completed', summary = $2,
                   intent = $3, outcome = $4, language = $5, tools_used = $6
               WHERE id = $7""",
            duration_seconds,
            summary,
            intent,
            outcome,
            ctx.language,
            ctx.tools_used,
            ctx.call_id,
        )

    async def fail_call(self, ctx: BusinessContext, reason: str, duration_seconds: int) -> None:
        """Closes a call the agent could not run, so it isn't filed as a normal one."""
        if not ctx.call_id:
            return
        await self.conn.execute(
            """UPDATE calls
               SET ended_at = now(), status = 'failed', duration_seconds = $1, summary = $2,
                   language = $3, tools_used = $4
               WHERE id = $5""",
            duration_seconds,
            reason[:500],
            ctx.language,
            ctx.tools_used,
            ctx.call_id,
        )
