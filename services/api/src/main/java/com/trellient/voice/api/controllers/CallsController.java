package com.trellient.voice.api.controllers;

import com.trellient.voice.api.access.AccessService;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.web.Rows;
import com.trellient.voice.api.web.Validate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Call history and detail, ported from src/lib/voice/calls.functions.ts. */
@RestController
@RequestMapping("/api/calls")
public class CallsController {

    /** Scope names map to fixed SQL fragments — the request never supplies SQL. */
    private static final Map<String, String> SCOPE_FILTERS = Map.of(
            "recent", "",
            "active", "AND c.status IN ('ringing', 'in_progress')",
            "finished", "AND c.status IN ('completed', 'failed', 'missed')");

    private final JdbcTemplate jdbc;
    private final AccessService access;

    public CallsController(JdbcTemplate jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    /** The 50 most recent calls in the workspace, optionally only live or only ended ones. */
    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal UserPrincipal user,
                                          @RequestParam String businessId,
                                          @RequestParam(defaultValue = "recent") String scope) {
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));
        String filter = SCOPE_FILTERS.get(scope);
        if (filter == null) throw Validate.bad("scope must be one of: recent, active, finished.");

        return jdbc.query(
                """
                SELECT c.id::text AS id, c.caller_number, c.destination_number, cu.name AS customer_name,
                       c.agent_config_id::text AS agent_config_id, c.room_name, c.status, c.direction,
                       c.provider, c.started_at, c.duration_seconds, c.language, c.intent, c.outcome,
                       c.summary, c.tools_used, c.escalation_required, c.latency_ms
                FROM calls c
                LEFT JOIN customers cu ON cu.id = c.customer_id
                WHERE c.business_id = ?::uuid
                """ + filter + """

                ORDER BY c.started_at DESC
                LIMIT 50
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("callerNumber", rs.getString("caller_number"));
                    row.put("destinationNumber", rs.getString("destination_number"));
                    row.put("customerName", rs.getString("customer_name"));
                    row.put("agentConfigId", rs.getString("agent_config_id"));
                    row.put("roomName", rs.getString("room_name"));
                    row.put("status", rs.getString("status"));
                    row.put("direction", rs.getString("direction"));
                    row.put("provider", rs.getString("provider"));
                    String startedAt = Rows.iso(rs, "started_at");
                    row.put("startedAt", startedAt == null ? "" : startedAt);
                    row.put("durationSeconds", Rows.intOrNull(rs, "duration_seconds"));
                    row.put("language", rs.getString("language"));
                    row.put("intent", rs.getString("intent"));
                    row.put("outcome", rs.getString("outcome"));
                    row.put("summary", rs.getString("summary"));
                    row.put("toolsUsed", Rows.textArray(rs, "tools_used"));
                    row.put("escalationRequired", rs.getBoolean("escalation_required"));
                    row.put("latencyMs", Rows.intOrNull(rs, "latency_ms"));
                    return row;
                },
                businessId);
    }

    /** The 50 most recent calls handled by one agent. */
    @GetMapping("/by-agent/{agentConfigId}")
    public List<Map<String, Object>> listForAgent(@AuthenticationPrincipal UserPrincipal user,
                                                  @PathVariable String agentConfigId) {
        AccessService.AgentRef agent =
                access.requireAgentOwnership(user.getId(), Validate.uuid(agentConfigId, "agentConfigId"));
        return jdbc.query(
                """
                SELECT id::text AS id, caller_number, started_at, duration_seconds, status, language,
                       outcome, summary, escalation_required
                FROM calls
                WHERE agent_config_id = ?::uuid AND business_id = ?::uuid
                ORDER BY started_at DESC
                LIMIT 50
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("callerNumber", rs.getString("caller_number"));
                    String startedAt = Rows.iso(rs, "started_at");
                    row.put("startedAt", startedAt == null ? "" : startedAt);
                    row.put("durationSeconds", Rows.intOrNull(rs, "duration_seconds"));
                    row.put("status", rs.getString("status"));
                    row.put("language", rs.getString("language"));
                    row.put("outcome", rs.getString("outcome"));
                    row.put("summary", rs.getString("summary"));
                    row.put("escalationRequired", rs.getBoolean("escalation_required"));
                    return row;
                },
                agentConfigId, agent.businessId());
    }

    /** A call's transcript (oldest line first) and its events. */
    @GetMapping("/{callId}")
    public Map<String, Object> detail(@AuthenticationPrincipal UserPrincipal user,
                                      @PathVariable String callId) {
        access.requireRowAccess(user.getId(), "calls", Validate.uuid(callId, "callId"), "Call not found.");

        List<Map<String, Object>> transcripts = jdbc.query(
                """
                SELECT id::text AS id, speaker, text, "timestamp"
                FROM call_transcripts
                WHERE call_id = ?::uuid
                ORDER BY "timestamp" ASC
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("speaker", rs.getString("speaker"));
                    row.put("text", rs.getString("text"));
                    row.put("timestamp", Rows.iso(rs, "timestamp"));
                    return row;
                },
                callId);

        List<Map<String, Object>> events = jdbc.query(
                """
                SELECT id::text AS id, event_type, created_at
                FROM call_events
                WHERE call_id = ?::uuid
                ORDER BY created_at ASC
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("eventType", rs.getString("event_type"));
                    row.put("createdAt", Rows.iso(rs, "created_at"));
                    return row;
                },
                callId);

        return Map.of("transcripts", transcripts, "events", events);
    }
}
