package com.trellient.voice.api.controllers;

import com.trellient.voice.api.access.AccessService;
import com.trellient.voice.api.security.UserPrincipal;
import com.trellient.voice.api.web.Rows;
import com.trellient.voice.api.web.Validate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/** Outbound campaigns, ported from src/lib/voice/batch.functions.ts. */
@RestController
@RequestMapping("/api/batch")
public class BatchController {

    private static final int MAX_CONTACTS = 5000;
    private static final List<String> STARTABLE = List.of("draft", "queued", "paused");

    private final JdbcTemplate jdbc;
    private final AccessService access;

    public BatchController(JdbcTemplate jdbc, AccessService access) {
        this.jdbc = jdbc;
        this.access = access;
    }

    @GetMapping
    public List<Map<String, Object>> list(@AuthenticationPrincipal UserPrincipal user,
                                          @RequestParam String businessId) {
        access.requireBusinessMembership(user.getId(), Validate.uuid(businessId, "businessId"));
        return jdbc.query(
                """
                SELECT id::text AS id, name, status, total_contacts, completed_contacts, failed_contacts,
                       agent_config_id::text AS agent_config_id, created_at, started_at, completed_at
                FROM batch_jobs
                WHERE business_id = ?::uuid
                ORDER BY created_at DESC
                """,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", rs.getString("id"));
                    row.put("name", rs.getString("name"));
                    row.put("status", rs.getString("status"));
                    row.put("totalContacts", rs.getInt("total_contacts"));
                    row.put("completedContacts", rs.getInt("completed_contacts"));
                    row.put("failedContacts", rs.getInt("failed_contacts"));
                    row.put("agentConfigId", rs.getString("agent_config_id"));
                    row.put("createdAt", Rows.iso(rs, "created_at"));
                    row.put("startedAt", Rows.iso(rs, "started_at"));
                    row.put("completedAt", Rows.iso(rs, "completed_at"));
                    return row;
                },
                businessId);
    }

    /** Creates a draft campaign and its contact list in one transaction. */
    @PostMapping
    @Transactional
    public Map<String, String> create(@AuthenticationPrincipal UserPrincipal user,
                                      @RequestBody Map<String, Object> body) {
        String businessId = Validate.uuid(str(body.get("businessId")), "businessId");
        String agentConfigId = Validate.uuid(str(body.get("agentConfigId")), "agentConfigId");
        access.requireManager(user.getId(), businessId);
        access.requireAgentInBusiness(user.getId(), agentConfigId, businessId);

        String name = Validate.text(body.get("name"), "Give the campaign a name.", 120);

        if (!(body.get("phoneNumbers") instanceof List<?> raw)) {
            throw Validate.bad("Add at least one phone number.");
        }
        if (raw.size() > MAX_CONTACTS) {
            throw Validate.bad("A campaign can hold up to " + MAX_CONTACTS + " numbers.");
        }

        // Deduplicate, keeping the order the caller sent, as the Set spread did.
        LinkedHashSet<String> numbers = new LinkedHashSet<>();
        for (Object item : raw) {
            if (item == null) continue;
            String cleaned = Validate.cleanPhoneDigits(item.toString());
            if (!cleaned.isEmpty()) numbers.add(cleaned);
        }
        if (numbers.isEmpty()) throw Validate.bad("Add at least one phone number.");

        List<String> invalid = numbers.stream().filter(n -> !Validate.PHONE.matcher(n).matches()).toList();
        if (!invalid.isEmpty()) {
            String sample = String.join(", ", invalid.subList(0, Math.min(3, invalid.size())));
            throw Validate.bad("These don't look like phone numbers: " + sample
                    + (invalid.size() > 3 ? "…" : ""));
        }

        String jobId = jdbc.queryForObject(
                """
                INSERT INTO batch_jobs (business_id, agent_config_id, name, total_contacts, created_by)
                VALUES (?::uuid, ?::uuid, ?, ?, ?::uuid)
                RETURNING id::text
                """,
                String.class, businessId, agentConfigId, name, numbers.size(), user.getId());

        List<Object[]> contacts = new ArrayList<>(numbers.size());
        for (String number : numbers) contacts.add(new Object[] {jobId, businessId, number});
        jdbc.batchUpdate(
                "INSERT INTO batch_job_contacts (batch_job_id, business_id, phone_number)"
                        + " VALUES (?::uuid, ?::uuid, ?)",
                contacts);

        return Map.of("id", jobId);
    }

    /** Starts (draft, queued or paused → running) or pauses (running → paused) a campaign. */
    @PostMapping("/{jobId}/status")
    public void setStatus(@AuthenticationPrincipal UserPrincipal user,
                          @PathVariable String jobId,
                          @RequestBody Map<String, Object> body) {
        Validate.uuid(jobId, "jobId");
        String action = Validate.oneOf(body.get("action"), List.of("start", "pause"), "action");

        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT business_id::text AS business_id, status::text AS status FROM batch_jobs WHERE id = ?::uuid",
                jobId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "That campaign no longer exists.");
        }
        access.requireManager(user.getId(), (String) rows.get(0).get("business_id"));

        String status = (String) rows.get(0).get("status");
        boolean start = action.equals("start");
        if (start && !STARTABLE.contains(status)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT, "A " + status + " campaign can't be started.");
        }
        if (!start && !status.equals("running")) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only a running campaign can be paused.");
        }

        jdbc.update(
                """
                UPDATE batch_jobs
                SET status = ?,
                    started_at = CASE WHEN ? THEN COALESCE(started_at, now()) ELSE started_at END,
                    updated_at = now()
                WHERE id = ?::uuid
                """,
                start ? "running" : "paused", start, jobId);
    }

    private static String str(Object value) {
        return value instanceof String s && !s.isBlank() ? s : null;
    }
}
