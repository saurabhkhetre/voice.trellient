package com.trellient.voice.api.controllers;

import com.trellient.voice.api.access.AccessService;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.web.Rows;
import com.trellient.voice.api.web.Validate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The generic record editor behind CrudSection, ported from
 * src/lib/data/records.functions.ts.
 *
 * The table and every column written come from RECORD_SCHEMAS below and never
 * from the request. That property is what makes the interpolated SQL safe, so
 * it must survive any future edit: values stay bound as parameters, and
 * identifiers only ever come from this map.
 */
@RestController
@RequestMapping("/api/records")
public class RecordsController {

    /** Business-scoped tables the editor may touch, and the columns it may write. */
    private static final Map<String, List<Field>> RECORD_SCHEMAS = Map.of(
            "customers", List.of(
                    Field.optional("name", 200),
                    Field.phone("phone", "Enter the phone in international format, e.g. +919876543210."),
                    Field.optional("email", 200),
                    Field.language("preferred_language"),
                    Field.optional("notes", 4000)),
            "business_policies", List.of(
                    Field.required("policy_type", "Type is required.", 40),
                    Field.required("title", "Title is required.", 200),
                    Field.required("content", "Policy text is required.", 8000),
                    Field.flag("active")),
            "agent_knowledge", List.of(
                    Field.required("title", "Title is required.", 200),
                    Field.required("content", "Content is required.", 20000),
                    Field.optional("source_reference", 500),
                    Field.flag("active")));

    /**
     * Record tables that hold business configuration rather than operational
     * data. The agent quotes policies and knowledge verbatim on live calls, so
     * changing them is a manager action. `customers` is left to any member:
     * updating a caller's details is ordinary call-handling work.
     */
    private static final Set<String> MANAGER_ONLY_TABLES = Set.of("business_policies", "agent_knowledge");

    private final JdbcTemplate jdbc;
    private final AccessService access;

    public RecordsController(JdbcTemplate jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    /** Every row of one record table in the workspace, newest first. */
    @GetMapping("/{table}")
    public List<Map<String, Object>> list(@AuthenticationPrincipal UserPrincipal user,
                                          @PathVariable String table,
                                          @RequestParam String businessId) {
        List<Field> fields = schemaOf(table);
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));

        String columns = fields.stream().map(Field::column).reduce((a, b) -> a + ", " + b).orElseThrow();
        return jdbc.query(
                "SELECT id, " + columns + " FROM " + table + " WHERE business_id = ?::uuid ORDER BY created_at DESC",
                Rows.generic(), businessId);
    }

    /** Creates a record, or updates it when `id` is given. */
    @PostMapping("/{table}")
    public Map<String, String> save(@AuthenticationPrincipal UserPrincipal user,
                                    @PathVariable String table,
                                    @RequestBody Map<String, Object> body) {
        List<Field> fields = schemaOf(table);
        String businessId = Validate.uuid(asString(body.get("businessId")), "businessId");
        requireWriteAccess(user.getId(), table, businessId);

        Object rawValues = body.get("values");
        if (!(rawValues instanceof Map<?, ?> valueMap)) throw Validate.bad("Provide the record's values.");

        // Every column below is a literal from RECORD_SCHEMAS; the data is bound.
        Map<String, Object> values = new LinkedHashMap<>();
        for (Field field : fields) values.put(field.column(), field.parse(valueMap.get(field.column())));

        List<String> columns = new ArrayList<>(values.keySet());
        List<Object> params = new ArrayList<>();

        String id = asString(body.get("id"));
        if (id != null) {
            Validate.uuid(id, "id");
            params.addAll(values.values());
            params.add(id);
            params.add(businessId);
            List<String> updated = jdbc.queryForList(
                    "UPDATE " + table + " SET " + String.join(" = ?, ", columns) + " = ?, updated_at = now()"
                            + " WHERE id = ?::uuid AND business_id = ?::uuid RETURNING id::text",
                    String.class, params.toArray());
            if (updated.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "That record no longer exists.");
            }
            return Map.of("id", updated.get(0));
        }

        params.add(businessId);
        params.addAll(values.values());
        String placeholders = String.join(", ", Collections.nCopies(columns.size(), "?"));
        String inserted = jdbc.queryForObject(
                "INSERT INTO " + table + " (business_id, " + String.join(", ", columns) + ")"
                        + " VALUES (?::uuid, " + placeholders + ") RETURNING id::text",
                String.class, params.toArray());
        return Map.of("id", inserted);
    }

    @DeleteMapping("/{table}/{id}")
    public void delete(@AuthenticationPrincipal UserPrincipal user,
                       @PathVariable String table,
                       @PathVariable String id,
                       @RequestParam String businessId) {
        schemaOf(table);
        // Deletion is destructive and irreversible, so it is owner/manager on
        // every record table — including customers, where an agent may still
        // create and edit. This mirrors phone_numbers and the policy tables.
        access.requireManager(user.getId(), Validate.uuid(businessId, "businessId"));
        jdbc.update("DELETE FROM " + table + " WHERE id = ?::uuid AND business_id = ?::uuid",
                Validate.uuid(id, "id"), businessId);
    }

    /**
     * Create/edit policy. Config tables need owner/manager; operational tables
     * need membership. Deletion is handled separately and is always
     * owner/manager.
     */
    private void requireWriteAccess(String userId, String table, String businessId) {
        if (MANAGER_ONLY_TABLES.contains(table)) {
            access.requireManager(userId, businessId);
        } else {
            access.requireBusinessMembership(userId, businessId);
        }
    }

    private static List<Field> schemaOf(String table) {
        List<Field> fields = RECORD_SCHEMAS.get(table);
        if (fields == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "Unknown record table. Expected one of: " + String.join(", ", RECORD_SCHEMAS.keySet()) + ".");
        }
        return fields;
    }

    private static String asString(Object value) {
        return value instanceof String s && !s.isBlank() ? s : null;
    }

    /** One writable column and the rule its value must satisfy. */
    private record Field(String column, Kind kind, String message, int max) {

        enum Kind { REQUIRED, OPTIONAL, PHONE, LANGUAGE, FLAG }

        static Field required(String column, String message, int max) {
            return new Field(column, Kind.REQUIRED, message, max);
        }

        static Field optional(String column, int max) {
            return new Field(column, Kind.OPTIONAL, null, max);
        }

        static Field phone(String column, String message) {
            return new Field(column, Kind.PHONE, message, 20);
        }

        static Field language(String column) {
            return new Field(column, Kind.LANGUAGE, null, 10);
        }

        static Field flag(String column) {
            return new Field(column, Kind.FLAG, null, 0);
        }

        Object parse(Object raw) {
            return switch (kind) {
                case REQUIRED -> Validate.text(raw, message, max);
                case OPTIONAL -> Validate.optionalText(raw, max);
                case PHONE -> Validate.phone(raw, message);
                // NOT NULL in the schema: an absent language falls back to "en".
                case LANGUAGE -> {
                    String value = Validate.optionalText(raw, max);
                    yield value == null ? "en" : value;
                }
                case FLAG -> Validate.bool(raw, false);
            };
        }
    }
}
