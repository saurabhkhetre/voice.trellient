package com.trellient.voice.api.controllers;

import com.trellient.voice.api.access.AccessService;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.web.Validate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Per-agent functions, ported from src/lib/voice/agent-tools.functions.ts. */
@RestController
@RequestMapping("/api/agents")
public class AgentToolController {

    private static final List<String> TOOL_TYPES = List.of(
            "end_call", "transfer_call", "book_appointment", "pricing_lookup", "create_quote", "custom");

    private final JdbcTemplate jdbc;
    private final AccessService access;

    public AgentToolController(JdbcTemplate jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    /** The functions configured for one agent, in display order. */
    @GetMapping("/{agentConfigId}/tools")
    public List<Map<String, Object>> list(@AuthenticationPrincipal UserPrincipal user,
                                          @PathVariable String agentConfigId) {
        AccessService.AgentRef agent =
                access.requireAgentOwnership(user.getId(), Validate.uuid(agentConfigId, "agentConfigId"));
        return jdbc.query(
                """
                SELECT id::text AS id, name, description, tool_type, enabled
                FROM agent_tools
                WHERE agent_config_id = ?::uuid AND business_id = ?::uuid
                ORDER BY sort_order ASC, created_at ASC
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("name", rs.getString("name"));
                    row.put("description", rs.getString("description"));
                    row.put("toolType", rs.getString("tool_type"));
                    row.put("enabled", rs.getBoolean("enabled"));
                    return row;
                },
                agentConfigId, agent.businessId());
    }

    /** Adds a function to the end of the agent's list. */
    @PostMapping("/{agentConfigId}/tools")
    public Map<String, String> add(@AuthenticationPrincipal UserPrincipal user,
                                   @PathVariable String agentConfigId,
                                   @RequestBody Map<String, Object> body) {
        AccessService.AgentRef agent =
                access.requireAgentManager(user.getId(), Validate.uuid(agentConfigId, "agentConfigId"));

        String name = Validate.text(body.get("name"), "Give the function a name.", 120);
        String description = body.get("description") == null
                ? "" : Validate.optionalText(body.get("description"), 2000);
        String toolType = Validate.oneOf(body.get("toolType"), TOOL_TYPES, "toolType");

        String id = jdbc.queryForObject(
                """
                INSERT INTO agent_tools (business_id, agent_config_id, name, description, tool_type, sort_order)
                SELECT ?::uuid, ?::uuid, ?, ?, ?, COALESCE(MAX(sort_order) + 1, 0)
                FROM agent_tools
                WHERE agent_config_id = ?::uuid
                RETURNING id::text
                """,
                String.class,
                agent.businessId(), agentConfigId, name, description == null ? "" : description,
                toolType, agentConfigId);
        return Map.of("id", id);
    }

    /** Renames, re-describes, or enables/disables a function. */
    @PatchMapping("/tools/{toolId}")
    public void update(@AuthenticationPrincipal UserPrincipal user,
                       @PathVariable String toolId,
                       @RequestBody Map<String, Object> body) {
        access.requireRowManager(user.getId(), "agent_tools", Validate.uuid(toolId, "toolId"),
                "That function no longer exists.");

        // Column names are literals here, never request keys.
        List<String> assignments = new ArrayList<>();
        List<Object> params = new ArrayList<>();
        if (body.containsKey("name")) {
            assignments.add("name = ?");
            params.add(Validate.text(body.get("name"), "Give the function a name.", 120));
        }
        if (body.containsKey("description")) {
            assignments.add("description = ?");
            String description = Validate.optionalText(body.get("description"), 2000);
            params.add(description == null ? "" : description);
        }
        if (body.containsKey("enabled")) {
            if (!(body.get("enabled") instanceof Boolean enabled)) {
                throw Validate.bad("Provide enabled as true or false.");
            }
            assignments.add("enabled = ?");
            params.add(enabled);
        }
        if (assignments.isEmpty()) return;

        params.add(toolId);
        jdbc.update("UPDATE agent_tools SET " + String.join(", ", assignments)
                + ", updated_at = now() WHERE id = ?::uuid", params.toArray());
    }

    @DeleteMapping("/tools/{toolId}")
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable String toolId) {
        access.requireRowManager(user.getId(), "agent_tools", Validate.uuid(toolId, "toolId"),
                "That function no longer exists.");
        jdbc.update("DELETE FROM agent_tools WHERE id = ?::uuid", toolId);
    }
}
