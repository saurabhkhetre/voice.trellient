/**
 * Server-side workspace authorization helpers.
 *
 * Every protected server function must verify that the authenticated user
 * actually belongs to the workspace they're trying to access. These helpers
 * prevent IDOR-style access where a user from Workspace A could access
 * Workspace B's resources by guessing IDs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Resolves the authenticated user's primary business_id.
 * Throws if the user has no workspace membership.
 */
export async function resolveBusinessId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("business_users")
    .select("business_id")
    .eq("auth_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to resolve workspace: ${error.message}`);
  if (!data) throw new Error("You are not a member of any workspace.");
  return data.business_id;
}

/**
 * Verifies that the user is a member of the workspace that owns the given
 * agent config. Returns the validated business_id.
 * Throws if the agent doesn't exist or the user doesn't have access.
 */
export async function requireAgentOwnership(
  supabase: SupabaseClient<Database>,
  userId: string,
  agentConfigId: string,
): Promise<{ businessId: string; agentName: string }> {
  // Load the agent and verify it exists
  const { data: agent, error: agentErr } = await supabase
    .from("agent_configs")
    .select("id, business_id, name")
    .eq("id", agentConfigId)
    .maybeSingle();

  if (agentErr) throw new Error(`Failed to load agent: ${agentErr.message}`);
  if (!agent) throw new Error("Agent not found.");

  // Verify the user is a member of the agent's workspace
  const { data: membership, error: memberErr } = await supabase
    .from("business_users")
    .select("id")
    .eq("business_id", agent.business_id)
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (memberErr) throw new Error(`Authorization check failed: ${memberErr.message}`);
  if (!membership) throw new Error("You do not have access to this agent.");

  return { businessId: agent.business_id, agentName: agent.name };
}

/**
 * Verifies that the user is a member of the specified business.
 * Throws if not.
 */
export async function requireBusinessMembership(
  supabase: SupabaseClient<Database>,
  userId: string,
  businessId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("business_users")
    .select("id")
    .eq("business_id", businessId)
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Authorization check failed: ${error.message}`);
  if (!data) throw new Error("You do not have access to this workspace.");
}
