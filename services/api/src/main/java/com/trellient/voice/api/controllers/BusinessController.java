package com.trellient.voice.api.controllers;

import com.trellient.voice.api.access.AccessService;
import com.trellient.voice.api.models.Business;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.services.BusinessService;
import com.trellient.voice.api.web.Rows;
import com.trellient.voice.api.web.Validate;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/business")
public class BusinessController {

    private static final List<String> LANGUAGES = List.of("en", "hi", "mr");
    /** NOT NULL columns keep their current value when the form leaves them blank. */
    private static final List<String> REQUIRED_COLUMNS = List.of("timezone", "default_language");

    private final BusinessService businessService;
    private final JdbcTemplate jdbc;
    private final AccessService access;

    public BusinessController(BusinessService businessService, JdbcTemplate jdbc, AccessService access) {
        this.businessService = businessService;
        this.jdbc = jdbc;
        this.access = access;
    }

    @GetMapping("/me")
    public ResponseEntity<Business> getCurrentBusiness(@AuthenticationPrincipal UserPrincipal user) {
        Business business = businessService.resolveBusinessForUser(user.getId());
        return ResponseEntity.ok(business);
    }

    /**
     * Creates a workspace for the signed-in user when they are not a member of
     * one yet, and makes them its owner. Ported from provisionWorkspace() in
     * src/lib/business/provision.functions.ts, whose contract this must match
     * exactly:
     *
     *   - `companyName` is optional and defaults to "<local-part>'s workspace",
     *     because the dashboard's empty state posts an empty body.
     *   - It is idempotent: an existing member gets their workspace back with
     *     created=false rather than a 409, so a double-click cannot fail.
     *   - A new workspace is seeded with a disabled starter agent. Without it
     *     the Agents page is empty on a brand-new account.
     */
    @PostMapping("/provision")
    @Transactional
    public Map<String, Object> provisionWorkspace(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody(required = false) Map<String, Object> payload) {

        List<String> existing = jdbc.queryForList(
                """
                SELECT business_id::text FROM business_users
                WHERE auth_user_id = ?::uuid
                ORDER BY created_at ASC
                LIMIT 1
                """,
                String.class, user.getId());
        if (!existing.isEmpty()) {
            return Map.of("businessId", existing.get(0), "created", false);
        }

        String companyName = Validate.optionalText(
                payload == null ? null : payload.get("companyName"), 120);
        List<String> emails = jdbc.queryForList(
                "SELECT email FROM users WHERE id = ?::uuid", String.class, user.getId());
        String email = emails.isEmpty() ? null : emails.get(0);
        String name = companyName != null
                ? companyName
                : email != null ? email.split("@")[0] + "'s workspace" : "My workspace";

        String businessId = jdbc.queryForObject(
                """
                INSERT INTO businesses (name, email, default_language, timezone)
                VALUES (?, ?, 'en', 'Asia/Kolkata')
                RETURNING id::text
                """,
                String.class, name, email);

        jdbc.update("INSERT INTO business_users (business_id, auth_user_id, role)"
                + " VALUES (?::uuid, ?::uuid, 'owner')", businessId, user.getId());
        jdbc.update(
                """
                INSERT INTO agent_configs (business_id, name, greeting, primary_language, enabled)
                VALUES (?::uuid, 'Front desk agent',
                        'Hi, thanks for calling. How can I help you today?', 'en', false)
                """,
                businessId);

        return Map.of("businessId", businessId, "created", true);
    }

    /**
     * The signed-in user's workspace (their oldest membership) and role.
     * Ported from getBusinessContext(); returns 204 when they have none, which
     * is the null the web app returned.
     */
    @GetMapping("/context")
    public ResponseEntity<Map<String, Object>> context(@AuthenticationPrincipal UserPrincipal user) {
        List<Map<String, Object>> rows = jdbc.query(
                """
                SELECT bu.role::text AS role, b.*
                FROM business_users bu
                JOIN businesses b ON b.id = bu.business_id
                WHERE bu.auth_user_id = ?::uuid
                ORDER BY bu.created_at ASC
                LIMIT 1
                """,
                Rows.generic(), user.getId());
        if (rows.isEmpty()) return ResponseEntity.noContent().build();

        Map<String, Object> row = new LinkedHashMap<>(rows.get(0));
        Object role = row.remove("role");
        List<String> email = jdbc.queryForList(
                "SELECT email FROM users WHERE id = ?::uuid", String.class, user.getId());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("business", row);
        payload.put("role", role);
        payload.put("userId", user.getId());
        payload.put("email", email.isEmpty() ? null : email.get(0));
        return ResponseEntity.ok(payload);
    }

    /** Everyone with access to the workspace, oldest member first. */
    @GetMapping("/team")
    public List<Map<String, Object>> team(@AuthenticationPrincipal UserPrincipal user,
                                          @RequestParam String businessId) {
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));
        return jdbc.query(
                """
                SELECT id::text AS id, role::text AS role, auth_user_id::text AS auth_user_id, created_at
                FROM business_users
                WHERE business_id = ?::uuid
                ORDER BY created_at ASC
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("role", rs.getString("role"));
                    row.put("authUserId", rs.getString("auth_user_id"));
                    row.put("createdAt", Rows.iso(rs, "created_at"));
                    return row;
                },
                businessId);
    }

    /** Updates the workspace's identity. Owners and managers only. */
    @PatchMapping("/{businessId}")
    public void update(@AuthenticationPrincipal UserPrincipal user,
                       @PathVariable String businessId,
                       @RequestBody Map<String, Object> values) {
        access.requireManager(user.getId(), Validate.uuid(businessId, "businessId"));

        // Column names are literals below; only the values come from the request.
        Map<String, Object> parsed = new LinkedHashMap<>();
        parsed.put("name", Validate.text(values.get("name"), "Business name is required.", 200));
        parsed.put("legal_name", Validate.optionalText(values.get("legal_name"), 200));
        parsed.put("phone", values.get("phone") == null || blank(values.get("phone")) ? null
                : Validate.phone(values.get("phone"),
                        "Enter the main phone in international format, e.g. +918047180000."));
        parsed.put("email", email(values.get("email")));
        parsed.put("timezone", timezone(values.get("timezone")));
        parsed.put("default_language", values.get("default_language") == null
                || blank(values.get("default_language"))
                ? null
                : Validate.oneOf(values.get("default_language"), LANGUAGES, "default_language"));
        parsed.put("address", Validate.optionalText(values.get("address"), 1000));

        List<String> assignments = new ArrayList<>();
        List<Object> params = new ArrayList<>();
        for (Map.Entry<String, Object> entry : parsed.entrySet()) {
            if (entry.getValue() == null && REQUIRED_COLUMNS.contains(entry.getKey())) continue;
            assignments.add(entry.getKey() + " = ?");
            params.add(entry.getValue());
        }
        if (assignments.isEmpty()) return;

        params.add(businessId);
        jdbc.update("UPDATE businesses SET " + String.join(", ", assignments)
                + ", updated_at = now() WHERE id = ?::uuid", params.toArray());
    }

    private static boolean blank(Object value) {
        return value instanceof String s && s.trim().isEmpty();
    }

    private static String email(Object value) {
        String parsed = Validate.optionalText(value, 200);
        if (parsed == null) return null;
        // Same shape zod's .email() accepts: something@something.tld
        if (!parsed.matches("^[^@\\s]+@[^@\\s.]+(\\.[^@\\s.]+)+$")) {
            throw Validate.bad("Enter a valid contact email.");
        }
        return parsed;
    }

    private static String timezone(Object value) {
        String parsed = Validate.optionalText(value, 100);
        if (parsed == null) return null;
        if (!ZoneId.getAvailableZoneIds().contains(parsed)) {
            throw Validate.bad("Use an IANA timezone such as Asia/Kolkata.");
        }
        return parsed;
    }
}
