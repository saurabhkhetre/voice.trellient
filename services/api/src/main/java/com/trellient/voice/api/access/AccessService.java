package com.trellient.voice.api.access;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * Workspace authorization, ported from src/lib/auth/access.ts.
 *
 * Every protected endpoint must verify that the authenticated user actually
 * belongs to the workspace they are addressing. Without this a user in
 * workspace A could reach workspace B's rows by guessing ids.
 *
 * The web app surfaced these as plain Errors (HTTP 500); here they are 403 or
 * 404, which is what the failure actually is. Messages are kept identical so
 * the dashboard can keep showing them verbatim.
 */
@Service
public class AccessService {

    /**
     * Roles allowed to change a workspace's configuration. `agent` is the
     * call-handling role: it reads everything in its workspace and may edit
     * operational data (customers), but not the configuration that decides
     * what the voice agent says, which numbers ring, what is spent on
     * outbound, or who may listen to live calls.
     */
    public static final List<String> MANAGER_ROLES = List.of("owner", "manager");

    private final JdbcTemplate jdbc;

    public AccessService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The user's primary workspace: their oldest membership, as in resolveBusinessId(). */
    public String resolveBusinessId(String userId) {
        List<String> ids = jdbc.queryForList(
                """
                SELECT business_id::text FROM business_users
                WHERE auth_user_id = ?::uuid
                ORDER BY created_at ASC
                LIMIT 1
                """,
                String.class, userId);
        if (ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "You are not a member of any workspace.");
        }
        return ids.get(0);
    }

    public void requireBusinessMembership(String userId, String businessId) {
        Integer found = first(jdbc.queryForList(
                "SELECT 1 FROM business_users WHERE business_id = ?::uuid AND auth_user_id = ?::uuid LIMIT 1",
                Integer.class, businessId, userId));
        if (found == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this workspace.");
        }
    }

    public void requireBusinessRole(String userId, String businessId, List<String> roles) {
        Integer found = first(jdbc.queryForList(
                """
                SELECT 1 FROM business_users
                WHERE business_id = ?::uuid AND auth_user_id = ?::uuid AND role::text = ANY (?)
                LIMIT 1
                """,
                Integer.class, businessId, userId, roles.toArray(String[]::new)));
        if (found == null) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "You don't have permission to do this in this workspace.");
        }
    }

    /** The workspace and name of an agent the user may administer. */
    public AgentRef requireAgentOwnership(String userId, String agentConfigId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT business_id::text AS business_id, name FROM agent_configs WHERE id = ?::uuid LIMIT 1",
                agentConfigId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Agent not found.");
        }
        String businessId = (String) rows.get(0).get("business_id");
        Integer member = first(jdbc.queryForList(
                "SELECT 1 FROM business_users WHERE business_id = ?::uuid AND auth_user_id = ?::uuid LIMIT 1",
                Integer.class, businessId, userId));
        if (member == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have access to this agent.");
        }
        return new AgentRef(businessId, (String) rows.get(0).get("name"));
    }

    /**
     * As requireAgentOwnership, and additionally that the agent sits in the
     * given workspace — so a row in one workspace can never point at another's
     * agent.
     */
    public void requireAgentInBusiness(String userId, String agentConfigId, String businessId) {
        AgentRef agent = requireAgentOwnership(userId, agentConfigId);
        if (!agent.businessId().equals(businessId)) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "That agent belongs to a different workspace.");
        }
    }

    /**
     * The workspace owning a row in a business-scoped table, once the user is
     * confirmed to be a member of it. `table` is never request-supplied — each
     * caller passes a literal.
     */
    public String requireRowAccess(String userId, String table, String rowId, String missingMessage) {
        List<String> ids = jdbc.queryForList(
                "SELECT business_id::text FROM " + table + " WHERE id = ?::uuid",
                String.class, rowId);
        if (ids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, missingMessage);
        }
        requireBusinessMembership(userId, ids.get(0));
        return ids.get(0);
    }

    /** Membership plus owner/manager. The check for a workspace-level write. */
    public void requireManager(String userId, String businessId) {
        requireBusinessRole(userId, businessId, MANAGER_ROLES);
    }

    /**
     * As requireAgentOwnership, and additionally owner/manager on the agent's
     * workspace. The check for any write to an agent or its tools.
     */
    public AgentRef requireAgentManager(String userId, String agentConfigId) {
        AgentRef agent = requireAgentOwnership(userId, agentConfigId);
        requireManager(userId, agent.businessId());
        return agent;
    }

    /**
     * As requireRowAccess, and additionally owner/manager on the row's
     * workspace. The check for a write keyed by a row id.
     */
    public String requireRowManager(String userId, String table, String rowId, String missingMessage) {
        String businessId = requireRowAccess(userId, table, rowId, missingMessage);
        requireManager(userId, businessId);
        return businessId;
    }

    private static <T> T first(List<T> rows) {
        return rows.isEmpty() ? null : rows.get(0);
    }

    public record AgentRef(String businessId, String name) {}
}
