package com.trellient.voice.api.web;

import org.springframework.jdbc.core.RowMapper;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.sql.Array;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Column readers matching the conversions the web app did in
 * src/lib/db/pg.server.ts — timestamps as ISO strings, jsonb as parsed JSON,
 * text[] as a list — so responses keep the shape the dashboard already reads.
 */
public final class Rows {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Rows() {}

    /** A timestamptz as an ISO-8601 instant, or null. Mirrors iso(). */
    public static String iso(Object value) {
        if (value == null) return null;
        if (value instanceof OffsetDateTime odt) return odt.toInstant().toString();
        if (value instanceof Instant i) return i.toString();
        if (value instanceof java.sql.Timestamp ts) return ts.toInstant().toString();
        if (value instanceof java.util.Date d) return d.toInstant().toString();
        return value.toString();
    }

    public static String iso(ResultSet rs, String column) throws SQLException {
        return iso(rs.getObject(column, OffsetDateTime.class));
    }

    public static String str(ResultSet rs, String column) throws SQLException {
        return rs.getString(column);
    }

    /** A nullable int, kept null rather than collapsing to 0. */
    public static Integer intOrNull(ResultSet rs, String column) throws SQLException {
        int value = rs.getInt(column);
        return rs.wasNull() ? null : value;
    }

    public static List<String> textArray(ResultSet rs, String column) throws SQLException {
        Array array = rs.getArray(column);
        if (array == null) return List.of();
        Object raw = array.getArray();
        if (!(raw instanceof Object[] items)) return List.of();
        List<String> out = new ArrayList<>(items.length);
        for (Object item : items) if (item != null) out.add(item.toString());
        return out;
    }

    /** A jsonb object column as a map; an unset or non-object value gives {}. */
    public static Map<String, Object> jsonObject(ResultSet rs, String column) throws SQLException {
        String raw = rs.getString(column);
        if (raw == null || raw.isBlank()) return Map.of();
        try {
            return MAPPER.readValue(raw, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception e) {
            return Map.of();
        }
    }

    /**
     * A channel list. Rules written by an older build stored it as a JSON
     * string, or as a bare channel name; channelsOf() in alerts.functions.ts
     * accepted all three and so does this.
     */
    public static List<String> jsonStringList(ResultSet rs, String column) throws SQLException {
        String raw = rs.getString(column);
        if (raw == null || raw.isBlank()) return List.of();
        try {
            Object parsed = MAPPER.readValue(raw, Object.class);
            if (parsed instanceof List<?> list) {
                List<String> out = new ArrayList<>(list.size());
                for (Object item : list) if (item != null) out.add(item.toString());
                return out;
            }
            return Collections.singletonList(parsed.toString());
        } catch (Exception e) {
            return Collections.singletonList(raw);
        }
    }

    /**
     * Maps an arbitrary row to plain JSON-safe values, the way node-postgres
     * handed rows to the web app: arrays become lists, jsonb becomes parsed
     * JSON, timestamps and uuids become strings.
     *
     * Without this a `SELECT *` over a table with a text[] column serializes
     * the driver's PgArray as a bean, and Jackson walks
     * PgArray → ResultSet → Statement → Connection until it blows the nesting
     * limit mid-response.
     */
    public static RowMapper<Map<String, Object>> generic() {
        return (rs, rowNum) -> {
            ResultSetMetaData meta = rs.getMetaData();
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= meta.getColumnCount(); i++) {
                String label = meta.getColumnLabel(i);
                String type = meta.getColumnTypeName(i);
                row.put(label, value(rs, i, type));
            }
            return row;
        };
    }

    private static Object value(ResultSet rs, int index, String type) throws SQLException {
        if (type.startsWith("_")) {                       // text[], int[], …
            Array array = rs.getArray(index);
            if (array == null) return List.of();
            Object raw = array.getArray();
            if (!(raw instanceof Object[] items)) return List.of();
            List<Object> out = new ArrayList<>(items.length);
            for (Object item : items) out.add(item);
            return out;
        }
        if (type.equals("jsonb") || type.equals("json")) {
            return json(rs.getString(index));
        }
        if (type.startsWith("timestamp")) {
            return iso(rs.getObject(index, OffsetDateTime.class));
        }
        Object raw = rs.getObject(index);
        if (raw == null) return null;
        // uuid, enums and anything else the driver hands back as a PGobject.
        if (raw instanceof java.util.UUID || raw.getClass().getName().startsWith("org.postgresql.util.PGobject")) {
            return rs.getString(index);
        }
        return raw;
    }

    /** A jsonb column as whatever it holds — object, array or scalar. */
    private static Object json(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return MAPPER.readValue(raw, Object.class);
        } catch (Exception e) {
            return raw;
        }
    }

    public static String toJson(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialize value to JSON", e);
        }
    }
}
