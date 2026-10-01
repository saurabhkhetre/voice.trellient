package com.trellient.voice.api.controllers;

import com.trellient.voice.api.access.AccessService;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.web.Rows;
import com.trellient.voice.api.web.Validate;
import com.trellient.voice.api.web.VoiceCatalog;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Agent configuration, ported from src/lib/voice/agent-configs.functions.ts. */
@RestController
@RequestMapping("/api/agents")
public class AgentConfigController {

    /** Short names older dashboard builds saved for the same providers. */
    private static final Map<String, String> PROVIDER_ALIASES =
            Map.of("openai", "openai_realtime", "gemini", "gemini_live");

    /**
     * The agent_configs columns the dashboard may change. Anything else in the
     * draft is dropped. Column names come from this list, never from the
     * request — the same guarantee editableFields gave in the web app.
     */
    private static final List<Editable> EDITABLE = List.of(
            Editable.text("name", "Give the agent a name.", 120, false),
            Editable.flag("enabled"),
            Editable.text("greeting", null, 2000, true),
            Editable.text("personality", null, 2000, true),
            Editable.text("business_description", null, 4000, true),
            Editable.text("system_instructions", null, 20000, true),
            Editable.text("primary_language", null, 10, false),
            Editable.provider("model_provider"),
            Editable.text("model_name", null, 100, false),
            Editable.text("voice_name", null, 50, false),
            Editable.number("voice_speed", 0.5, 2, false),
            Editable.flag("escalation_enabled"),
            Editable.text("escalation_rules", null, 4000, true),
            Editable.text("after_hours_response", null, 2000, true),
            Editable.number("max_call_seconds", 30, 7200, true),
            Editable.flag("recording_enabled"));

    private final JdbcTemplate jdbc;
    private final AccessService access;

    public AgentConfigController(JdbcTemplate jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    /** The agent configs for a workspace, oldest first. */
    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal UserPrincipal user,
                                          @RequestParam String businessId) {
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));
        return jdbc.query(
                "SELECT * FROM agent_configs WHERE business_id = ?::uuid ORDER BY created_at ASC",
                Rows.generic(), businessId);
    }

    /** Creates a paused, untitled agent in the workspace. */
    @PostMapping
    public Map<String, String> create(@AuthenticationPrincipal UserPrincipal user,
                                      @RequestBody Map<String, Object> body) {
        String businessId = Validate.uuid(str(body.get("businessId")), "businessId");
        access.requireManager(user.getId(), businessId);
        String id = jdbc.queryForObject(
                """
                INSERT INTO agent_configs (business_id, name, greeting, primary_language, enabled)
                VALUES (?::uuid, 'Untitled agent', 'Hi, thanks for calling. How can I help you today?', 'en', false)
                RETURNING id::text
                """,
                String.class, businessId);
        return Map.of("id", id);
    }

    /** Saves the editable fields of an agent draft. */
    @PatchMapping("/{agentConfigId}")
    public void save(@AuthenticationPrincipal UserPrincipal user,
                     @PathVariable String agentConfigId,
                     @RequestBody Map<String, Object> changes) {
        access.requireAgentManager(user.getId(), Validate.uuid(agentConfigId, "agentConfigId"));
        applyChanges(agentConfigId, changes);
    }

    /** Saves the draft, bumps the version and stores a snapshot. Owners and managers only. */
    @PostMapping("/{agentConfigId}/publish")
    @Transactional
    public Map<String, Integer> publish(@AuthenticationPrincipal UserPrincipal user,
                                        @PathVariable String agentConfigId,
                                        @RequestBody(required = false) Map<String, Object> changes) {
        access.requireAgentManager(user.getId(), Validate.uuid(agentConfigId, "agentConfigId"));

        applyChanges(agentConfigId, changes == null ? Map.of() : changes);

        Integer version = jdbc.queryForObject(
                """
                UPDATE agent_configs
                SET version = version + 1, is_draft = false, published_at = now()
                WHERE id = ?::uuid
                RETURNING version
                """,
                Integer.class, agentConfigId);

        // Snapshot the row as it now stands, after the bump.
        jdbc.update(
                """
                INSERT INTO agent_config_versions
                    (agent_config_id, business_id, version, config_snapshot, published_by)
                SELECT id, business_id, version, to_jsonb(agent_configs.*), ?::uuid
                FROM agent_configs
                WHERE id = ?::uuid
                """,
                user.getId(), agentConfigId);

        return Map.of("version", version);
    }

    /**
     * The providers the dashboard may offer, each with the models and voices
     * that provider accepts. The Model & voice tab builds its dropdowns from
     * this rather than its own copy: two lists that can drift are what let a
     * Gemini model be saved on an OpenAI agent twice.
     *
     * Membership is enough to read it — it is a static capability list, not
     * workspace data.
     */
    @GetMapping("/voice-catalog")
    public List<VoiceCatalog.Provider> voiceCatalog(@AuthenticationPrincipal UserPrincipal user,
                                                    @RequestParam String businessId) {
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));
        return VoiceCatalog.providers();
    }

    /** Live per-agent state, derived from the last 24 hours of calls. */
    @GetMapping("/runtime")
    public Map<String, Map<String, Object>> runtime(@AuthenticationPrincipal UserPrincipal user,
                                                    @RequestParam String businessId) {
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));
        List<Map<String, Object>> calls = jdbc.query(
                """
                SELECT agent_config_id::text AS agent_config_id, status::text AS status, escalation_required,
                       started_at, answered_at, ended_at
                FROM calls
                WHERE business_id = ?::uuid AND started_at >= now() - interval '24 hours'
                ORDER BY started_at DESC
                LIMIT 300
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("agentConfigId", rs.getString("agent_config_id"));
                    row.put("status", rs.getString("status"));
                    row.put("escalationRequired", rs.getBoolean("escalation_required"));
                    row.put("startedAt", Rows.iso(rs, "started_at"));
                    row.put("answeredAt", Rows.iso(rs, "answered_at"));
                    row.put("endedAt", Rows.iso(rs, "ended_at"));
                    return row;
                },
                businessId);
        return deriveAgentRuntime(calls);
    }

    /**
     * Port of deriveAgentRuntime() in src/lib/voice/runtime-status.ts. Calls
     * arrive newest first; the timestamp comes from the newest call for an
     * agent and the state is the most severe seen.
     */
    static Map<String, Map<String, Object>> deriveAgentRuntime(List<Map<String, Object>> calls) {
        List<String> rank = List.of("idle", "paused", "connecting", "streaming", "escalated");
        Map<String, Map<String, Object>> out = new LinkedHashMap<>();

        for (Map<String, Object> call : calls) {
            String id = (String) call.get("agentConfigId");
            if (id == null) continue;

            Object stamp = call.get("endedAt") != null ? call.get("endedAt")
                    : call.get("answeredAt") != null ? call.get("answeredAt")
                    : call.get("startedAt");
            String status = (String) call.get("status");
            boolean escalated = Boolean.TRUE.equals(call.get("escalationRequired"));
            boolean active = "in_progress".equals(status) || "ringing".equals(status);

            String state = "idle";
            if (active && escalated) state = "escalated";
            else if ("in_progress".equals(status)) state = "streaming";
            else if ("ringing".equals(status)) state = "connecting";

            Map<String, Object> current = out.get(id);
            if (current == null) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("state", state);
                entry.put("updatedAt", stamp);
                out.put(id, entry);
                continue;
            }
            if (rank.indexOf(state) > rank.indexOf((String) current.get("state"))) {
                current.put("state", state);
            }
        }
        return out;
    }

    /** Applies the allow-listed subset of a draft. Unknown keys are dropped. */
    private void applyChanges(String agentConfigId, Map<String, Object> changes) {
        List<String> assignments = new ArrayList<>();
        List<Object> params = new ArrayList<>();
        Map<String, Object> parsed = new LinkedHashMap<>();

        for (Editable field : EDITABLE) {
            if (!changes.containsKey(field.column())) continue;
            Object value = field.parse(changes.get(field.column()));
            if (value == Editable.SKIP) continue;
            parsed.put(field.column(), value);
            assignments.add(field.column() + " = ?");
            params.add(value);
        }
        if (assignments.isEmpty()) return;

        requireRunnableVoiceConfig(agentConfigId, parsed);

        params.add(agentConfigId);
        jdbc.update("UPDATE agent_configs SET " + String.join(", ", assignments)
                + ", updated_at = now() WHERE id = ?::uuid", params.toArray());
    }

    /**
     * Rejects a provider/model/voice combination the agent worker cannot run.
     *
     * Each field is valid on its own, so this has to look at them together —
     * and against what is already stored, because a patch usually carries only
     * the field that changed. Sending model_name alone is exactly how
     * gpt-realtime ended up on a gemini_live agent: per-field validation passed
     * and the call died on the first turn with "1007 Unsupported".
     */
    private void requireRunnableVoiceConfig(String agentConfigId, Map<String, Object> parsed) {
        boolean touchesVoiceConfig = parsed.containsKey("model_provider")
                || parsed.containsKey("model_name")
                || parsed.containsKey("voice_name");
        if (!touchesVoiceConfig) return;

        Map<String, Object> current = jdbc.queryForMap(
                "SELECT model_provider, model_name, voice_name FROM agent_configs WHERE id = ?::uuid",
                agentConfigId);

        String provider = effective(parsed, current, "model_provider");
        String model = effective(parsed, current, "model_name");
        String voice = effective(parsed, current, "voice_name");

        // A row with no provider yet runs on the worker's own default, and this
        // patch is not making that worse, so leave it to the worker.
        if (provider == null) return;
        VoiceCatalog.requireValidCombination(provider, model, voice);
    }

    /** The value this patch will leave in the column: the new one, else the stored one. */
    private static String effective(Map<String, Object> parsed, Map<String, Object> current, String column) {
        Object value = parsed.containsKey(column) ? parsed.get(column) : current.get(column);
        return value instanceof String s && !s.isBlank() ? s : null;
    }

    private static String str(Object value) {
        return value instanceof String s && !s.isBlank() ? s : null;
    }

    /** One editable column and the rule its value must satisfy. */
    private record Editable(String column, Kind kind, String message, int max,
                            boolean nullable, double min, double maxNumber, boolean integer) {

        /** Returned when a blank optional value should leave the column untouched. */
        static final Object SKIP = new Object();

        enum Kind { TEXT, FLAG, NUMBER, PROVIDER }

        static Editable text(String column, String message, int max, boolean nullable) {
            return new Editable(column, Kind.TEXT, message, max, nullable, 0, 0, false);
        }

        static Editable flag(String column) {
            return new Editable(column, Kind.FLAG, null, 0, false, 0, 0, false);
        }

        static Editable number(String column, double min, double max, boolean integer) {
            return new Editable(column, Kind.NUMBER, null, 0, false, min, max, integer);
        }

        static Editable provider(String column) {
            return new Editable(column, Kind.PROVIDER, null, 0, false, 0, 0, false);
        }

        Object parse(Object raw) {
            return switch (kind) {
                case TEXT -> {
                    if (raw == null || "".equals(raw)) {
                        // Nullable columns accept a clear; NOT NULL ones keep their value.
                        yield nullable ? null : SKIP;
                    }
                    if (!(raw instanceof String s)) throw Validate.bad("Expected text for " + column + ".");
                    String trimmed = s.trim();
                    if (message != null && trimmed.isEmpty()) throw Validate.bad(message);
                    if (trimmed.length() > max) {
                        throw Validate.bad(column + " is too long (max " + max + " characters).");
                    }
                    yield trimmed;
                }
                case FLAG -> {
                    if (!(raw instanceof Boolean b)) throw Validate.bad(column + " must be true or false.");
                    yield b;
                }
                case NUMBER -> {
                    // blankToUndefined: null and "" leave the column alone.
                    if (raw == null || "".equals(raw)) yield SKIP;
                    double value;
                    if (raw instanceof Number n) value = n.doubleValue();
                    else {
                        try {
                            value = Double.parseDouble(raw.toString());
                        } catch (NumberFormatException e) {
                            throw Validate.bad(column + " must be a number.");
                        }
                    }
                    if (value < min || value > maxNumber) {
                        throw Validate.bad(column + " must be between " + min + " and " + maxNumber + ".");
                    }
                    yield integer ? (Object) (int) value : (Object) value;
                }
                case PROVIDER -> {
                    if (!(raw instanceof String s)) throw Validate.bad("model_provider must be text.");
                    String resolved = PROVIDER_ALIASES.getOrDefault(s, s);
                    if (!VoiceCatalog.isProvider(resolved)) {
                        throw Validate.bad("model_provider must be one of: "
                                + String.join(", ", VoiceCatalog.providerValues()) + ".");
                    }
                    yield resolved;
                }
            };
        }
    }
}
