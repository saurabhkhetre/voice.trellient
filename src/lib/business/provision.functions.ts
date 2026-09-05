import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuthContext } from "@/lib/supabase/auth-context";

/**
 * Creates a workspace for the signed-in user when they are not a member of one
 * yet, and makes them its owner. Idempotent: returns the existing membership.
 */
export const provisionWorkspace = createServerFn({ method: "POST" })
  // @ts-expect-error -- TanStack Start beta: middleware type inference is incomplete
  .middleware([requireSupabaseAuth])
  .handler(async ({ context: _ctx }) => {
    const ctx = _ctx as unknown as AuthContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = ctx.userId;

    const existing = await supabaseAdmin
      .from("business_users")
      .select("business_id")
      .eq("auth_user_id", userId)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return { businessId: existing.data.business_id, created: false };

    const email = (ctx.claims as { email?: string } | null)?.email ?? null;
    const business = await supabaseAdmin
      .from("businesses")
      .insert({
        name: email ? `${email.split("@")[0]}'s workspace` : "My workspace",
        email,
        default_language: "en",
        timezone: "Asia/Kolkata",
      })
      .select("id")
      .single();
    if (business.error) throw new Error(business.error.message);

    const membership = await supabaseAdmin
      .from("business_users")
      .insert({ business_id: business.data.id, auth_user_id: userId, role: "owner" });
    if (membership.error) throw new Error(membership.error.message);

    const agent = await supabaseAdmin.from("agent_configs").insert({
      business_id: business.data.id,
      name: "Front desk agent",
      greeting: "Hi, thanks for calling. How can I help you today?",
      primary_language: "en",
      enabled: false,
    });
    if (agent.error) throw new Error(agent.error.message);

    return { businessId: business.data.id, created: true };
  });
