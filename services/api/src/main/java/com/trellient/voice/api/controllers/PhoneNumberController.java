package com.trellient.voice.api.controllers;

import com.trellient.voice.api.access.AccessService;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.web.Rows;
import com.trellient.voice.api.web.Validate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Workspace phone numbers, ported from src/lib/telephony/phone-numbers.functions.ts. */
@RestController
@RequestMapping("/api/phone-numbers")
public class PhoneNumberController {

    private static final String PHONE_MESSAGE =
            "Enter the number in international format, e.g. +919876543210.";

    private final JdbcTemplate jdbc;
    private final AccessService access;

    public PhoneNumberController(JdbcTemplate jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal UserPrincipal user,
                                          @RequestParam String businessId) {
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));
        return jdbc.query(
                """
                SELECT id::text AS id, phone_number, label, provider, agent_config_id::text AS agent_config_id,
                       inbound_enabled, active, created_at
                FROM phone_numbers
                WHERE business_id = ?::uuid
                ORDER BY created_at ASC
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("phoneNumber", rs.getString("phone_number"));
                    row.put("label", rs.getString("label"));
                    row.put("provider", rs.getString("provider"));
                    row.put("agentConfigId", rs.getString("agent_config_id"));
                    row.put("inboundEnabled", rs.getBoolean("inbound_enabled"));
                    row.put("active", rs.getBoolean("active"));
                    row.put("createdAt", Rows.iso(rs, "created_at"));
                    return row;
                },
                businessId);
    }

    @PostMapping
    public Map<String, String> add(@AuthenticationPrincipal UserPrincipal user,
                                   @RequestBody Map<String, Object> body) {
        String businessId = Validate.uuid(str(body.get("businessId")), "businessId");
        access.requireManager(user.getId(), businessId);

        String phone = Validate.phone(body.get("phoneNumber"), PHONE_MESSAGE);
        String label = Validate.optionalText(body.get("label"), 80);
        String agentConfigId = str(body.get("agentConfigId"));
        if (agentConfigId != null) {
            access.requireAgentInBusiness(user.getId(), Validate.uuid(agentConfigId, "agentConfigId"), businessId);
        }

        String id = jdbc.queryForObject(
                """
                INSERT INTO phone_numbers (business_id, phone_number, label, agent_config_id)
                VALUES (?::uuid, ?, ?, ?::uuid)
                RETURNING id::text
                """,
                String.class, businessId, phone, label, agentConfigId);
        return Map.of("id", id);
    }

    /** Reassigns the number to an agent (or none) and/or pauses it. */
    @PatchMapping("/{phoneNumberId}")
    public void update(@AuthenticationPrincipal UserPrincipal user,
                       @PathVariable String phoneNumberId,
                       @RequestBody Map<String, Object> body) {
        String businessId = access.requireRowManager(user.getId(), "phone_numbers",
                Validate.uuid(phoneNumberId, "phoneNumberId"), "That phone number no longer exists.");

        List<String> assignments = new ArrayList<>();
        List<Object> params = new ArrayList<>();

        // Present-but-null clears the assignment; absent leaves it untouched.
        if (body.containsKey("agentConfigId")) {
            String agentConfigId = str(body.get("agentConfigId"));
            if (agentConfigId != null) {
                access.requireAgentInBusiness(user.getId(),
                        Validate.uuid(agentConfigId, "agentConfigId"), businessId);
            }
            assignments.add("agent_config_id = ?::uuid");
            params.add(agentConfigId);
        }
        if (body.containsKey("active")) {
            if (!(body.get("active") instanceof Boolean active)) {
                throw Validate.bad("Provide active as true or false.");
            }
            assignments.add("active = ?");
            params.add(active);
        }
        if (assignments.isEmpty()) return;

        params.add(phoneNumberId);
        jdbc.update("UPDATE phone_numbers SET " + String.join(", ", assignments)
                + ", updated_at = now() WHERE id = ?::uuid", params.toArray());
    }

    @DeleteMapping("/{phoneNumberId}")
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable String phoneNumberId) {
        access.requireRowManager(user.getId(), "phone_numbers", Validate.uuid(phoneNumberId, "phoneNumberId"),
                "That phone number no longer exists.");
        jdbc.update("DELETE FROM phone_numbers WHERE id = ?::uuid", phoneNumberId);
    }

    private static String str(Object value) {
        return value instanceof String s && !s.isBlank() ? s : null;
    }
}
