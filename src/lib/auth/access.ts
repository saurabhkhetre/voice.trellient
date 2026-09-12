/**
 * Server-side workspace authorization helpers.
 *
 * Every protected server function must verify that the authenticated user
 * actually belongs to the workspace they're trying to access. These helpers
 * prevent IDOR-style access where a user from Workspace A could access
 * Workspace B's resources by guessing IDs.
 */

import { getPool } from "@/lib/db/pg.server";

/**
 * Resolves the authenticated user's primary business_id.
 * Throws if the user has no workspace membership.
 */
export async function resolveBusinessId(userId: string): Promise<string> {
  const { rows } = await getPool().query<{ business_id: string }>(
    `SELECT business_id FROM business_users
     WHERE auth_user_id = $1
     ORDER BY created_at ASC
     LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row) throw new Error("You are not a member of any workspace.");
  return row.business_id;
}

/**
 * Verifies that the user is a member of the workspace that owns the given
 * agent config. Returns the validated business_id.
 * Throws if the agent doesn't exist or the user doesn't have access.
 */
export async function requireAgentOwnership(
  userId: string,
  agentConfigId: string,
): Promise<{ businessId: string; agentName: string }> {
  const { rows: agentRows } = await getPool().query<{ business_id: string; name: string }>(
    `SELECT business_id, name FROM agent_configs WHERE id = $1 LIMIT 1`,
    [agentConfigId],
  );
  const agent = agentRows[0];
  if (!agent) throw new Error("Agent not found.");

  const { rows: memberRows } = await getPool().query(
    `SELECT id FROM business_users WHERE business_id = $1 AND auth_user_id = $2 LIMIT 1`,
    [agent.business_id, userId],
  );
  if (!memberRows[0]) throw new Error("You do not have access to this agent.");

  return { businessId: agent.business_id, agentName: agent.name };
}

/**
 * Verifies the user can access the agent and that it belongs to the given
 * business, so a record in one workspace can never point at another's agent.
 */
export async function requireAgentInBusiness(
  userId: string,
  agentConfigId: string,
  businessId: string,
): Promise<void> {
  const agent = await requireAgentOwnership(userId, agentConfigId);
  if (agent.businessId !== businessId) throw new Error("That agent belongs to a different workspace.");
}

/**
 * Verifies that the user is a member of the specified business.
 * Throws if not.
 */
export async function requireBusinessMembership(userId: string, businessId: string): Promise<void> {
  const { rows } = await getPool().query(
    `SELECT id FROM business_users WHERE business_id = $1 AND auth_user_id = $2 LIMIT 1`,
    [businessId, userId],
  );
  if (!rows[0]) throw new Error("You do not have access to this workspace.");
}

/**
 * Verifies that the user holds one of the given roles in the business.
 * Throws if not.
 */
export async function requireBusinessRole(
  userId: string,
  businessId: string,
  roles: string[],
): Promise<void> {
  const { rows } = await getPool().query(
    `SELECT id FROM business_users
     WHERE business_id = $1 AND auth_user_id = $2 AND role::text = ANY($3)
     LIMIT 1`,
    [businessId, userId, roles],
  );
  if (!rows[0]) throw new Error("You don't have permission to do this in this workspace.");
}
