"""Business data access for the voice agent.

The agent reads the business's own data (products, services, pricing rules,
policies, customers) straight from Postgres through the Supabase Data API using
the service role key. Business rules — price floors, maximum discount, opening
hours, slot availability — are evaluated by database functions, so the prompt
can never talk its way past them.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import httpx


class BusinessDataError(RuntimeError):
    """Raised when the business backend cannot be reached or is misconfigured."""


@dataclass
class BusinessContext:
    """Everything a single call needs to know about the business it serves."""

    business_id: str
    call_id: str | None = None
    customer_id: str | None = None
    caller_number: str | None = None
    language: str = "en"
    config: dict[str, Any] = field(default_factory=dict)
    business: dict[str, Any] = field(default_factory=dict)
    tools_used: list[str] = field(default_factory=list)

    def mark(self, tool: str) -> None:
        if tool not in self.tools_used:
            self.tools_used.append(tool)


class BusinessClient:
    """Thin Supabase Data API client. Service-role key stays on the server."""

    def __init__(self, url: str | None = None, key: str | None = None) -> None:
        self.url = (url or os.environ.get("SUPABASE_URL") or "").rstrip("/")
        self.key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        if not self.url or not self.key:
            raise BusinessDataError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        headers = {"apikey": self.key, "content-type": "application/json"}
        # Opaque sb_secret_ keys are not JWTs: send them as apikey only.
        if not self.key.startswith("sb_"):
            headers["Authorization"] = f"Bearer {self.key}"
        self._client = httpx.AsyncClient(base_url=self.url, headers=headers, timeout=10.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        response = await self._client.get(f"/rest/v1/{path}", params=params)
        response.raise_for_status()
        return response.json()

    async def _post(self, path: str, payload: Any, prefer: str = "return=representation") -> Any:
        response = await self._client.post(
            f"/rest/v1/{path}", json=payload, headers={"Prefer": prefer}
        )
        response.raise_for_status()
        return response.json() if response.content else None

    async def _rpc(self, name: str, payload: dict[str, Any]) -> Any:
        response = await self._client.post(f"/rest/v1/rpc/{name}", json=payload)
        response.raise_for_status()
        return response.json() if response.content else None

    async def _patch(self, path: str, params: dict[str, str], payload: dict[str, Any]) -> None:
        response = await self._client.patch(f"/rest/v1/{path}", params=params, json=payload)
        response.raise_for_status()

    # ---------- context loading ----------

    async def load_context(
        self,
        business_id: str,
        call_id: str | None = None,
        caller_number: str | None = None,
        agent_config_id: str | None = None,
    ) -> BusinessContext:
        business = await self._get(
            "businesses", {"id": f"eq.{business_id}", "select": "*", "limit": "1"}
        )
        if not business:
            raise BusinessDataError("unknown business")

        # Load the specific agent config if provided, otherwise fall back to
        # the first config for the business.
        if agent_config_id:
            configs = await self._get(
                "agent_configs",
                {"id": f"eq.{agent_config_id}", "select": "*", "limit": "1"},
            )
        else:
            configs = await self._get(
                "agent_configs",
                {"business_id": f"eq.{business_id}", "select": "*", "limit": "1"},
            )
        config = configs[0] if configs else {}
        context = BusinessContext(
            business_id=business_id,
            call_id=call_id,
            caller_number=caller_number,
            language=config.get("primary_language") or business[0].get("default_language") or "en",
            config=config,
            business=business[0],
        )
        if caller_number:
            customer = await self.customer_lookup(context, caller_number)
            context.customer_id = customer.get("id") if customer else None
        return context

    # ---------- agent tools ----------

    async def customer_lookup(
        self, ctx: BusinessContext, phone: str
    ) -> dict[str, Any] | None:
        ctx.mark("customer_lookup")
        rows = await self._get(
            "customers",
            {
                "business_id": f"eq.{ctx.business_id}",
                "phone": f"eq.{phone}",
                "select": "id,name,phone,preferred_language,notes",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    async def customer_upsert(
        self, ctx: BusinessContext, phone: str, name: str | None = None
    ) -> dict[str, Any]:
        existing = await self.customer_lookup(ctx, phone)
        if existing:
            if name and not existing.get("name"):
                await self._patch(
                    "customers", {"id": f"eq.{existing['id']}"}, {"name": name}
                )
                existing["name"] = name
            return existing
        created = await self._post(
            "customers", {"business_id": ctx.business_id, "phone": phone, "name": name}
        )
        return created[0]

    async def product_lookup(self, ctx: BusinessContext, query: str) -> list[dict[str, Any]]:
        ctx.mark("product_lookup")
        return await self._get(
            "products",
            {
                "business_id": f"eq.{ctx.business_id}",
                "active": "eq.true",
                "or": f"(name.ilike.*{query}*,category.ilike.*{query}*,description.ilike.*{query}*)",
                "select": "id,name,category,price,currency,stock_status,description",
                "limit": "5",
            },
        )

    async def service_lookup(self, ctx: BusinessContext, query: str) -> list[dict[str, Any]]:
        ctx.mark("service_lookup")
        return await self._get(
            "services",
            {
                "business_id": f"eq.{ctx.business_id}",
                "active": "eq.true",
                "or": f"(name.ilike.*{query}*,description.ilike.*{query}*)",
                "select": "id,name,base_price,duration_minutes,description",
                "limit": "5",
            },
        )

    async def pricing_lookup(self, ctx: BusinessContext, query: str) -> Any:
        """Price plus the floor and discount ceiling, decided in the database."""
        ctx.mark("pricing_lookup")
        return await self._rpc(
            "pricing_lookup", {"_business_id": ctx.business_id, "_query": query}
        )

    async def policy_lookup(self, ctx: BusinessContext, topic: str) -> list[dict[str, Any]]:
        ctx.mark("policy_lookup")
        return await self._get(
            "business_policies",
            {
                "business_id": f"eq.{ctx.business_id}",
                "active": "eq.true",
                "or": f"(policy_type.ilike.*{topic}*,title.ilike.*{topic}*,content.ilike.*{topic}*)",
                "select": "policy_type,title,content",
                "limit": "3",
            },
        )

    async def knowledge_lookup(self, ctx: BusinessContext, topic: str) -> list[dict[str, Any]]:
        ctx.mark("knowledge_lookup")
        return await self._get(
            "agent_knowledge",
            {
                "business_id": f"eq.{ctx.business_id}",
                "active": "eq.true",
                "or": f"(title.ilike.*{topic}*,content.ilike.*{topic}*)",
                "select": "title,content",
                "limit": "3",
            },
        )

    async def appointment_check(self, ctx: BusinessContext, date: str, time: str) -> Any:
        ctx.mark("appointment_check")
        return await self._rpc(
            "appointment_check",
            {"_business_id": ctx.business_id, "_date": date, "_time": time},
        )

    async def appointment_create(
        self, ctx: BusinessContext, date: str, time: str, notes: str | None = None
    ) -> dict[str, Any]:
        ctx.mark("appointment_create")
        created = await self._post(
            "appointments",
            {
                "business_id": ctx.business_id,
                "customer_id": ctx.customer_id,
                "requested_date": date,
                "requested_time": time,
                "notes": notes,
                "source_call_id": ctx.call_id,
                "status": "requested",
            },
        )
        return created[0]

    async def quote_create(
        self, ctx: BusinessContext, items: list[dict[str, Any]], discount: float = 0.0
    ) -> dict[str, Any]:
        """Creates a quote with line items. Totals are computed here, not spoken."""
        ctx.mark("quote_create")
        subtotal = sum(float(i["unit_price"]) * float(i.get("quantity", 1)) for i in items)
        total = max(subtotal - discount, 0.0)
        number = f"Q-{(ctx.call_id or 'manual')[:8].upper()}"
        created = await self._post(
            "quotes",
            {
                "business_id": ctx.business_id,
                "customer_id": ctx.customer_id,
                "quote_number": number,
                "status": "pending_approval" if discount > 0 else "draft",
                "subtotal": subtotal,
                "discount": discount,
                "total": total,
                "approval_required": discount > 0,
                "source_call_id": ctx.call_id,
            },
        )
        quote = created[0]
        if items:
            await self._post(
                "quote_items",
                [
                    {
                        "quote_id": quote["id"],
                        "business_id": ctx.business_id,
                        "product_id": item.get("product_id"),
                        "service_id": item.get("service_id"),
                        "description": item["description"],
                        "quantity": item.get("quantity", 1),
                        "unit_price": item["unit_price"],
                        "total": float(item["unit_price"]) * float(item.get("quantity", 1)),
                    }
                    for item in items
                ],
                prefer="return=minimal",
            )
        return quote

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
        return await self._rpc(
            "discount_request",
            {
                "_business_id": ctx.business_id,
                "_call_id": ctx.call_id,
                "_customer_id": ctx.customer_id,
                "_product_id": product_id,
                "_service_id": service_id,
                "_requested_price": requested_price,
                "_note": note,
            },
        )

    async def escalate(
        self, ctx: BusinessContext, reason: str, summary: str | None = None
    ) -> dict[str, Any]:
        ctx.mark("escalate_to_human")
        created = await self._post(
            "escalations",
            {
                "business_id": ctx.business_id,
                "call_id": ctx.call_id,
                "customer_id": ctx.customer_id,
                "reason": reason,
                "summary": summary,
                "status": "open",
            },
        )
        if ctx.call_id:
            await self._patch(
                "calls",
                {"id": f"eq.{ctx.call_id}"},
                {"escalation_required": True, "escalation_reason": reason},
            )
        return created[0]

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
        created = await self._post(
            "calls",
            {
                "business_id": business_id,
                "agent_config_id": agent_config_id,
                "customer_id": customer_id,
                "provider": provider,
                "provider_call_id": room_name,
                "caller_number": caller_number,
                "status": "in_progress",
            },
        )
        return created[0]["id"]

    async def add_transcript(
        self, ctx: BusinessContext, speaker: str, text: str
    ) -> None:
        if not ctx.call_id or not text.strip():
            return
        await self._post(
            "call_transcripts",
            {
                "call_id": ctx.call_id,
                "business_id": ctx.business_id,
                "speaker": speaker,
                "text": text,
            },
            prefer="return=minimal",
        )

    async def add_event(
        self, ctx: BusinessContext, event_type: str, data: dict[str, Any] | None = None
    ) -> None:
        if not ctx.call_id:
            return
        await self._post(
            "call_events",
            {
                "call_id": ctx.call_id,
                "business_id": ctx.business_id,
                "event_type": event_type,
                "event_data": data or {},
            },
            prefer="return=minimal",
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
        await self._patch(
            "calls",
            {"id": f"eq.{ctx.call_id}"},
            {
                "ended_at": "now()",
                "duration_seconds": duration_seconds,
                "status": "completed",
                "summary": summary,
                "intent": intent,
                "outcome": outcome,
                "language": ctx.language,
                "tools_used": ctx.tools_used,
            },
        )
