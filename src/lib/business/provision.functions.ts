import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

/**
 * Creates a workspace for the signed-in user when they are not a member of one
 * yet, and makes them its owner. Idempotent: returns the existing membership.
 */
export const provisionWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const existing = await supabaseAdmin
      .from("business_users")
      .select("business_id")
      .eq("auth_user_id", userId)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return { businessId: existing.data.business_id, created: false };

    const email = (context.claims as Record<string, unknown> & { email?: string })?.email ?? null;
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
