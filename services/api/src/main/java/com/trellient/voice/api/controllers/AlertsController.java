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

/** Alert rules, ported from src/lib/alerts/alerts.functions.ts. */
@RestController
@RequestMapping("/api/alerts")
public class AlertsController {

    private static final List<String> CONDITION_TYPES =
            List.of("drop_rate", "error_count", "escalation", "latency", "custom");
    private static final List<String> CHANNELS = List.of("email", "sms", "webhook");

    private final JdbcTemplate jdbc;
    private final AccessService access;

    public AlertsController(JdbcTemplate jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal UserPrincipal user,
                                          @RequestParam String businessId) {
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));
        return jdbc.query(
                """
                SELECT id::text AS id, name, condition_type, condition_config, notification_channels,
                       enabled, last_triggered_at, created_at
                FROM alert_rules
                WHERE business_id = ?::uuid
                ORDER BY created_at DESC
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("name", rs.getString("name"));
                    row.put("conditionType", rs.getString("condition_type"));
                    row.put("conditionConfig", Rows.jsonObject(rs, "condition_config"));
                    row.put("notificationChannels", Rows.jsonStringList(rs, "notification_channels"));
                    row.put("enabled", rs.getBoolean("enabled"));
                    row.put("lastTriggeredAt", Rows.iso(rs, "last_triggered_at"));
                    row.put("createdAt", Rows.iso(rs, "created_at"));
                    return row;
                },
                businessId);
    }

    @PostMapping
    public Map<String, String> create(@AuthenticationPrincipal UserPrincipal user,
                                      @RequestBody Map<String, Object> body) {
        String businessId = Validate.uuid(str(body.get("businessId")), "businessId");
        access.requireManager(user.getId(), businessId);

        String name = Validate.text(body.get("name"), "Give the rule a name.", 120);
        String conditionType = Validate.oneOf(body.get("conditionType"), CONDITION_TYPES, "conditionType");
        String channel = Validate.oneOf(body.get("channel"), CHANNELS, "channel");
        String threshold = Validate.optionalText(body.get("threshold"), 40);

        // A numeric threshold is stored as a number, anything else as the raw
        // text. A whole number stays whole, so the stored jsonb reads 15 and
        // not 15.0 the way JavaScript's Number() left it.
        Map<String, Object> config = new LinkedHashMap<>();
        if (threshold != null) {
            try {
                double numeric = Double.parseDouble(threshold);
                config.put("threshold",
                        numeric == Math.rint(numeric) && !Double.isInfinite(numeric)
                                ? (Object) (long) numeric
                                : (Object) numeric);
            } catch (NumberFormatException e) {
                config.put("threshold", threshold);
            }
        }
        if (conditionType.equals("drop_rate")) config.put("window_minutes", 60);
        if (conditionType.equals("error_count")) config.put("window_minutes", 30);

        String id = jdbc.queryForObject(
                """
                INSERT INTO alert_rules (business_id, name, condition_type, condition_config, notification_channels)
                VALUES (?::uuid, ?, ?, ?::jsonb, ?::jsonb)
                RETURNING id::text
                """,
                String.class,
                businessId, name, conditionType, Rows.toJson(config), Rows.toJson(List.of(channel)));
        return Map.of("id", id);
    }

    @PatchMapping("/{ruleId}")
    public void setEnabled(@AuthenticationPrincipal UserPrincipal user,
                           @PathVariable String ruleId,
                           @RequestBody Map<String, Object> body) {
        access.requireRowManager(user.getId(), "alert_rules", Validate.uuid(ruleId, "ruleId"),
                "That alert rule no longer exists.");
        if (!(body.get("enabled") instanceof Boolean enabled)) {
            throw Validate.bad("Provide enabled as true or false.");
        }
        jdbc.update("UPDATE alert_rules SET enabled = ?, updated_at = now() WHERE id = ?::uuid", enabled, ruleId);
    }

    @DeleteMapping("/{ruleId}")
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable String ruleId) {
        access.requireRowManager(user.getId(), "alert_rules", Validate.uuid(ruleId, "ruleId"),
                "That alert rule no longer exists.");
        jdbc.update("DELETE FROM alert_rules WHERE id = ?::uuid", ruleId);
    }

    private static String str(Object value) {
        return value instanceof String s ? s : null;
    }
}
